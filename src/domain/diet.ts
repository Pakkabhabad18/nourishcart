// Diet-pattern and allergen rules. These are HARD filters: anything that fails is
// removed before scoring, never just penalised.
import type { Allergen, DietPattern, Ingredient, Recipe, CatalogueProduct } from './types.ts';

/** Which ingredient diet classes each pattern allows. */
const ALLOWED: Record<DietPattern, Ingredient['dietClass'][]> = {
  vegan: ['plant'],
  vegetarian: ['plant', 'dairy'],
  eggetarian: ['plant', 'dairy', 'egg'],
  non_vegetarian: ['plant', 'dairy', 'egg', 'meat', 'fish'],
};

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  dairy: 'Milk / dairy',
  egg: 'Egg',
  peanut: 'Peanut',
  tree_nut: 'Tree nuts',
  gluten: 'Gluten (wheat)',
  soy: 'Soy',
  fish: 'Fish',
  sesame: 'Sesame',
  shellfish: 'Shellfish',
};

export const DIET_LABELS: Record<DietPattern, string> = {
  vegan: 'Vegan',
  vegetarian: 'Vegetarian',
  eggetarian: 'Eggetarian',
  non_vegetarian: 'Non-vegetarian',
};

export interface Restrictions {
  dietPattern: DietPattern;
  allergies: Allergen[];
  hardExclusions: string[]; // ingredient ids
}

export type RejectReason = { type: 'diet' | 'allergen' | 'exclusion'; detail: string };

export function ingredientRejection(ing: Ingredient, r: Restrictions): RejectReason | null {
  if (!ALLOWED[r.dietPattern].includes(ing.dietClass)) {
    return { type: 'diet', detail: `${ing.name} is not ${DIET_LABELS[r.dietPattern].toLowerCase()}` };
  }
  const hit = ing.allergens.find((a) => r.allergies.includes(a));
  if (hit) return { type: 'allergen', detail: `${ing.name} contains ${ALLERGEN_LABELS[hit].toLowerCase()}` };
  if (r.hardExclusions.includes(ing.id)) return { type: 'exclusion', detail: `${ing.name} is on your strict exclusion list` };
  return null;
}

/**
 * A recipe is rejected if ANY ingredient (optional or not) breaks a rule.
 * Optional ingredients are not silently dropped to make a recipe pass: the user
 * would see a recipe card that no longer matches what they cook.
 */
export function recipeRejection(recipe: Recipe, ingredients: Map<string, Ingredient>, r: Restrictions): RejectReason | null {
  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId);
    if (!ing) return { type: 'exclusion', detail: `Unknown ingredient ${ri.ingredientId}` };
    const why = ingredientRejection(ing, r);
    if (why) return why;
  }
  return null;
}

/** Product-level check adds label/trace allergens on top of the ingredient's own. */
export function productRejection(p: CatalogueProduct, ing: Ingredient, r: Restrictions): RejectReason | null {
  const base = ingredientRejection(ing, r);
  if (base) return base;
  const hit = p.allergens.find((a) => r.allergies.includes(a));
  if (hit) return { type: 'allergen', detail: `${p.title} label lists ${ALLERGEN_LABELS[hit].toLowerCase()}` };
  return null;
}
