// Recipe aggregation, missing data, allergy filtering, plan generation/validation and replacement.
import { aggregateLines, aggregateRecipeNutrition, calculateNutrientCoverage } from '../recipes/aggregate.ts';
import { recipeRejection, productRejection } from '../diet.ts';
import { calculateTargets } from '../nutrition/targets.ts';
import { eligibleRecipes, evaluatePlan, generatePlanOptions, replaceMeal, replacementCandidates, restrictionsOf, validatePlanAgainstTargets, type PlanTargets } from '../planning/plan.ts';
import { CAT, goldenBundle, NOW } from '../../test/fixtures.ts';

function targetsFor(b = goldenBundle()): PlanTargets {
  const t = calculateTargets(b, NOW);
  if (!t.ok) throw new Error('not eligible');
  return { energyKcal: t.record.planningEnergyKcal, proteinEarG: t.record.protein.earG, proteinRdaG: t.record.protein.rdaG };
}

describe('recipe aggregation', () => {
  it('sums amount × value / 100 per ingredient', () => {
    const t = aggregateLines([{ ingredientId: 'rice', amount: 100, retentionFactor: null }, { ingredientId: 'toor_dal', amount: 50, retentionFactor: null }], CAT.ingredients);
    expect(t.energyKcal.value).toBe(350 + 170);
    expect(t.proteinG.value).toBe(7 + 11);
  });
  it('scales by servings and converts pieces explicitly', () => {
    const one = aggregateRecipeNutrition(CAT.recipes.get('boiled_eggs')!, CAT.ingredients, 1);
    const two = aggregateRecipeNutrition(CAT.recipes.get('boiled_eggs')!, CAT.ingredients, 2);
    expect(two.proteinG.value).toBeCloseTo(one.proteinG.value * 2, 1);
    // 2 eggs × 50 g × 12.6 g/100 g = 12.6 g, plus the spice mix
    expect(one.proteinG.value).toBeCloseTo(12.6 + 0.12, 1);
  });
  it('marks missing nutrient data as partial/unknown, never zero', () => {
    const t = aggregateLines([{ ingredientId: 'poha', amount: 100, retentionFactor: null }], CAT.ingredients);
    expect(t.ironMg.status).toBe('unknown');
    expect(t.fibreG.status).toBe('unknown');
    const mixed = aggregateLines([{ ingredientId: 'poha', amount: 50, retentionFactor: null }, { ingredientId: 'rice', amount: 50, retentionFactor: null }], CAT.ingredients);
    expect(mixed.ironMg.status).toBe('partial');
    expect(mixed.ironMg.knownShare).toBe(0.5);
    expect(calculateNutrientCoverage(mixed).find((c) => c.key === 'ironMg')?.approximate).toBe(true);
  });
});

describe('hard filters', () => {
  it('rejects recipes with an allergen, diet conflict or strict exclusion', () => {
    const r = { dietPattern: 'vegetarian' as const, allergies: ['peanut' as const], hardExclusions: ['okra'] };
    expect(recipeRejection(CAT.recipes.get('poha')!, CAT.ingredients, r)?.type).toBe('allergen');
    expect(recipeRejection(CAT.recipes.get('egg_curry_rice')!, CAT.ingredients, r)?.type).toBe('diet');
    expect(recipeRejection(CAT.recipes.get('roti_dal_bhindi')!, CAT.ingredients, r)?.type).toBe('exclusion');
    expect(recipeRejection(CAT.recipes.get('dal_rice')!, CAT.ingredients, r)).toBeNull();
  });
  it('applies product label allergens on top of the ingredient', () => {
    const bread = CAT.products.find((p) => p.ingredientId === 'bread_ww' && p.allergens.includes('soy'))!;
    expect(productRejection(bread, CAT.ingredients.get('bread_ww')!, { dietPattern: 'vegan', allergies: ['soy'], hardExclusions: [] })?.type).toBe('allergen');
  });
});

describe('plan generation', () => {
  const b = goldenBundle();
  const targets = targetsFor(b);
  const g = generatePlanOptions(b, targets, CAT);
  it('returns three distinct valid plans', () => {
    expect(g.ok).toBe(true);
    expect(g.plans.map((p) => p.optionKey)).toEqual(['budget', 'balanced', 'goal']);
    const sigs = g.plans.map((p) => p.meals.map((m) => m.recipeId).join());
    expect(new Set(sigs).size).toBe(3);
    for (const p of g.plans) expect(validatePlanAgainstTargets(p, b, targets, CAT)).toEqual({ valid: true, issues: [] });
  });
  it('never includes excluded or disallowed foods', () => {
    for (const p of g.plans) for (const m of p.meals) {
      const rec = CAT.recipes.get(m.recipeId)!;
      expect(rec.ingredients.some((i) => i.ingredientId === 'okra')).toBe(false);
      expect(recipeRejection(rec, CAT.ingredients, restrictionsOf(b))).toBeNull();
    }
  });
  it('budget plan is the cheapest and balanced has the most variety', () => {
    const ev = g.plans.map((p) => evaluatePlan(p, targets, CAT, 'standard'));
    expect(ev[0].weekCostInr).toBeLessThanOrEqual(Math.min(ev[1].weekCostInr, ev[2].weekCostInr));
    expect(ev[1].distinctRecipes).toBeGreaterThan(ev[0].distinctRecipes);
  });
  it('is deterministic', () => {
    expect(generatePlanOptions(b, targets, CAT)).toEqual(g);
  });
  it('reports why a plan cannot be built instead of relaxing rules', () => {
    const strict = goldenBundle({ preferences: { dietPattern: 'vegan', allergies: ['gluten', 'soy', 'peanut'], hardExclusions: ['rice', 'ragi_flour', 'moong_whole', 'jowar_flour', 'foxtail_millet', 'poha', 'besan'] } });
    const r = generatePlanOptions(strict, targetsFor(strict), CAT);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/No recipe for breakfast/);
  });
  it('replacement is scoped, keeps energy close and rejects allergens', () => {
    const plan = g.plans[1];
    const lunch = plan.meals.find((m) => m.slot === 'lunch')!;
    const cands = replacementCandidates(plan, lunch.id, b, CAT);
    expect(cands.length).toBeGreaterThan(3);
    const res = replaceMeal(plan, lunch.id, cands[0].recipe.id, null, b, CAT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.meals.filter((m, i) => m.recipeId !== plan.meals[i].recipeId)).toHaveLength(1);
    expect(Math.abs(cands[0].deltaKcal)).toBeLessThan(150);
    expect(replaceMeal(plan, lunch.id, 'chicken_curry_rice', null, b, CAT)).toEqual({ ok: false, reason: 'Chicken, boneless (raw) is not eggetarian' });
  });
  it('eligible pool respects swaps', () => {
    const vegan = goldenBundle({ preferences: { dietPattern: 'vegan' } });
    const pool = eligibleRecipes(CAT, restrictionsOf(vegan));
    expect(pool.find((r) => r.id === 'paneer_bhurji_roti')).toBeUndefined();
  });
});
