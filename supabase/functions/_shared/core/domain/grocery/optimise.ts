// Basket optimiser (PRD 9.3-9.4). "Best-fit heuristic": per-ingredient exhaustive search
// over one or two compatible SKUs with bounded pack counts, minimising
//   cost + λw × leftover value + preference mismatch penalty.
// It is deterministic (ties broken by product id) but not a global integer-programming optimum.
import type { CatalogueProduct, GroceryTier, Ingredient, BudgetMode } from '../types.ts';
import { productRejection, type Restrictions } from '../diet.ts';
import type { DemandLine } from './demand.ts';
import { fromPaise, round, toPaise, unitPrice } from '../units.ts';

/** Versioned optimiser configuration. Weights live here, never in UI code. */
export const OPTIMISER_CONFIG = {
  version: 'optimiser-1.0.0',
  /** λw: share of leftover value counted as waste, by perishability. */
  wasteWeight: { daily: 0.8, fresh: 0.6, packaged: 0.2, staple: 0.05 },
  /** λp: INR penalty for a SKU outside the preferred tier. */
  tierMismatchPenaltyInr: 8,
  /** Bounded search: max packs of one SKU considered per ingredient. */
  maxPacksPerSku: 15,
  matchWeights: { identity: 0.35, form: 0.1, dietary: 0.15, preference: 0.15, packageUsability: 0.15, availability: 0.1 },
} as const;

export interface PackPick {
  productId: string;
  packs: number;
}

export interface BasketLine {
  ingredientId: string;
  name: string;
  unit: Ingredient['unitBasis'];
  demandQty: number;
  picks: PackPick[];
  coveredQty: number;
  leftoverQty: number;
  lineTotalInr: number;
  matchScore: number;
  reasons: string[];
  optional: boolean;
  sources: DemandLine['sources'];
  alternativesCount: number;
}

export type BasketStatus = 'DRAFT' | 'REVIEW' | 'OVER_BUDGET' | 'APPROVED' | 'SIMULATED_ORDER' | 'EXPIRED';

export interface BasketResult {
  lines: BasketLine[];
  unmatched: { ingredientId: string; name: string; reason: string }[];
  subtotalInr: number;
  feesKnownInr: number;
  feesNote: string;
  totalInr: number;
  budgetInr: number | null;
  budgetMode: BudgetMode;
  overBudgetByInr: number;
  status: Extract<BasketStatus, 'REVIEW' | 'OVER_BUDGET'>;
  optimiserVersion: string;
  catalogueSnapshotAt: string;
}

export interface OptimiseInput {
  demand: DemandLine[];
  restrictions: Restrictions;
  tier: GroceryTier;
  products: CatalogueProduct[];
  ingredients: Map<string, Ingredient>;
  /** ingredientId -> forced product (user picked a SKU) */
  skuOverrides?: Record<string, string>;
  /** ingredientIds where the user accepted "cheapest regardless of tier" */
  cheapestOnly?: string[];
  /** optional ingredientIds the user removed */
  removed?: string[];
  budgetInr: number | null;
  budgetMode: BudgetMode;
}

interface Combo {
  picks: PackPick[];
  costPaise: number;
  covered: number;
  objective: number;
}

/** Eligible SKUs for one ingredient: mapped, in stock, and passing every hard rule. */
export function eligibleProducts(ingredientId: string, products: CatalogueProduct[], ing: Ingredient, r: Restrictions): CatalogueProduct[] {
  return products
    .filter((p) => p.ingredientId === ingredientId && p.available && productRejection(p, ing, r) === null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Cheapest pack combination covering qty (pack-size rounding), honouring the objective weights. */
export function bestCombination(qty: number, cands: CatalogueProduct[], ing: Ingredient, tier: GroceryTier, pureCost = false): Combo | null {
  if (qty <= 0 || cands.length === 0) return null;
  const lw = pureCost ? 0 : OPTIMISER_CONFIG.wasteWeight[ing.perishability];
  const evalCombo = (picks: PackPick[]): Combo => {
    let cost = 0;
    let covered = 0;
    let penalty = 0;
    for (const pk of picks) {
      const p = cands.find((c) => c.id === pk.productId)!;
      cost += toPaise(p.priceInr) * pk.packs;
      covered += p.packQty * pk.packs;
      if (!pureCost && p.tier !== tier) penalty += toPaise(OPTIMISER_CONFIG.tierMismatchPenaltyInr);
    }
    const avgUnitPaise = cost / covered;
    const leftover = covered - qty;
    return { picks, costPaise: cost, covered, objective: cost + lw * leftover * avgUnitPaise + penalty };
  };
  let best: Combo | null = null;
  const consider = (c: Combo) => {
    if (c.covered + 1e-9 < qty) return;
    const key = (x: Combo) => x.picks.map((p) => `${p.productId}x${p.packs}`).join('|');
    if (!best || c.objective < best.objective - 1e-6 || (Math.abs(c.objective - best.objective) <= 1e-6 && key(c) < key(best))) best = c;
  };
  for (const a of cands) {
    const n = Math.ceil(qty / a.packQty);
    if (n <= OPTIMISER_CONFIG.maxPacksPerSku) consider(evalCombo([{ productId: a.id, packs: n }]));
  }
  // Bounded improvement: mix two pack sizes (e.g. one 1 kg + one 500 g).
  for (let i = 0; i < cands.length; i++) {
    for (let j = 0; j < cands.length; j++) {
      if (i === j || cands[i].packQty <= cands[j].packQty) continue;
      const big = cands[i];
      const small = cands[j];
      const maxBig = Math.min(OPTIMISER_CONFIG.maxPacksPerSku, Math.floor(qty / big.packQty));
      for (let nb = 1; nb <= maxBig; nb++) {
        const rest = qty - nb * big.packQty;
        const ns = Math.ceil(rest / small.packQty);
        if (ns > 0 && ns <= OPTIMISER_CONFIG.maxPacksPerSku) consider(evalCombo([{ productId: big.id, packs: nb }, { productId: small.id, packs: ns }]));
      }
    }
  }
  return best;
}

export function optimiseBasket(input: OptimiseInput): BasketResult {
  const lines: BasketLine[] = [];
  const unmatched: BasketResult['unmatched'] = [];
  const W = OPTIMISER_CONFIG.matchWeights;
  for (const d of input.demand) {
    if (d.toBuyQty <= 0) continue;
    if (input.removed?.includes(d.ingredientId) && d.optional) continue;
    const ing = input.ingredients.get(d.ingredientId);
    if (!ing) throw new Error(`Unknown ingredient ${d.ingredientId}`);
    const all = input.products.filter((p) => p.ingredientId === d.ingredientId);
    let cands = eligibleProducts(d.ingredientId, input.products, ing, input.restrictions);
    if (cands.length === 0) {
      const reason = all.length === 0 ? 'No simulated product is mapped to this ingredient' : all.some((p) => p.available) ? 'Every product conflicts with your allergies or diet' : 'Out of stock in the simulated catalogue';
      unmatched.push({ ingredientId: d.ingredientId, name: d.name, reason });
      continue;
    }
    const forced = input.skuOverrides?.[d.ingredientId];
    if (forced && cands.some((c) => c.id === forced)) cands = cands.filter((c) => c.id === forced);
    const combo = bestCombination(d.toBuyQty, cands, ing, input.tier, input.cheapestOnly?.includes(d.ingredientId) ?? false);
    if (!combo) {
      unmatched.push({ ingredientId: d.ingredientId, name: d.name, reason: 'Quantity exceeds the pack limit for one order' });
      continue;
    }
    const leftover = combo.covered - d.toBuyQty;
    const chosen = combo.picks.map((pk) => input.products.find((p) => p.id === pk.productId)!);
    const tierMatch = chosen.every((p) => p.tier === input.tier);
    const usability = Math.max(0, 1 - leftover / combo.covered);
    const matchScore = round(W.identity + W.form + W.dietary + W.availability + W.preference * (tierMatch ? 1 : 0.5) + W.packageUsability * usability, 2);
    const up = unitPrice(fromPaise(combo.costPaise), combo.covered, ing.unitBasis);
    const reasons = [
      'Matches the canonical ingredient exactly',
      `Covers ${round(d.toBuyQty, 0)} ${ing.unitBasis} needed; ${round(leftover, 0)} ${ing.unitBasis} left over`,
      `Effective price ₹${up.value}${up.label}`,
      tierMatch ? `${chosen[0].tier} tier, as you prefer` : `Includes a ${chosen.map((c) => c.tier).join('/')} tier pack`,
      `${cands.length} eligible pack option${cands.length === 1 ? '' : 's'} compared`,
    ];
    lines.push({
      ingredientId: d.ingredientId,
      name: d.name,
      unit: ing.unitBasis,
      demandQty: d.toBuyQty,
      picks: combo.picks,
      coveredQty: combo.covered,
      leftoverQty: round(leftover, 1),
      lineTotalInr: fromPaise(combo.costPaise),
      matchScore,
      reasons,
      optional: d.optional,
      sources: d.sources,
      alternativesCount: eligibleProducts(d.ingredientId, input.products, ing, input.restrictions).length - 1,
    });
  }
  const subtotalPaise = lines.reduce((s, l) => s + toPaise(l.lineTotalInr), 0);
  const total = fromPaise(subtotalPaise);
  const over = input.budgetInr != null ? Math.max(0, total - input.budgetInr) : 0;
  return {
    lines,
    unmatched,
    subtotalInr: total,
    feesKnownInr: 0,
    feesNote: 'Simulated basket: delivery, platform and handling fees are unknown and not included.',
    totalInr: total,
    budgetInr: input.budgetInr,
    budgetMode: input.budgetMode,
    overBudgetByInr: round(over, 2),
    status: over > 0 ? 'OVER_BUDGET' : 'REVIEW',
    optimiserVersion: OPTIMISER_CONFIG.version,
    catalogueSnapshotAt: input.products[0]?.lastCheckedAt ?? '',
  };
}
