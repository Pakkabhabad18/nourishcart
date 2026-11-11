// Pantry and replenishment (PRD 10.4):
//   estimated_remaining       = opening_stock + confirmed_purchases − estimated_consumption
//   estimated_days_remaining  = estimated_remaining / expected_daily_consumption
//   estimated_reorder_date    = today + days_remaining − buffer_days
// Consumption comes from the selected plan and is labelled "planned" — we never infer
// actual intake from a purchase or a plan.
import type { Catalog, PlanDraft } from '../planning/plan.ts';
import type { SimulatedOrder } from '../orders/checkout.ts';
import type { UnitBasis } from '../types.ts';
import { round } from '../units.ts';

export interface PantryItem {
  id: string;
  profileId: string;
  ownerUserId: string;
  ingredientId: string;
  name: string;
  quantity: number; // stock at `countedAt` (opening stock for estimates)
  unit: UnitBasis;
  countedAt: string; // when the user last confirmed the quantity (or the purchase landed)
  purchasedAt: string | null;
  expiryAt: string | null;
  source: 'manual' | 'simulated_order';
  confidence: 'confirmed' | 'estimated';
  snoozedUntil: string | null;
  bufferDays: number;
}

/** Stock can never be negative. */
export function clampQuantity(q: number): number {
  return Math.max(0, round(q, 1));
}

/** Merge a CONFIRMED simulated order into the pantry. Returns new/updated items; never runs for FAILED orders. */
export function applyOrderToPantry(order: SimulatedOrder, pantry: PantryItem[], cat: Catalog, newId: () => string): PantryItem[] {
  if (order.status !== 'CONFIRMED') throw new Error('Pantry updates only after a confirmed simulated order');
  const byIng = new Map<string, number>();
  for (const l of order.lines) byIng.set(l.ingredientId, (byIng.get(l.ingredientId) ?? 0) + l.packs * l.packQty);
  const out = pantry.map((p) => ({ ...p }));
  for (const [ingredientId, qty] of byIng) {
    const ing = cat.ingredients.get(ingredientId);
    if (!ing) continue;
    const existing = out.find((p) => p.profileId === order.profileId && p.ingredientId === ingredientId);
    if (existing) {
      existing.quantity = clampQuantity(existing.quantity + qty);
      existing.purchasedAt = order.confirmedAt;
      existing.source = 'simulated_order';
      existing.confidence = 'estimated';
    } else {
      out.push({
        id: newId(),
        profileId: order.profileId,
        ownerUserId: order.ownerUserId,
        ingredientId,
        name: ing.name,
        quantity: clampQuantity(qty),
        unit: ing.unitBasis,
        countedAt: order.confirmedAt!,
        purchasedAt: order.confirmedAt,
        expiryAt: null,
        source: 'simulated_order',
        confidence: 'estimated',
        snoozedUntil: null,
        bufferDays: 2,
      });
    }
  }
  return out;
}

/** Planned daily consumption per ingredient from the selected plan (unit basis). */
export function plannedDailyConsumption(plan: PlanDraft, cat: Catalog): Map<string, number> {
  const week = new Map<string, number>();
  for (const m of plan.meals) {
    const rec = cat.recipes.get(m.recipeId);
    if (!rec) continue;
    for (const ri of rec.ingredients) {
      const s = plan.swaps[ri.ingredientId];
      const id = s ? s.ingredientId : ri.ingredientId;
      week.set(id, (week.get(id) ?? 0) + ri.amount * m.servings * (s ? s.ratio : 1));
    }
  }
  const days = Math.max(1, new Set(plan.meals.map((m) => m.day)).size);
  const daily = new Map<string, number>();
  week.forEach((v, k) => daily.set(k, v / days));
  return daily;
}

export interface ReplenishmentEstimate {
  itemId: string;
  ingredientId: string;
  name: string;
  unit: UnitBasis;
  estimatedRemaining: number;
  dailyConsumption: number | null;
  daysRemaining: number | null;
  reorderOn: string | null; // ISO date
  lowerBound: string | null;
  upperBound: string | null;
  confidence: 'low' | 'medium';
  status: 'ok' | 'due_soon' | 'out' | 'not_in_plan' | 'snoozed';
  assumptions: string[];
}

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function estimateReplenishment(items: PantryItem[], daily: Map<string, number>, now: Date): ReplenishmentEstimate[] {
  return items
    .map((it): ReplenishmentEstimate => {
      const rate = daily.get(it.ingredientId) ?? null;
      const elapsedDays = Math.max(0, (now.getTime() - new Date(it.countedAt).getTime()) / DAY_MS);
      const remaining = rate == null ? it.quantity : clampQuantity(it.quantity - rate * elapsedDays);
      const assumptions = [
        rate == null ? 'Not used in your selected plan, so no depletion is estimated.' : `Planned use about ${round(rate, 1)} ${it.unit}/day from your selected plan (planned, not confirmed).`,
        it.confidence === 'confirmed' ? `You confirmed the quantity on ${isoDate(new Date(it.countedAt))}.` : 'Quantity comes from a simulated order and has not been confirmed.',
        `Reorder buffer: ${it.bufferDays} day${it.bufferDays === 1 ? '' : 's'}.`,
      ];
      if (it.snoozedUntil && new Date(it.snoozedUntil) > now) {
        return { itemId: it.id, ingredientId: it.ingredientId, name: it.name, unit: it.unit, estimatedRemaining: remaining, dailyConsumption: rate, daysRemaining: null, reorderOn: null, lowerBound: null, upperBound: null, confidence: 'low' as const, status: 'snoozed' as const, assumptions };
      }
      if (rate == null || rate <= 0) {
        return { itemId: it.id, ingredientId: it.ingredientId, name: it.name, unit: it.unit, estimatedRemaining: remaining, dailyConsumption: null, daysRemaining: null, reorderOn: null, lowerBound: null, upperBound: null, confidence: 'low' as const, status: 'not_in_plan' as const, assumptions };
      }
      const days = remaining / rate;
      // Uncertainty widens when the quantity is unconfirmed or the count is old.
      const spread = it.confidence === 'confirmed' && elapsedDays < 7 ? 0.15 : 0.3;
      const reorder = new Date(now.getTime() + (days - it.bufferDays) * DAY_MS);
      const lower = new Date(now.getTime() + (days * (1 - spread) - it.bufferDays) * DAY_MS);
      const upper = new Date(now.getTime() + (days * (1 + spread) - it.bufferDays) * DAY_MS);
      const status: ReplenishmentEstimate['status'] = remaining <= 0 ? 'out' : days - it.bufferDays <= 2 ? 'due_soon' : 'ok';
      return {
        itemId: it.id,
        ingredientId: it.ingredientId,
        name: it.name,
        unit: it.unit,
        estimatedRemaining: remaining,
        dailyConsumption: round(rate, 1),
        daysRemaining: round(days, 1),
        reorderOn: isoDate(reorder),
        lowerBound: isoDate(lower),
        upperBound: isoDate(upper),
        confidence: spread === 0.15 ? ('medium' as const) : ('low' as const),
        status,
        assumptions,
      };
    })
    .sort((a, b) => (a.reorderOn ?? '9999').localeCompare(b.reorderOn ?? '9999') || a.name.localeCompare(b.name));
}
