// Instamart cart builder against the sandbox MCP server: correct variants, nothing unsafe,
// explicit confirmation before checkout, and checkout called at most once.
import { planInstamartCart, pushCart, placeOrder, parseSearch } from '../commerce/instamart.ts';
import { createMockInstamart } from '../commerce/instamartMock.ts';
import { matchProductTitle } from '../commerce/match.ts';
import { runPipeline } from '../pipeline.ts';
import { generatePlanOptions } from '../planning/plan.ts';
import { calculateTargets } from '../nutrition/targets.ts';
import { CAT } from '../../lib/catalog.ts';
import { ALLERGY_SETS, DIETS, makeProfile, mulberry32 } from '../../eval/recommendations.ts';
import { goldenBundle } from '../../test/fixtures.ts';
import type { ProfileBundle } from '../types.ts';

function basketFor(b: ProfileBundle) {
  const t = calculateTargets(b);
  if (!t.ok) throw new Error('not eligible');
  const targets = { energyKcal: t.record.planningEnergyKcal, proteinEarG: t.record.protein.earG, proteinRdaG: t.record.protein.rdaG };
  const opts = generatePlanOptions(b, targets, CAT);
  if (!opts.ok) throw new Error('no plan');
  return runPipeline({ bundle: b, plan: opts.plans[0], targets, patch: {}, pantry: [], cat: CAT }).basket;
}

describe('Instamart cart builder (sandbox)', () => {
  it('reads Builders Club style search responses', () => {
    const v = parseSearch({ data: { products: [{ name: 'Toor Dal', brand: 'Tata Sampann', variants: [{ spinId: 's1', quantityDescription: '1 kg', price: { offerPrice: 165 }, inStock: true }, { spinId: 's2', quantityDescription: '500 g' }] }] } });
    expect(v).toEqual([{ spinId: 's1', title: 'Tata Sampann Toor Dal 1 kg', priceInr: 165, inStock: true }]);
  });

  it('builds a cart, reviews it, and orders once only after confirmation', async () => {
    const b = goldenBundle();
    const basket = basketFor(b);
    const mock = createMockInstamart();
    const plan = await planInstamartCart(mock.call, basket.lines, CAT.ingredients, { dietPattern: b.preferences.dietPattern!, allergies: b.preferences.allergies, hardExclusions: b.preferences.hardExclusions });
    expect(plan.items.length).toBeGreaterThan(0);
    for (const i of plan.items) expect(i.coveredQty).toBeGreaterThanOrEqual(i.demandQty);
    const review = await pushCart(mock.call, plan);
    expect(review.items.length).toBe(plan.items.length);
    await expect(placeOrder(mock.call, plan, { confirmedByUser: true, totalInr: review.totalInr + 50, itemCount: 1 })).rejects.toThrow(/changed/);
    expect(mock.checkoutCalls()).toBe(0);
    const count = review.items.reduce((s, i) => s + i.quantity, 0);
    const res = await placeOrder(mock.call, plan, { confirmedByUser: true, totalInr: review.totalInr, itemCount: count });
    expect(res.orderId).toMatch(/^SANDBOX-/);
    expect(mock.checkoutCalls()).toBe(1);
  });

  it('never puts a product that breaks diet or allergy rules into the cart, for every diet and allergy set', async () => {
    let checked = 0;
    for (const diet of DIETS) {
      for (const allergies of ALLERGY_SETS) {
        const b = makeProfile(checked + 1, diet, allergies, [], mulberry32(checked + 11));
        let basket;
        try {
          basket = basketFor(b);
        } catch {
          continue;
        }
        const mock = createMockInstamart();
        const r = { dietPattern: diet, allergies, hardExclusions: b.preferences.hardExclusions };
        const plan = await planInstamartCart(mock.call, basket.lines, CAT.ingredients, r);
        for (const item of plan.items) {
          const m = matchProductTitle(item.title, CAT.ingredients);
          const ing = CAT.ingredients.get(item.ingredientId)!;
          expect(m.ingredientId).toBe(item.ingredientId);
          expect(ing.allergens.filter((a) => allergies.includes(a))).toEqual([]);
          expect(m.markers.allergens.filter((a) => allergies.includes(a))).toEqual([]);
          if (diet !== 'non_vegetarian') expect(m.markers.meat || m.markers.fish).toBe(false);
          if (diet === 'vegetarian' || diet === 'vegan') expect(m.markers.egg).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
