// Budget negotiation (PRD 5.4, FR-015). Explains what drives the total and proposes
// changes the user can accept one at a time. Every alternative is a *patch* that the
// caller re-runs through the full pipeline (plan -> demand -> optimiser -> validation),
// so the savings shown are exact and nutrition is re-validated. Nutrition targets are
// never lowered: a patch that breaks plan validation is returned as blocked, with the reason.
import type { Ingredient, Recipe } from '../types.ts';
import { ingredientRejection, recipeRejection, type Restrictions } from '../diet.ts';
import type { BasketResult } from './optimise.ts';
import type { IngredientSwap, PlanDraft } from '../planning/plan.ts';
import { round } from '../units.ts';

export type AlternativeKind = 'cheaper_pack' | 'ingredient_swap' | 'meal_consolidation' | 'remove_optional' | 'raise_budget';

export interface BasketPatch {
  swaps?: Record<string, IngredientSwap>;
  mealReplacements?: { mealId: string; recipeId: string }[];
  cheapestOnly?: string[];
  removed?: string[];
}

export interface PatchEvaluation {
  totalInr: number;
  valid: boolean;
  issues: string[];
  weekProteinG: number;
  weekEnergyKcal: number;
}

export interface Alternative {
  id: string;
  kind: AlternativeKind;
  ingredientId: string | null;
  title: string;
  detail: string;
  savingsInr: number;
  newTotalInr: number;
  nutritionNote: string | null;
  proteinDeltaG: number | null; // weekly
  energyDeltaKcal: number | null; // weekly
  blocked: boolean;
  blockedReason: string | null;
  patch: BasketPatch;
}

export interface CostDriver {
  ingredientId: string;
  name: string;
  totalInr: number;
  sharePct: number;
}

export interface NegotiationContext {
  basket: BasketResult;
  plan: PlanDraft;
  restrictions: Restrictions;
  ingredients: Map<string, Ingredient>;
  recipes: Map<string, Recipe>;
  /** Current accepted patch state, so alternatives build on top of it. */
  current: BasketPatch;
  /** Re-runs the pipeline with a patch merged onto `current`. */
  evaluate: (patch: BasketPatch) => PatchEvaluation;
  baseline: PatchEvaluation;
  maxCandidates?: number;
}

export function mergePatch(a: BasketPatch, b: BasketPatch): BasketPatch {
  const repl = new Map((a.mealReplacements ?? []).map((r) => [r.mealId, r.recipeId]));
  (b.mealReplacements ?? []).forEach((r) => repl.set(r.mealId, r.recipeId));
  return {
    swaps: { ...(a.swaps ?? {}), ...(b.swaps ?? {}) },
    mealReplacements: [...repl.entries()].map(([mealId, recipeId]) => ({ mealId, recipeId })).sort((x, y) => x.mealId.localeCompare(y.mealId)),
    cheapestOnly: [...new Set([...(a.cheapestOnly ?? []), ...(b.cheapestOnly ?? [])])].sort(),
    removed: [...new Set([...(a.removed ?? []), ...(b.removed ?? [])])].sort(),
  };
}

export function costDrivers(b: BasketResult, top = 3): CostDriver[] {
  if (b.totalInr <= 0) return [];
  return [...b.lines]
    .sort((x, y) => y.lineTotalInr - x.lineTotalInr || x.ingredientId.localeCompare(y.ingredientId))
    .slice(0, top)
    .map((l) => ({ ingredientId: l.ingredientId, name: l.name, totalInr: l.lineTotalInr, sharePct: round((l.lineTotalInr / b.totalInr) * 100, 0) }));
}

function build(
  ctx: NegotiationContext,
  base: Omit<Alternative, 'savingsInr' | 'newTotalInr' | 'proteinDeltaG' | 'energyDeltaKcal' | 'blocked' | 'blockedReason' | 'nutritionNote'>,
  nutritionFixed?: string,
): Alternative | null {
  const ev = ctx.evaluate(base.patch);
  const savings = round(ctx.baseline.totalInr - ev.totalInr, 2);
  if (savings < 5) return null;
  const dp = round(ev.weekProteinG - ctx.baseline.weekProteinG, 0);
  const de = round(ev.weekEnergyKcal - ctx.baseline.weekEnergyKcal, 0);
  return {
    ...base,
    savingsInr: savings,
    newTotalInr: ev.totalInr,
    proteinDeltaG: dp,
    energyDeltaKcal: de,
    nutritionNote: nutritionFixed ?? `Week change: ${dp >= 0 ? '+' : ''}${dp} g protein, ${de >= 0 ? '+' : ''}${de} kcal (sample values).`,
    blocked: !ev.valid,
    blockedReason: ev.valid ? null : `Would break the plan: ${ev.issues[0]}`,
  };
}

export function proposeAlternatives(ctx: NegotiationContext): Alternative[] {
  const out: Alternative[] = [];
  const push = (a: Alternative | null) => a && out.push(a);
  const currentSwaps = ctx.current.swaps ?? {};
  const lines = [...ctx.basket.lines].sort((a, b) => b.lineTotalInr - a.lineTotalInr || a.ingredientId.localeCompare(b.ingredientId)).slice(0, ctx.maxCandidates ?? 10);
  const replacedMeals = new Map((ctx.current.mealReplacements ?? []).map((r) => [r.mealId, r.recipeId]));
  const effectivePlanMeals = ctx.plan.meals.map((m) => ({ ...m, recipeId: replacedMeals.get(m.id) ?? m.recipeId }));
  const basketIngredients = new Set(ctx.basket.lines.map((l) => l.ingredientId));

  for (const line of lines) {
    const ing = ctx.ingredients.get(line.ingredientId)!;
    // 1. Cheaper packs of the same ingredient (ignores tier preference only for this line).
    if (!(ctx.current.cheapestOnly ?? []).includes(line.ingredientId)) {
      push(
        build(
          ctx,
          { id: `pack:${line.ingredientId}`, kind: 'cheaper_pack', ingredientId: line.ingredientId, title: `Cheapest ${ing.name.toLowerCase()} packs`, detail: 'Same ingredient and quantity; the brand, tier or pack size changes.', patch: { cheapestOnly: [line.ingredientId] } },
          'Same ingredient, so the nutrition estimate does not change.',
        ),
      );
    }
    // 2. Declared ingredient substitutions with an explicit ratio.
    const alreadySwapped = currentSwaps[line.ingredientId] || Object.values(currentSwaps).some((s) => s.ingredientId === line.ingredientId);
    if (!alreadySwapped) {
      for (const sub of ing.substitutes) {
        const toIng = ctx.ingredients.get(sub.ingredientId);
        if (!toIng || ingredientRejection(toIng, ctx.restrictions)) continue;
        push(
          build(ctx, {
            id: `swap:${line.ingredientId}->${toIng.id}`,
            kind: 'ingredient_swap',
            ingredientId: line.ingredientId,
            title: `Use ${toIng.name.toLowerCase()} instead of ${ing.name.toLowerCase()}`,
            detail: `${sub.note}. Dishes stay the same; ${sub.ratio === 1 ? 'same weight' : `${sub.ratio} g of ${toIng.name.toLowerCase()} per g`}.`,
            patch: { swaps: { [line.ingredientId]: { ingredientId: toIng.id, ratio: sub.ratio, note: sub.note } } },
          }),
        );
      }
    }
    // 3. Meal consolidation: if only a few meals need this ingredient, swap those meals for
    //    eligible recipes made entirely from ingredients already in the basket.
    const users = effectivePlanMeals.filter((m) => ctx.recipes.get(m.recipeId)?.ingredients.some((ri) => (currentSwaps[ri.ingredientId]?.ingredientId ?? ri.ingredientId) === line.ingredientId));
    if (users.length > 0 && users.length <= 4) {
      const replacements: { mealId: string; recipeId: string }[] = [];
      for (const m of users) {
        const options = [...ctx.recipes.values()]
          .filter((r) => r.slots.includes(m.slot) && r.id !== m.recipeId && recipeRejection(r, ctx.ingredients, ctx.restrictions) === null)
          .filter((r) => r.ingredients.every((ri) => ri.ingredientId !== line.ingredientId && basketIngredients.has(currentSwaps[ri.ingredientId]?.ingredientId ?? ri.ingredientId)))
          .sort((a, b) => a.id.localeCompare(b.id));
        if (options.length === 0) break;
        // Prefer a recipe not already eaten that day.
        const sameDay = new Set(effectivePlanMeals.filter((x) => x.day === m.day).map((x) => x.recipeId));
        replacements.push({ mealId: m.id, recipeId: (options.find((o) => !sameDay.has(o.id)) ?? options[0]).id });
      }
      if (replacements.length === users.length) {
        const names = [...new Set(users.map((u) => ctx.recipes.get(u.recipeId)!.name))];
        const newNames = [...new Set(replacements.map((r) => ctx.recipes.get(r.recipeId)!.name))];
        push(
          build(ctx, {
            id: `consolidate:${line.ingredientId}`,
            kind: 'meal_consolidation',
            ingredientId: line.ingredientId,
            title: `Skip ${ing.name.toLowerCase()} by changing ${users.length} meal${users.length === 1 ? '' : 's'}`,
            detail: `Replace ${names.join(', ')} with ${newNames.join(', ')}, which use ingredients already in your basket.`,
            patch: { mealReplacements: replacements },
          }),
        );
      }
    }
    // 4. Optional garnish/side items.
    if (line.optional) {
      push(
        build(ctx, { id: `remove:${line.ingredientId}`, kind: 'remove_optional', ingredientId: line.ingredientId, title: `Skip optional ${ing.name.toLowerCase()}`, detail: 'Only used as an optional garnish or side.', patch: { removed: [line.ingredientId] } }),
      );
    }
  }
  if (ctx.basket.overBudgetByInr > 0 && ctx.basket.budgetInr != null) {
    out.push({
      id: 'raise-budget',
      kind: 'raise_budget',
      ingredientId: null,
      title: `Raise this week’s budget to ₹${Math.ceil(ctx.basket.totalInr)}`,
      detail: 'Keeps the basket as it is. Your saved budget changes only if you confirm.',
      savingsInr: 0,
      newTotalInr: ctx.basket.totalInr,
      nutritionNote: null,
      proteinDeltaG: null,
      energyDeltaKcal: null,
      blocked: false,
      blockedReason: null,
      patch: {},
    });
  }
  return out.sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.savingsInr - a.savingsInr || a.id.localeCompare(b.id));
}
