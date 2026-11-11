// Recipe nutrient aggregation (PRD 7.8):
//   total = Σ amount_g × value_per_100g / 100 × retention_factor
// Unknown values stay unknown: a nutrient total is "partial" when any contributing
// ingredient lacks a value, and the known part is reported with its coverage.
import type { Ingredient, NutrientKey, NutrientValues, Recipe } from '../types.ts';
import { round } from '../units.ts';

export const NUTRIENT_KEYS: NutrientKey[] = ['energyKcal', 'proteinG', 'carbsG', 'fatG', 'fibreG', 'ironMg', 'calciumMg'];
/** Macronutrients are not reduced by retention factors; micronutrients are. */
const MICRO: NutrientKey[] = ['ironMg', 'calciumMg'];

export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: string }> = {
  energyKcal: { label: 'Energy', unit: 'kcal' },
  proteinG: { label: 'Protein', unit: 'g' },
  carbsG: { label: 'Carbohydrate', unit: 'g' },
  fatG: { label: 'Fat', unit: 'g' },
  fibreG: { label: 'Fibre', unit: 'g' },
  ironMg: { label: 'Iron', unit: 'mg' },
  calciumMg: { label: 'Calcium', unit: 'mg' },
};

export interface NutrientTotal {
  value: number; // sum of known contributions
  status: 'complete' | 'partial' | 'unknown';
  knownShare: number; // 0..1 share of ingredient weight with a known value
  approximate: boolean; // true when a micronutrient used no retention factor
}
export type NutrientTotals = Record<NutrientKey, NutrientTotal>;

export function emptyTotals(): NutrientTotals {
  const t = {} as NutrientTotals;
  for (const k of NUTRIENT_KEYS) t[k] = { value: 0, status: 'complete', knownShare: 1, approximate: false };
  return t;
}

/** Grams for an amount in the ingredient's own unit basis (explicit conversion only). */
export function gramsOf(ing: Ingredient, amount: number): number {
  if (ing.unitBasis === 'piece') {
    if (!ing.gramsPerPiece) throw new Error(`${ing.id} has no gramsPerPiece conversion`);
    return amount * ing.gramsPerPiece;
  }
  return amount; // g, or ml treated per 100 ml as stored
}

export interface AggregateLine {
  ingredientId: string;
  amount: number;
  retentionFactor: number | null;
}

export function aggregateLines(lines: AggregateLine[], ingredients: Map<string, Ingredient>): NutrientTotals {
  const totals = emptyTotals();
  const weightAll = new Map<NutrientKey, number>();
  const weightKnown = new Map<NutrientKey, number>();
  for (const line of lines) {
    const ing = ingredients.get(line.ingredientId);
    if (!ing) throw new Error(`Unknown ingredient ${line.ingredientId}`);
    const g = gramsOf(ing, line.amount);
    for (const k of NUTRIENT_KEYS) {
      weightAll.set(k, (weightAll.get(k) ?? 0) + g);
      const v: number | null = ing.nutrientsPer100[k];
      if (v == null) {
        totals[k].status = 'partial';
        continue;
      }
      weightKnown.set(k, (weightKnown.get(k) ?? 0) + g);
      let factor = 1;
      if (MICRO.includes(k)) {
        if (line.retentionFactor == null) totals[k].approximate = true;
        else factor = line.retentionFactor;
      }
      totals[k].value += (g * v * factor) / 100;
    }
  }
  for (const k of NUTRIENT_KEYS) {
    const all = weightAll.get(k) ?? 0;
    const known = weightKnown.get(k) ?? 0;
    totals[k].knownShare = all === 0 ? 1 : round(known / all, 3);
    if (all > 0 && known === 0) totals[k].status = 'unknown';
    totals[k].value = round(totals[k].value, 1);
  }
  return totals;
}

/** aggregateRecipeNutrition: nutrients for `servings` servings of a recipe. */
export function aggregateRecipeNutrition(
  recipe: Recipe,
  ingredients: Map<string, Ingredient>,
  servings = 1,
  swaps: Record<string, { ingredientId: string; ratio: number }> = {},
): NutrientTotals {
  return aggregateLines(
    recipe.ingredients.map((ri) => {
      const swap = swaps[ri.ingredientId];
      return swap
        ? { ingredientId: swap.ingredientId, amount: ri.amount * swap.ratio * servings, retentionFactor: ri.retentionFactor }
        : { ingredientId: ri.ingredientId, amount: ri.amount * servings, retentionFactor: ri.retentionFactor };
    }),
    ingredients,
  );
}

export function addTotals(a: NutrientTotals, b: NutrientTotals): NutrientTotals {
  const out = emptyTotals();
  for (const k of NUTRIENT_KEYS) {
    const rank = { complete: 0, partial: 1, unknown: 2 } as const;
    const status = rank[a[k].status] >= rank[b[k].status] ? a[k].status : b[k].status;
    out[k] = {
      value: round(a[k].value + b[k].value, 1),
      status: status === 'unknown' && (a[k].status !== 'unknown' || b[k].status !== 'unknown') ? 'partial' : status,
      knownShare: round(Math.min(a[k].knownShare, b[k].knownShare), 3),
      approximate: a[k].approximate || b[k].approximate,
    };
  }
  return out;
}

export function scaleTotals(t: NutrientTotals, factor: number): NutrientTotals {
  const out = emptyTotals();
  for (const k of NUTRIENT_KEYS) out[k] = { ...t[k], value: round(t[k].value * factor, 1) };
  return out;
}

/** calculateNutrientCoverage: how much of the plan's data is actually known, per nutrient. */
export function calculateNutrientCoverage(t: NutrientTotals): { key: NutrientKey; label: string; status: NutrientTotal['status']; knownShare: number; approximate: boolean }[] {
  return NUTRIENT_KEYS.map((k) => ({ key: k, label: NUTRIENT_META[k].label, status: t[k].status, knownShare: t[k].knownShare, approximate: t[k].approximate }));
}

export type { NutrientValues };
