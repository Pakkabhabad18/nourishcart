// Demand consolidation, pack rounding, optimiser, budget negotiation, checkout and pantry.
import { buildGroceryDemand } from '../grocery/demand.ts';
import { bestCombination, optimiseBasket } from '../grocery/optimise.ts';
import { mergePatch } from '../grocery/negotiate.ts';
import { simulateCheckout, idempotencyKeyFor, canTransitionOrder, canTransitionBasket, type StoredBasket } from '../orders/checkout.ts';
import { applyOrderToPantry, estimateReplenishment, plannedDailyConsumption, clampQuantity, type PantryItem } from '../inventory/pantry.ts';
import { calculateTargets, planTargetsFrom } from '../nutrition/targets.ts';
import { generatePlanOptions, restrictionsOf, type PlanDraft } from '../planning/plan.ts';
import { negotiate, runPipeline } from '../pipeline.ts';
import { simulatedProvider, PROVIDERS } from '../commerce/adapter.ts';
import { CAT, goldenBundle, NOW } from '../../test/fixtures.ts';

const b = goldenBundle();
const t = calculateTargets(b, NOW);
if (!t.ok) throw new Error('golden not eligible');
const targets = planTargetsFrom(t.record);
const plans = generatePlanOptions(b, targets, CAT).plans;
const tiny: PlanDraft = { optionKey: 'budget', swaps: {}, meals: [{ id: 'd0-lunch', day: 0, slot: 'lunch', recipeId: 'dal_rice', recipeVersion: 1, servings: 1 }, { id: 'd1-lunch', day: 1, slot: 'lunch', recipeId: 'dal_rice', recipeVersion: 1, servings: 2 }] };

describe('grocery demand', () => {
  it('merges duplicate ingredients across meals and profiles with attribution', () => {
    const d = buildGroceryDemand([{ profileId: 'a', profileName: 'A', plan: tiny }, { profileId: 'b', profileName: 'B', plan: tiny }], [], CAT);
    const rice = d.find((l) => l.ingredientId === 'rice')!;
    expect(rice.requiredQty).toBe(80 * 3 * 2);
    expect(rice.sources.map((s) => s.requiredQty)).toEqual([240, 240]);
  });
  it('deducts each profile pantry once and never below zero', () => {
    const d = buildGroceryDemand([{ profileId: 'a', profileName: 'A', plan: tiny }], [{ profileId: 'a', ingredientId: 'rice', quantity: 100 }, { profileId: 'b', ingredientId: 'rice', quantity: 999 }, { profileId: 'a', ingredientId: 'oil', quantity: 500 }], CAT);
    expect(d.find((l) => l.ingredientId === 'rice')).toMatchObject({ requiredQty: 240, pantryQty: 100, toBuyQty: 140 });
    expect(d.find((l) => l.ingredientId === 'oil')).toMatchObject({ toBuyQty: 0 });
  });
});

describe('optimiser', () => {
  it('rounds to whole packs and can mix pack sizes', () => {
    const ing = CAT.ingredients.get('toor_dal')!;
    const cands = CAT.products.filter((p) => p.ingredientId === 'toor_dal' && p.available);
    const c = bestCombination(1200, cands, ing, 'standard')!;
    expect(c.covered).toBeGreaterThanOrEqual(1200);
    expect(c.picks.reduce((s, p) => s + p.packs, 0)).toBeGreaterThanOrEqual(2);
  });
  it('excludes out-of-stock and allergen products', () => {
    const fish = CAT.ingredients.get('fish_rohu')!;
    const c = bestCombination(1500, CAT.products.filter((p) => p.ingredientId === 'fish_rohu' && p.available), fish, 'value')!;
    expect(c.picks.every((p) => CAT.products.find((x) => x.id === p.productId)!.available)).toBe(true);
    const d = buildGroceryDemand([{ profileId: 'a', profileName: 'A', plan: { ...tiny, meals: [{ id: 'm', day: 0, slot: 'breakfast', recipeId: 'masala_omelette_toast', recipeVersion: 1, servings: 1 }] } }], [], CAT);
    const bk = optimiseBasket({ demand: d, restrictions: { dietPattern: 'eggetarian', allergies: ['soy'], hardExclusions: [] }, tier: 'standard', products: CAT.products, ingredients: CAT.ingredients, budgetInr: null, budgetMode: 'hard' });
    const bread = bk.lines.find((l) => l.ingredientId === 'bread_ww')!;
    expect(CAT.products.find((p) => p.id === bread.picks[0].productId)!.allergens).not.toContain('soy');
  });
  it('is reproducible and totals add up', () => {
    const r1 = runPipeline({ bundle: b, plan: plans[1], targets, patch: {}, pantry: [], cat: CAT });
    const r2 = runPipeline({ bundle: b, plan: plans[1], targets, patch: {}, pantry: [], cat: CAT });
    expect(r1.basket).toEqual(r2.basket);
    expect(r1.basket.totalInr).toBeCloseTo(r1.basket.lines.reduce((s, l) => s + l.lineTotalInr, 0), 2);
  });
  it('flags hard-budget cases: under, exact and over', () => {
    const base = runPipeline({ bundle: b, plan: plans[0], targets, patch: {}, pantry: [], cat: CAT }).basket.totalInr;
    const at = (budget: number) => runPipeline({ bundle: goldenBundle({ budget: { amountInr: budget } }), plan: plans[0], targets, patch: {}, pantry: [], cat: CAT }).basket.status;
    expect(at(base + 1)).toBe('REVIEW');
    expect(at(base)).toBe('REVIEW');
    expect(at(base - 1)).toBe('OVER_BUDGET');
  });
});

describe('golden demo budget negotiation (PRD 17.3)', () => {
  it('over budget -> accept two alternatives -> under budget, plan still valid', () => {
    const input = { bundle: b, plan: plans[1], targets, patch: {}, pantry: [], cat: CAT };
    const r = runPipeline(input);
    expect(r.basket.status).toBe('OVER_BUDGET');
    const n = negotiate(input, r);
    expect(n.drivers).toHaveLength(3);
    const usable = n.alternatives.filter((a) => !a.blocked && a.kind !== 'raise_budget');
    expect(usable.length).toBeGreaterThanOrEqual(2);
    let patch = mergePatch({}, usable[0].patch);
    const second = negotiate({ ...input, patch }, runPipeline({ ...input, patch })).alternatives.filter((a) => !a.blocked && a.kind !== 'raise_budget')[0];
    patch = mergePatch(patch, second.patch);
    const after = runPipeline({ ...input, patch });
    expect(after.basket.status).toBe('REVIEW');
    expect(after.validation.valid).toBe(true);
    expect(n.alternatives.some((a) => a.kind === 'raise_budget')).toBe(true);
  });
});

function approvedBasket(): StoredBasket {
  const r = runPipeline({ bundle: b, plan: plans[0], targets, patch: {}, pantry: [], cat: CAT });
  return { id: 'bk1', profileId: 'p-golden', ownerUserId: 'u-1', version: 3, status: 'APPROVED', provider: 'SIMULATED', lines: r.basket.lines, totalInr: r.basket.totalInr, budgetInr: 1500, budgetMode: 'hard', approvedAt: NOW.toISOString(), approvedVersion: 3, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), catalogueSnapshotAt: '', planId: null };
}

describe('simulated checkout', () => {
  const base = { expectedVersion: 3, explicitConfirm: true, online: true, products: CAT.products, existingOrders: [], newId: () => 'o1', now: NOW };
  it('creates a CONFIRMED simulated order with the not-purchased label', () => {
    const r = simulateCheckout({ ...base, basket: approvedBasket() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.isSimulated).toBe(true);
    expect(r.order.label).toMatch(/NO PURCHASE PLACED/);
    expect(r.order.history.map((h) => h.status)).toEqual(['APPROVED', 'CHECKOUT_PROCESSING', 'CONFIRMED']);
  });
  it('is idempotent: a second confirm returns the same order', () => {
    const first = simulateCheckout({ ...base, basket: approvedBasket() });
    if (!first.ok) throw new Error('x');
    const again = simulateCheckout({ ...base, basket: approvedBasket(), existingOrders: [first.order], newId: () => 'o2' });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    if (again.ok) expect(again.order.id).toBe('o1');
    expect(first.order.idempotencyKey).toBe(idempotencyKeyFor('bk1', 3));
  });
  it('blocks offline, unconfirmed, unapproved, changed and tampered baskets', () => {
    expect(simulateCheckout({ ...base, basket: approvedBasket(), online: false })).toMatchObject({ ok: false, error: 'OFFLINE' });
    expect(simulateCheckout({ ...base, basket: approvedBasket(), explicitConfirm: false })).toMatchObject({ ok: false, error: 'CONFIRMATION_REQUIRED' });
    expect(simulateCheckout({ ...base, basket: { ...approvedBasket(), status: 'REVIEW' } })).toMatchObject({ ok: false, error: 'BASKET_NOT_APPROVED' });
    expect(simulateCheckout({ ...base, basket: { ...approvedBasket(), version: 4 } })).toMatchObject({ ok: false, error: 'BASKET_VERSION_CHANGED' });
    expect(simulateCheckout({ ...base, basket: { ...approvedBasket(), totalInr: 1 } })).toMatchObject({ ok: false, error: 'PRICE_MISMATCH' });
    const bk = approvedBasket();
    expect(simulateCheckout({ ...base, basket: { ...bk, budgetInr: bk.totalInr - 1 } })).toMatchObject({ ok: false, error: 'BUDGET_EXCEEDED' });
  });
  it('failed checkout produces a FAILED order and no confirmation', () => {
    const r = simulateCheckout({ ...base, basket: approvedBasket(), simulateFailure: true });
    expect(r).toMatchObject({ ok: false, error: 'SIMULATED_FAILURE' });
    if (!r.ok) expect(r.order?.status).toBe('FAILED');
  });
  it('enforces state transitions', () => {
    expect(canTransitionOrder('CONFIRMED', 'CANCELLED')).toBe(false);
    expect(canTransitionOrder('APPROVED', 'CHECKOUT_PROCESSING')).toBe(true);
    expect(canTransitionBasket('SIMULATED_ORDER', 'DRAFT')).toBe(false);
  });
});

describe('pantry and replenishment', () => {
  const order = (() => {
    const r = simulateCheckout({ basket: approvedBasket(), expectedVersion: 3, explicitConfirm: true, online: true, products: CAT.products, existingOrders: [], newId: () => 'o1', now: NOW });
    if (!r.ok) throw new Error('x');
    return r.order;
  })();
  let n = 0;
  const id = () => `pi${++n}`;
  it('adds purchased quantities only after a confirmed order', () => {
    const pantry = applyOrderToPantry(order, [], CAT, id);
    const rice = pantry.find((p) => p.ingredientId === 'rice')!;
    expect(rice.quantity).toBeGreaterThan(0);
    expect(rice.source).toBe('simulated_order');
    expect(() => applyOrderToPantry({ ...order, status: 'FAILED' }, [], CAT, id)).toThrow();
  });
  it('estimates depletion from planned use with a range and confidence', () => {
    const daily = plannedDailyConsumption(plans[0], CAT);
    const item: PantryItem = { id: 'x', profileId: 'p', ownerUserId: 'u', ingredientId: 'rice', name: 'Rice', quantity: 1000, unit: 'g', countedAt: NOW.toISOString(), purchasedAt: null, expiryAt: null, source: 'manual', confidence: 'confirmed', snoozedUntil: null, bufferDays: 2 };
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    const [e] = estimateReplenishment([item], daily, later);
    const rate = daily.get('rice')!;
    expect(e.estimatedRemaining).toBeCloseTo(clampQuantity(1000 - rate * 2), 0);
    expect(e.lowerBound! <= e.reorderOn! && e.reorderOn! <= e.upperBound!).toBe(true);
    expect(e.confidence).toBe('medium');
    const [unused] = estimateReplenishment([{ ...item, ingredientId: 'makhana' }], daily, later);
    expect(unused.status).toBe('not_in_plan');
    const [snoozed] = estimateReplenishment([{ ...item, snoozedUntil: '2099-01-01' }], daily, later);
    expect(snoozed.status).toBe('snoozed');
  });
  it('never lets stock go negative', () => {
    expect(clampQuantity(-5)).toBe(0);
  });
});

describe('provider adapters', () => {
  it('simulated provider works; disabled providers refuse without network', async () => {
    const s = await simulatedProvider.searchProducts('paneer');
    expect(s.ok && s.data.length).toBeGreaterThan(0);
    for (const p of PROVIDERS.filter((x) => !x.enabled)) expect(await p.checkout()).toMatchObject({ ok: false, code: 'DISABLED' });
    expect(await simulatedProvider.checkout()).toMatchObject({ ok: false, code: 'NOT_SUPPORTED' });
  });
  it('restrictions helper requires a diet pattern', () => {
    expect(() => restrictionsOf(goldenBundle({ preferences: { dietPattern: null } }))).toThrow();
  });
});
