// Grocery demand (FR-011): consolidate canonical ingredient quantities across selected
// meals and profiles, then subtract each profile's own pantry stock exactly once.
import type { Catalog, PlanDraft } from '../planning/plan.ts';
import type { UnitBasis } from '../types.ts';
import { round } from '../units.ts';

export interface DemandSource {
  profileId: string;
  profileName: string;
  plan: PlanDraft;
  mealIds?: string[]; // subset of meals; default = whole week
}

export interface PantryStock {
  profileId: string;
  ingredientId: string;
  quantity: number; // in the ingredient's unit basis
}

export interface DemandLine {
  ingredientId: string;
  name: string;
  unit: UnitBasis;
  requiredQty: number;
  pantryQty: number;
  toBuyQty: number;
  optional: boolean; // true only if every contributing recipe line is optional
  sources: { profileId: string; profileName: string; requiredQty: number; pantryQty: number }[];
}

export function buildGroceryDemand(sources: DemandSource[], pantry: PantryStock[], cat: Catalog): DemandLine[] {
  // ingredient -> profile -> {qty, allOptional}
  const acc = new Map<string, Map<string, { name: string; qty: number; allOptional: boolean }>>();
  for (const src of sources) {
    const meals = src.mealIds ? src.plan.meals.filter((m) => src.mealIds!.includes(m.id)) : src.plan.meals;
    for (const m of meals) {
      const rec = cat.recipes.get(m.recipeId);
      if (!rec) throw new Error(`Unknown recipe ${m.recipeId}`);
      for (const ri of rec.ingredients) {
        const swap = src.plan.swaps[ri.ingredientId];
        const ingId = swap ? swap.ingredientId : ri.ingredientId;
        const amount = ri.amount * m.servings * (swap ? swap.ratio : 1);
        const perProfile = acc.get(ingId) ?? new Map();
        const cur = perProfile.get(src.profileId) ?? { name: src.profileName, qty: 0, allOptional: true };
        cur.qty += amount;
        cur.allOptional = cur.allOptional && ri.optional;
        perProfile.set(src.profileId, cur);
        acc.set(ingId, perProfile);
      }
    }
  }
  const lines: DemandLine[] = [];
  for (const [ingredientId, perProfile] of acc) {
    const ing = cat.ingredients.get(ingredientId);
    if (!ing) throw new Error(`Unknown ingredient ${ingredientId}`);
    let required = 0;
    let pantryUsed = 0;
    let allOptional = true;
    const srcs: DemandLine['sources'] = [];
    for (const [profileId, v] of perProfile) {
      const stock = pantry.filter((p) => p.profileId === profileId && p.ingredientId === ingredientId).reduce((s, p) => s + Math.max(0, p.quantity), 0);
      const used = Math.min(stock, v.qty);
      required += v.qty;
      pantryUsed += used;
      allOptional = allOptional && v.allOptional;
      srcs.push({ profileId, profileName: v.name, requiredQty: round(v.qty, 1), pantryQty: round(used, 1) });
    }
    lines.push({
      ingredientId,
      name: ing.name,
      unit: ing.unitBasis,
      requiredQty: round(required, 1),
      pantryQty: round(pantryUsed, 1),
      toBuyQty: round(Math.max(0, required - pantryUsed), 1),
      optional: allOptional,
      sources: srcs.sort((a, b) => a.profileId.localeCompare(b.profileId)),
    });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name));
}
