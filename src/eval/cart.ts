// Store-cart evaluation: builds a sandbox Instamart cart for every person in the
// recommendation sweep and checks each item against HAND LABELS of the sandbox products
// (SANDBOX_GOLD), not against the matcher that chose them. So if the matcher is wrong about
// "Egg masala noodles", this check still catches it.
import type { Ingredient } from '../domain/types.ts';
import { planInstamartCart } from '../domain/commerce/instamart.ts';
import { createMockInstamart, SANDBOX_GOLD } from '../domain/commerce/instamartMock.ts';
import { checkIngredient } from './oracle.ts';
import type { CollectedBasket } from './recommendations.ts';

export interface CartReport {
  carts: number;
  lines: number;
  itemsPlaced: number;
  linesSkipped: number;
  unsafeItems: number; // diet, allergen, exclusion, or egg/meat/fish/allergen in the product itself
  wrongProduct: number; // product is not the ingredient the line needs
  underCovered: number; // fewer grams/ml/pieces than the plan needs
  examples: string[];
}

export async function runCartEval(baskets: CollectedBasket[], ingredients: Map<string, Ingredient>): Promise<CartReport> {
  const r: CartReport = { carts: 0, lines: 0, itemsPlaced: 0, linesSkipped: 0, unsafeItems: 0, wrongProduct: 0, underCovered: 0, examples: [] };
  for (const b of baskets) {
    const mock = createMockInstamart();
    const plan = await planInstamartCart(mock.call, b.lines, ingredients, b.restrictions);
    r.carts++;
    r.lines += b.lines.filter((l) => l.demandQty > 0).length;
    r.itemsPlaced += plan.items.length;
    r.linesSkipped += plan.skipped.length;
    const u = { diet: b.restrictions.dietPattern, allergies: b.restrictions.allergies, exclusions: b.restrictions.hardExclusions };
    for (const item of plan.items) {
      const gold = SANDBOX_GOLD.get(item.spinId);
      const problems: string[] = [];
      if (!gold) problems.push('unlabelled product');
      else {
        if (!gold.ingredientIds.includes(item.ingredientId)) {
          r.wrongProduct++;
          if (r.examples.length < 10) r.examples.push(`wrong product: ${item.title} for ${item.lineName}`);
        }
        for (const id of gold.ingredientIds.length ? gold.ingredientIds : [item.ingredientId]) {
          const ing = ingredients.get(id);
          if (ing) problems.push(...checkIngredient(ing, u, item.title).map((v) => v.detail));
        }
        if (gold.allergens.some((a) => u.allergies.includes(a))) problems.push('label allergen');
        if (u.diet !== 'non_vegetarian' && (gold.meat || gold.fish)) problems.push('meat or fish');
        if ((u.diet === 'vegetarian' || u.diet === 'vegan') && gold.egg) problems.push('egg');
        if (gold.packQty != null && gold.packQty * item.quantity + 1e-6 < item.demandQty) r.underCovered++;
      }
      if (problems.length) {
        r.unsafeItems++;
        if (r.examples.length < 10) r.examples.push(`${item.title} for a ${u.diet} person: ${problems.join(', ')}`);
      }
    }
  }
  return r;
}
