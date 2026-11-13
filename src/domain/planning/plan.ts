// Meal planning engine (PRD 8). Deterministic: same inputs -> same plans.
// Order of operations follows PRD 8.3: hard filters first, then scoring, then
// day assembly, portion scaling, validation and explanation.
import type { GroceryTier, Ingredient, MealSlot, ProfileBundle, Recipe, CatalogueProduct } from '../types.ts';
import { recipeRejection, type Restrictions } from '../diet.ts';
import { aggregateRecipeNutrition, addTotals, emptyTotals, type NutrientTotals } from '../recipes/aggregate.ts';
import { round } from '../units.ts';

export const PLANNER_VERSION = 'planner-1.0.0';
export const DAYS = 7;
export const SERVING_STEP = 0.25;
export const SERVING_MIN = 0.5;
export const SERVING_MAX = 3;
/** A day is accepted when energy is within ±10% of the planning estimate. */
export const ENERGY_TOLERANCE = 0.1;

export type OptionKey = 'budget' | 'balanced' | 'goal';
export const OPTION_META: Record<OptionKey, { label: string; emphasis: string }> = {
  budget: { label: 'Budget Optimised', emphasis: 'Lowest grocery spend and waste, using affordable staples. Repeats a few dishes to allow batch cooking.' },
  balanced: { label: 'Balanced', emphasis: 'More variety across the week and more food groups each day, at a practical cost.' },
  goal: { label: 'Goal Aligned', emphasis: 'Leans towards your selected goal and the foods you like, within the same safety rules.' },
};

export interface PlannedMeal {
  id: string; // stable within a plan: d{day}-{slot}
  day: number; // 0..6
  slot: MealSlot;
  recipeId: string;
  recipeVersion: number;
  servings: number;
}

export interface IngredientSwap {
  ingredientId: string;
  ratio: number;
  note: string;
}

export interface PlanDraft {
  optionKey: OptionKey;
  meals: PlannedMeal[];
  swaps: Record<string, IngredientSwap>; // original ingredient id -> substitute
}

export interface PlanTargets {
  energyKcal: number;
  proteinEarG: number;
  proteinRdaG: number;
}

export interface Catalog {
  recipes: Map<string, Recipe>;
  ingredients: Map<string, Ingredient>;
  products: CatalogueProduct[];
}

// ---------------------------------------------------------------- costs

/**
 * Per-unit planning cost for an ingredient (INR per g / ml / piece), from the cheapest
 * available simulated SKU of the preferred tier (falling back to any available tier).
 * Used for plan cost estimates before pack rounding; the basket optimiser does the real pack maths.
 */
export function ingredientUnitCost(ingredientId: string, tier: GroceryTier, products: CatalogueProduct[]): number | null {
  const avail = products.filter((p) => p.ingredientId === ingredientId && p.available);
  if (avail.length === 0) return null;
  const pool = avail.filter((p) => p.tier === tier).length ? avail.filter((p) => p.tier === tier) : avail;
  return Math.min(...pool.map((p) => p.priceInr / p.packQty));
}

function swappedLines(recipe: Recipe, servings: number, swaps: Record<string, IngredientSwap>) {
  return recipe.ingredients.map((ri) => {
    const s = swaps[ri.ingredientId];
    return s
      ? { ingredientId: s.ingredientId, amount: ri.amount * s.ratio * servings, optional: ri.optional }
      : { ingredientId: ri.ingredientId, amount: ri.amount * servings, optional: ri.optional };
  });
}

export function mealCost(recipe: Recipe, servings: number, swaps: Record<string, IngredientSwap>, tier: GroceryTier, products: CatalogueProduct[]): number {
  let c = 0;
  for (const l of swappedLines(recipe, servings, swaps)) c += (ingredientUnitCost(l.ingredientId, tier, products) ?? 0) * l.amount;
  return c;
}

// ---------------------------------------------------------------- eligibility

export function restrictionsOf(b: ProfileBundle): Restrictions {
  if (!b.preferences.dietPattern) throw new Error('dietPattern required');
  return { dietPattern: b.preferences.dietPattern, allergies: b.preferences.allergies, hardExclusions: b.preferences.hardExclusions };
}

export function slotsFor(mealsPerDay: 3 | 4): MealSlot[] {
  return mealsPerDay === 4 ? ['breakfast', 'lunch', 'snack', 'dinner'] : ['breakfast', 'lunch', 'dinner'];
}

/** Recipes that pass every hard rule. Swaps are applied first so a substituted ingredient is what gets checked. */
export function eligibleRecipes(cat: Catalog, r: Restrictions, swaps: Record<string, IngredientSwap> = {}): Recipe[] {
  return [...cat.recipes.values()]
    .filter((rec) => {
      const swapped: Recipe = { ...rec, ingredients: rec.ingredients.map((ri) => (swaps[ri.ingredientId] ? { ...ri, ingredientId: swaps[ri.ingredientId].ingredientId } : ri)) };
      return recipeRejection(swapped, cat.ingredients, r) === null;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------- scoring

interface RecipeFacts {
  recipe: Recipe;
  kcal: number;
  protein: number;
  fibre: number;
  cost: number;
  groups: Set<string>;
}

function factsFor(recipe: Recipe, cat: Catalog, tier: GroceryTier): RecipeFacts {
  const t = aggregateRecipeNutrition(recipe, cat.ingredients, 1);
  const groups = new Set(recipe.ingredients.map((ri) => cat.ingredients.get(ri.ingredientId)?.foodGroup ?? 'other').filter((g) => g !== 'fat' && g !== 'condiment'));
  return { recipe, kcal: t.energyKcal.value, protein: t.proteinG.value, fibre: t.fibreG.value, cost: mealCost(recipe, 1, {}, tier, cat.products), groups };
}

interface ScoreCtx {
  option: OptionKey;
  b: ProfileBundle;
  usedThisWeek: Map<string, number>;
  usedYesterday: Set<string>;
  groupsToday: Set<string>;
  usedInEarlierOptions: Set<string>;
}

/** Higher is better. Weights per option are the only thing that differs between plans. */
function score(f: RecipeFacts, ctx: ScoreCtx): number {
  const costPer100 = f.kcal > 0 ? (f.cost / f.kcal) * 100 : 99;
  const proteinPer100 = f.kcal > 0 ? (f.protein / f.kcal) * 100 : 0;
  const fibrePer100 = f.kcal > 0 ? (f.fibre / f.kcal) * 100 : 0;
  const uses = ctx.usedThisWeek.get(f.recipe.id) ?? 0;
  const newGroups = [...f.groups].filter((g) => !ctx.groupsToday.has(g)).length;
  const prefs = ctx.b.preferences;
  const likes = prefs.likes.includes(f.recipe.id) ? 1 : 0;
  const dislikeHits = f.recipe.ingredients.filter((ri) => prefs.dislikes.includes(ri.ingredientId)).length;
  const overTime = Math.max(0, f.recipe.prepMinutes - prefs.maxCookMinutes);
  const goal = ctx.b.goals.goal;
  let s = 0;
  switch (ctx.option) {
    case 'budget':
      s = -costPer100 * 3 - uses * 0.6 - (ctx.usedYesterday.has(f.recipe.id) ? 0.4 : 0) + newGroups * 0.1;
      break;
    case 'balanced':
      s = -costPer100 * 0.8 - uses * 2.5 - (ctx.usedYesterday.has(f.recipe.id) ? 2 : 0) + newGroups * 0.6 + fibrePer100 * 0.3;
      break;
    case 'goal':
      s = -costPer100 * 0.8 - uses * 1.4 - (ctx.usedYesterday.has(f.recipe.id) ? 1 : 0) + newGroups * 0.2 + likes * 1.5;
      if (goal === 'muscle_fitness') s += proteinPer100 * 0.9;
      else if (goal === 'weight_management') s += fibrePer100 * 0.8 + proteinPer100 * 0.4;
      else if (goal === 'budget_first') s += -costPer100 * 2;
      else s += fibrePer100 * 0.3 + newGroups * 0.3;
      break;
  }
  s += likes * 0.4 - dislikeHits * 1.2 - overTime * 0.05;
  if (ctx.usedInEarlierOptions.has(f.recipe.id)) s -= ctx.option === 'budget' ? 0 : 0.6;
  return s;
}

// ---------------------------------------------------------------- generation

export function roundServings(x: number): number {
  const r = Math.round(x / SERVING_STEP) * SERVING_STEP;
  return Math.min(SERVING_MAX, Math.max(SERVING_MIN, r));
}

export interface GenerateResult {
  ok: boolean;
  plans: PlanDraft[];
  reasons: string[];
  /** Shown with the comparison, e.g. when fewer than three distinct weeks are possible. */
  notes: string[];
}

export function generatePlanOptions(b: ProfileBundle, targets: PlanTargets, cat: Catalog, addSnack = false): GenerateResult {
  const r = restrictionsOf(b);
  const pool = eligibleRecipes(cat, r);
  const slots = slotsFor(addSnack ? 4 : b.preferences.mealsPerDay);
  const reasons: string[] = [];
  const bySlot = new Map<MealSlot, RecipeFacts[]>();
  for (const slot of slots) {
    const list = pool.filter((rec) => rec.slots.includes(slot)).map((rec) => factsFor(rec, cat, b.preferences.groceryTier));
    if (list.length === 0) reasons.push(`No recipe for ${slot} fits your food pattern, allergies and exclusions.`);
    bySlot.set(slot, list);
  }
  if (reasons.length) return { ok: false, plans: [], reasons, notes: [] };

  const usedInEarlierOptions = new Set<string>();
  const plans: PlanDraft[] = [];
  for (const option of ['budget', 'balanced', 'goal'] as OptionKey[]) {
    const meals: PlannedMeal[] = [];
    const usedThisWeek = new Map<string, number>();
    let usedYesterday = new Set<string>();
    for (let day = 0; day < DAYS; day++) {
      const groupsToday = new Set<string>();
      const today = new Set<string>();
      const picked: RecipeFacts[] = [];
      for (const slot of slots) {
        const ranked = [...(bySlot.get(slot) ?? [])]
          .filter((f) => !today.has(f.recipe.id))
          .map((f) => ({ f, s: score(f, { option, b, usedThisWeek, usedYesterday, groupsToday, usedInEarlierOptions }) }))
          .sort((x, y) => y.s - x.s || x.f.recipe.id.localeCompare(y.f.recipe.id));
        const choice = ranked[0].f;
        picked.push(choice);
        today.add(choice.recipe.id);
        choice.groups.forEach((g) => groupsToday.add(g));
        usedThisWeek.set(choice.recipe.id, (usedThisWeek.get(choice.recipe.id) ?? 0) + 1);
      }
      // Portion scaling: one factor for the day so every meal keeps its share.
      const dayKcal = picked.reduce((s, f) => s + f.kcal, 0);
      const factor = targets.energyKcal / dayKcal;
      picked.forEach((f, i) =>
        meals.push({ id: `d${day}-${slots[i]}`, day, slot: slots[i], recipeId: f.recipe.id, recipeVersion: f.recipe.version, servings: roundServings(factor) }),
      );
      usedYesterday = today;
    }
    const draft: PlanDraft = { optionKey: option, meals: fitPortions({ optionKey: option, meals, swaps: {} }, targets, cat), swaps: {} };
    draft.meals.forEach((m) => usedInEarlierOptions.add(m.recipeId));
    plans.push(draft);
  }
  // Never show two identical weeks as different options (FR-008). With very few allowed
  // recipes, fewer than three distinct weeks exist; say so instead of padding.
  const seen = new Set<string>();
  const distinct = plans.filter((p) => {
    const sig = p.meals.map((m) => `${m.recipeId}x${m.servings}`).join();
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
  // Energy check: high needs with 3 meals can exceed sensible portions. First add a daily
  // snack (and say so); if a plan still misses, drop it rather than show it as valid.
  const energyOk = (p: PlanDraft) => evaluatePlan(p, targets, cat, b.preferences.groceryTier).days.every((d) => d.energyOk && d.proteinOk);
  if (!addSnack && slots.length === 3 && !distinct.every(energyOk)) {
    const withSnack = generatePlanOptions(b, targets, cat, true);
    withSnack.notes.unshift(`A daily snack was added: ${targets.energyKcal.toLocaleString('en-IN')} kcal is hard to reach in 3 meals at normal portion sizes.`);
    return withSnack;
  }
  const valid = distinct.filter(energyOk);
  if (valid.length === 0)
    return { ok: false, plans: [], notes: [], reasons: [`Your energy estimate (${targets.energyKcal.toLocaleString('en-IN')} kcal a day) is higher than our current recipes can reach at sensible portion sizes with your food rules. We will not show a plan that misses it.`] };
  const notes: string[] = [];
  if (valid.length < distinct.length) notes.push('Some plan options could not meet your energy or protein checks and were left out.');
  if (distinct.length < plans.length) notes.push(`Your food rules allow only ${pool.length} recipes, so ${distinct.length === 1 ? 'one week plan is' : `${distinct.length} different week plans are`} possible instead of three. Removing a non-allergy exclusion would add more choice.`);
  return { ok: true, plans: valid, reasons, notes };
}

/**
 * Nudges servings one meal at a time (largest meal first, in 0.25 steps) until each day's
 * energy is within tolerance. Bounded and deterministic.
 */
export function fitPortions(plan: PlanDraft, targets: PlanTargets, cat: Catalog): PlannedMeal[] {
  const meals = plan.meals.map((m) => ({ ...m }));
  for (let day = 0; day < DAYS; day++) {
    for (let iter = 0; iter < 40; iter++) {
      const dayMeals = meals.filter((m) => m.day === day);
      if (dayMeals.length === 0) break;
      const kcalOf = (m: PlannedMeal) => aggregateRecipeNutrition(cat.recipes.get(m.recipeId)!, cat.ingredients, m.servings, plan.swaps).energyKcal.value;
      const total = dayMeals.reduce((s, m) => s + kcalOf(m), 0);
      const diff = targets.energyKcal - total;
      if (Math.abs(diff) <= targets.energyKcal * ENERGY_TOLERANCE * 0.5) break;
      const ordered = [...dayMeals].sort((a, b) => kcalOf(b) - kcalOf(a) || a.id.localeCompare(b.id));
      const target = ordered.find((m) => (diff > 0 ? m.servings < SERVING_MAX : m.servings > SERVING_MIN));
      if (!target) break;
      target.servings = roundServings(target.servings + (diff > 0 ? SERVING_STEP : -SERVING_STEP));
    }
  }
  return meals;
}

// ---------------------------------------------------------------- evaluation

export interface DayEvaluation {
  day: number;
  totals: NutrientTotals;
  costInr: number;
  energyOk: boolean;
  proteinOk: boolean;
  mealProtein: { mealId: string; proteinG: number }[];
}

export interface PlanEvaluation {
  days: DayEvaluation[];
  week: NutrientTotals;
  dailyAverage: { energyKcal: number; proteinG: number; carbsG: number; fatG: number; fibreG: number; ironMg: number; calciumMg: number };
  weekCostInr: number;
  dayCostInr: number;
  distinctRecipes: number;
  foodGroupsPerDay: number;
  avgPrepMinutes: number;
  valid: boolean;
  issues: string[];
  confidence: 'low' | 'medium';
}

export function evaluatePlan(plan: PlanDraft, targets: PlanTargets, cat: Catalog, tier: GroceryTier): PlanEvaluation {
  const days: DayEvaluation[] = [];
  let week = emptyTotals();
  let weekCost = 0;
  let groupsSum = 0;
  let prepSum = 0;
  const issues: string[] = [];
  for (let day = 0; day < DAYS; day++) {
    let totals = emptyTotals();
    let cost = 0;
    const groups = new Set<string>();
    const mealProtein: DayEvaluation['mealProtein'] = [];
    for (const m of plan.meals.filter((x) => x.day === day)) {
      const rec = cat.recipes.get(m.recipeId);
      if (!rec) throw new Error(`Unknown recipe ${m.recipeId}`);
      const t = aggregateRecipeNutrition(rec, cat.ingredients, m.servings, plan.swaps);
      totals = addTotals(totals, t);
      mealProtein.push({ mealId: m.id, proteinG: t.proteinG.value });
      cost += mealCost(rec, m.servings, plan.swaps, tier, cat.products);
      prepSum += rec.prepMinutes;
      swappedLines(rec, 1, plan.swaps).forEach((l) => {
        const g = cat.ingredients.get(l.ingredientId)?.foodGroup;
        if (g && g !== 'fat' && g !== 'condiment') groups.add(g);
      });
    }
    groupsSum += groups.size;
    const energyOk = Math.abs(totals.energyKcal.value - targets.energyKcal) <= targets.energyKcal * ENERGY_TOLERANCE;
    const proteinOk = totals.proteinG.value >= targets.proteinEarG;
    if (!energyOk) issues.push(`Day ${day + 1}: energy ${round(totals.energyKcal.value)} kcal is outside ±10% of ${targets.energyKcal} kcal.`);
    if (!proteinOk) issues.push(`Day ${day + 1}: protein ${round(totals.proteinG.value)} g is below the EAR planning reference of ${targets.proteinEarG} g.`);
    week = addTotals(week, totals);
    weekCost += cost;
    days.push({ day, totals, costInr: round(cost, 0), energyOk, proteinOk, mealProtein });
  }
  const avg = (v: number) => round(v / DAYS, 0);
  return {
    days,
    week,
    dailyAverage: {
      energyKcal: avg(week.energyKcal.value),
      proteinG: avg(week.proteinG.value),
      carbsG: avg(week.carbsG.value),
      fatG: avg(week.fatG.value),
      fibreG: avg(week.fibreG.value),
      ironMg: round(week.ironMg.value / DAYS, 1),
      calciumMg: avg(week.calciumMg.value),
    },
    weekCostInr: round(weekCost, 0),
    dayCostInr: round(weekCost / DAYS, 0),
    distinctRecipes: new Set(plan.meals.map((m) => m.recipeId)).size,
    foodGroupsPerDay: round(groupsSum / DAYS, 1),
    avgPrepMinutes: round(prepSum / Math.max(1, plan.meals.length), 0),
    valid: issues.length === 0,
    issues,
    confidence: 'low', // sample nutrient data -> never higher than low
  };
}

/** validatePlanAgainstTargets: hard rules (diet/allergy) + target checks. */
export function validatePlanAgainstTargets(plan: PlanDraft, b: ProfileBundle, targets: PlanTargets, cat: Catalog): { valid: boolean; issues: string[] } {
  const r = restrictionsOf(b);
  const issues: string[] = [];
  for (const m of plan.meals) {
    const rec = cat.recipes.get(m.recipeId);
    if (!rec) {
      issues.push(`Unknown recipe ${m.recipeId}`);
      continue;
    }
    const swapped: Recipe = { ...rec, ingredients: rec.ingredients.map((ri) => (plan.swaps[ri.ingredientId] ? { ...ri, ingredientId: plan.swaps[ri.ingredientId].ingredientId } : ri)) };
    const why = recipeRejection(swapped, cat.ingredients, r);
    if (why) issues.push(`${rec.name}: ${why.detail}`);
  }
  const ev = evaluatePlan(plan, targets, cat, b.preferences.groceryTier);
  issues.push(...ev.issues);
  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------- replacement

export interface ReplacementCandidate {
  recipe: Recipe;
  servings: number;
  deltaKcal: number;
  deltaProteinG: number;
  deltaCostInr: number;
}

function servingsToMatch(oldKcal: number, recipe: Recipe, cat: Catalog, swaps: Record<string, IngredientSwap>): number {
  const per = aggregateRecipeNutrition(recipe, cat.ingredients, 1, swaps).energyKcal.value;
  return roundServings(per > 0 ? oldKcal / per : 1);
}

/** Candidates for one meal slot, closest to the current meal's energy first. */
export function replacementCandidates(plan: PlanDraft, mealId: string, b: ProfileBundle, cat: Catalog): ReplacementCandidate[] {
  const meal = plan.meals.find((m) => m.id === mealId);
  if (!meal) throw new Error('meal not found');
  const cur = cat.recipes.get(meal.recipeId)!;
  const curT = aggregateRecipeNutrition(cur, cat.ingredients, meal.servings, plan.swaps);
  const curCost = mealCost(cur, meal.servings, plan.swaps, b.preferences.groceryTier, cat.products);
  return eligibleRecipes(cat, restrictionsOf(b), plan.swaps)
    .filter((rec) => rec.slots.includes(meal.slot) && rec.id !== meal.recipeId)
    .map((rec) => {
      const servings = servingsToMatch(curT.energyKcal.value, rec, cat, plan.swaps);
      const t = aggregateRecipeNutrition(rec, cat.ingredients, servings, plan.swaps);
      return {
        recipe: rec,
        servings,
        deltaKcal: round(t.energyKcal.value - curT.energyKcal.value, 0),
        deltaProteinG: round(t.proteinG.value - curT.proteinG.value, 1),
        deltaCostInr: round(mealCost(rec, servings, plan.swaps, b.preferences.groceryTier, cat.products) - curCost, 0),
      };
    })
    .sort((x, y) => Math.abs(x.deltaKcal) - Math.abs(y.deltaKcal) || x.recipe.id.localeCompare(y.recipe.id));
}

export type ReplaceResult = { ok: true; plan: PlanDraft } | { ok: false; reason: string };

/** Scoped edit: changes one meal only, never regenerates the week. */
export function replaceMeal(plan: PlanDraft, mealId: string, recipeId: string, servings: number | null, b: ProfileBundle, cat: Catalog): ReplaceResult {
  const meal = plan.meals.find((m) => m.id === mealId);
  const rec = cat.recipes.get(recipeId);
  if (!meal || !rec) return { ok: false, reason: 'Meal or recipe not found' };
  if (!rec.slots.includes(meal.slot)) return { ok: false, reason: `${rec.name} is not offered for ${meal.slot}` };
  const swapped: Recipe = { ...rec, ingredients: rec.ingredients.map((ri) => (plan.swaps[ri.ingredientId] ? { ...ri, ingredientId: plan.swaps[ri.ingredientId].ingredientId } : ri)) };
  const why = recipeRejection(swapped, cat.ingredients, restrictionsOf(b));
  if (why) return { ok: false, reason: why.detail };
  const cur = cat.recipes.get(meal.recipeId)!;
  const oldKcal = aggregateRecipeNutrition(cur, cat.ingredients, meal.servings, plan.swaps).energyKcal.value;
  const s = servings ?? servingsToMatch(oldKcal, rec, cat, plan.swaps);
  return {
    ok: true,
    plan: { ...plan, meals: plan.meals.map((m) => (m.id === mealId ? { ...m, recipeId, recipeVersion: rec.version, servings: roundServings(s) } : m)) },
  };
}
