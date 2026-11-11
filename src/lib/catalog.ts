// The bundled reference data. The same files are synced to Edge Functions and seeded into
// Postgres (scripts/generate-seed.mjs), so all three always share one version.
import { RECIPE_MAP } from '../data/recipes.ts';
import { INGREDIENT_MAP } from '../data/ingredients.ts';
import { CATALOGUE } from '../data/catalogue.ts';
import type { Catalog } from '../domain/planning/plan.ts';

export const CAT: Catalog = { recipes: RECIPE_MAP, ingredients: INGREDIENT_MAP, products: CATALOGUE };
