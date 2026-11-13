// Independent checker ("oracle") for the evaluation suite.
// It deliberately does NOT reuse the app's filter or nutrition functions: it re-derives
// every rule from the raw ingredient data, so a bug in the app's own filter cannot hide
// itself. If the app and the oracle disagree, the evaluation fails.
import type { Allergen, CatalogueProduct, DietPattern, Ingredient, NutrientKey, Recipe } from '../domain/types.ts';
import type { PlanDraft } from '../domain/planning/plan.ts';
import type { BasketResult } from '../domain/grocery/optimise.ts';

const ALLOWED_CLASSES: Record<DietPattern, Ingredient['dietClass'][]> = {
  vegan: ['plant'],
  vegetarian: ['plant', 'dairy'],
  eggetarian: ['plant', 'dairy', 'egg'],
  non_vegetarian: ['plant', 'dairy', 'egg', 'meat', 'fish'],
};

export interface UserRules {
  diet: DietPattern;
  allergies: Allergen[];
  exclusions: string[];
}

export interface Violation {
  rule: 'diet' | 'allergen' | 'exclusion' | 'product_allergen' | 'product_diet';
  where: string;
  detail: string;
}

/** Every ingredient that will actually be cooked for a planned meal, after swaps. */
export function cookedIngredientIds(recipe: Recipe, swaps: PlanDraft['swaps']): string[] {
  return recipe.ingredients.map((ri) => swaps[ri.ingredientId]?.ingredientId ?? ri.ingredientId);
}

export function checkIngredient(ing: Ingredient, u: UserRules, where: string): Violation[] {
  const v: Violation[] = [];
  if (!ALLOWED_CLASSES[u.diet].includes(ing.dietClass)) v.push({ rule: 'diet', where, detail: `${ing.name} (${ing.dietClass}) in a ${u.diet} plan` });
  for (const a of ing.allergens) if (u.allergies.includes(a)) v.push({ rule: 'allergen', where, detail: `${ing.name} contains ${a}` });
  if (u.exclusions.includes(ing.id)) v.push({ rule: 'exclusion', where, detail: `${ing.name} is excluded` });
  return v;
}

export function checkPlan(plan: PlanDraft, u: UserRules, recipes: Map<string, Recipe>, ingredients: Map<string, Ingredient>): Violation[] {
  const out: Violation[] = [];
  for (const m of plan.meals) {
    const r = recipes.get(m.recipeId)!;
    for (const id of cookedIngredientIds(r, plan.swaps)) out.push(...checkIngredient(ingredients.get(id)!, u, `${m.id} ${r.name}`));
  }
  return out;
}

export function checkBasket(b: BasketResult, u: UserRules, products: CatalogueProduct[], ingredients: Map<string, Ingredient>): Violation[] {
  const out: Violation[] = [];
  for (const line of b.lines) {
    for (const pk of line.picks) {
      const p = products.find((x) => x.id === pk.productId)!;
      const ing = ingredients.get(p.ingredientId)!;
      for (const v of checkIngredient(ing, u, `basket ${p.title}`)) out.push({ ...v, rule: v.rule === 'diet' ? 'product_diet' : v.rule === 'allergen' ? 'product_allergen' : v.rule });
      for (const a of p.allergens) if (u.allergies.includes(a)) out.push({ rule: 'product_allergen', where: `basket ${p.title}`, detail: `label lists ${a}` });
      if (!p.available) out.push({ rule: 'product_diet', where: `basket ${p.title}`, detail: 'out-of-stock product selected' });
    }
  }
  return out;
}

/** Independent day-energy and protein sums (plain Σ grams × value / 100). */
export function dayTotals(plan: PlanDraft, day: number, recipes: Map<string, Recipe>, ingredients: Map<string, Ingredient>): { kcal: number; protein: number; unknownFor: NutrientKey[] } {
  let kcal = 0;
  let protein = 0;
  const unknown = new Set<NutrientKey>();
  for (const m of plan.meals.filter((x) => x.day === day)) {
    const r = recipes.get(m.recipeId)!;
    for (const ri of r.ingredients) {
      const s = plan.swaps[ri.ingredientId];
      const ing = ingredients.get(s?.ingredientId ?? ri.ingredientId)!;
      const amount = ri.amount * m.servings * (s?.ratio ?? 1);
      const grams = ing.unitBasis === 'piece' ? amount * (ing.gramsPerPiece ?? 0) : amount;
      kcal += (grams * (ing.nutrientsPer100.energyKcal ?? 0)) / 100;
      protein += (grams * (ing.nutrientsPer100.proteinG ?? 0)) / 100;
      for (const [k, v] of Object.entries(ing.nutrientsPer100)) if (v == null) unknown.add(k as NutrientKey);
    }
  }
  return { kcal, protein, unknownFor: [...unknown] };
}
