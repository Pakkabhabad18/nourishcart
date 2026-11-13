// Recommendation safety and quality evaluation.
// Runs many synthetic users through the full pipeline (targets -> three plans -> grocery
// basket -> budget alternatives) and checks every output against the independent oracle.
import { NO_CUSTOM_TARGETS } from '../domain/nutrition/personal.ts';
import type { Allergen, DietPattern, Goal, ProfileBundle } from '../domain/types.ts';
import type { BasketLine } from '../domain/grocery/optimise.ts';
import { calculateTargets, planTargetsFrom } from '../domain/nutrition/targets.ts';
import { aggregateRecipeNutrition } from '../domain/recipes/aggregate.ts';
import { evaluatePlan, generatePlanOptions, ENERGY_TOLERANCE, type Catalog, type PlanDraft } from '../domain/planning/plan.ts';
import { negotiate, runPipeline } from '../domain/pipeline.ts';
import { mergePatch } from '../domain/grocery/negotiate.ts';
import { checkBasket, checkPlan, dayTotals, type UserRules, type Violation } from './oracle.ts';

/** Small seeded random generator so every run produces the same synthetic users. */
export function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIETS: DietPattern[] = ['vegan', 'vegetarian', 'eggetarian', 'non_vegetarian'];
export const ALLERGY_SETS: Allergen[][] = [[], ['peanut'], ['dairy'], ['gluten'], ['egg'], ['soy', 'peanut'], ['dairy', 'gluten'], ['fish', 'shellfish']];
export const EXCLUSION_SETS: string[][] = [[], ['okra'], ['paneer'], ['toor_dal', 'rice']];
const GOALS: Goal[] = ['general', 'muscle_fitness', 'weight_management', 'budget_first'];

export function makeProfile(i: number, diet: DietPattern, allergies: Allergen[], exclusions: string[], rnd: () => number): ProfileBundle {
  const id = `eval-${i}`;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const sex = pick(['male', 'female', 'prefer_not_to_say'] as const);
  const age = 18 + Math.floor(rnd() * 60);
  const heightCm = Math.round(150 + rnd() * 35);
  const weightKg = Math.round(45 + rnd() * 50);
  const workouts = pick([0, 0, 2, 3, 5]);
  return {
    profile: { id, ownerUserId: 'eval', displayName: `Eval ${i}`, dateOfBirth: `${2026 - age - 1}-01-15`, ageAtEntry: null, ageEnteredAt: null, sex, heightCm, weightKg, archived: false, onboardingStep: 6, onboardingComplete: true, createdAt: '', updatedAt: '' },
    preferences: {
      profileId: id, dietPattern: diet, cuisines: [], likes: [], dislikes: [], hardExclusions: exclusions, allergies, allergiesConfirmed: true,
      mealsPerDay: pick([3, 4] as const), maxCookMinutes: pick([20, 40, 60]), groceryTier: pick(['value', 'standard', 'premium'] as const), clinicalFlags: [], noClinicalFlagsConfirmed: true,
    },
    activity: { profileId: id, questionnaireVersion: 'aq-1', occupation: pick(['sedentary', 'light', 'moderate', 'heavy'] as const), movement: pick(['low', 'medium', 'high'] as const), workoutsPerWeek: workouts, workoutType: workouts ? 'mixed' : 'none', workoutMinutes: workouts ? pick([30, 45, 60]) : 0, intensity: workouts ? pick(['light', 'moderate', 'vigorous'] as const) : null },
    budget: { profileId: id, amountInr: pick([700, 1000, 1500, 2500, 4000]), period: 'weekly', mode: 'hard' },
    goals: { profileId: id, goal: pick(GOALS), bodyGoal: null, custom: NO_CUSTOM_TARGETS, focusNutrients: [] },
  };
}

/** Profiles that must be refused (PRD scope): minors and clinical situations. */
export function outOfScopeProfiles(): { label: string; b: ProfileBundle }[] {
  const base = makeProfile(9999, 'vegetarian', [], [], mulberry32(7));
  const now = new Date();
  const dobFor = (age: number) => `${now.getUTCFullYear() - age}-01-01`;
  const flags = ['pregnancy', 'lactation', 'eating_disorder', 'kidney_disease', 'diabetes_clinical_diet', 'bariatric_surgery', 'other_medical_condition'] as const;
  return [
    { label: 'age 17', b: { ...base, profile: { ...base.profile, dateOfBirth: dobFor(17) } } },
    { label: 'age 12', b: { ...base, profile: { ...base.profile, dateOfBirth: dobFor(12) } } },
    ...flags.map((f) => ({ label: f, b: { ...base, preferences: { ...base.preferences, clinicalFlags: [f], noClinicalFlagsConfirmed: false } } })),
    { label: 'missing weight', b: { ...base, profile: { ...base.profile, weightKg: null } } },
    { label: 'blank allergy answer', b: { ...base, preferences: { ...base.preferences, allergiesConfirmed: false } } },
  ];
}

export interface RecommendationReport {
  profiles: number;
  feasible: number;
  infeasibleWithReasons: number;
  infeasibleWithoutReasons: number;
  plansChecked: number;
  mealsChecked: number;
  basketsChecked: number;
  alternativesChecked: number;
  violations: { diet: number; allergen: number; exclusion: number; product: number };
  violationExamples: Violation[];
  energyDaysOk: number;
  energyDaysTotal: number;
  proteinDaysOk: number;
  proteinDaysTotal: number;
  engineOracleMismatches: number; // app energy vs independent sum differ by > 1 kcal
  unknownMarkedComplete: number;
  basketCoverageFailures: number;
  budgetStatusErrors: number;
  hardBudgetBreachesAfterAlternatives: number;
  alternativesBreakingPlan: number;
  determinismChecks: number;
  determinismFailures: number;
  distinctPlanFailures: number;
  fewerOptionsExplained: number;
  outOfScope: { total: number; correctlyRefused: number; failures: string[] };
  byDiet: Record<DietPattern, { profiles: number; feasible: number; violations: number }>;
  durationMs: number;
}

/** Baskets handed to the store-cart evaluation (src/eval/cart.ts): one per feasible person. */
export interface CollectedBasket {
  restrictions: { dietPattern: DietPattern; allergies: Allergen[]; hardExclusions: string[] };
  lines: BasketLine[];
}

export function runRecommendationEval(cat: Catalog, opts: { perCombination?: number; seed?: number; maxAlternatives?: number; collectBaskets?: CollectedBasket[] } = {}): RecommendationReport {
  const t0 = Date.now();
  const perCombination = opts.perCombination ?? 3;
  const maxAlt = opts.maxAlternatives ?? 3;
  const rnd = mulberry32(opts.seed ?? 20261113);
  const r: RecommendationReport = {
    profiles: 0, feasible: 0, infeasibleWithReasons: 0, infeasibleWithoutReasons: 0, plansChecked: 0, mealsChecked: 0, basketsChecked: 0, alternativesChecked: 0,
    violations: { diet: 0, allergen: 0, exclusion: 0, product: 0 }, violationExamples: [], energyDaysOk: 0, energyDaysTotal: 0, proteinDaysOk: 0, proteinDaysTotal: 0,
    engineOracleMismatches: 0, unknownMarkedComplete: 0, basketCoverageFailures: 0, budgetStatusErrors: 0, hardBudgetBreachesAfterAlternatives: 0, alternativesBreakingPlan: 0,
    determinismChecks: 0, determinismFailures: 0, distinctPlanFailures: 0, fewerOptionsExplained: 0, outOfScope: { total: 0, correctlyRefused: 0, failures: [] },
    byDiet: Object.fromEntries(DIETS.map((d) => [d, { profiles: 0, feasible: 0, violations: 0 }])) as RecommendationReport['byDiet'], durationMs: 0,
  };
  const record = (vs: Violation[], diet: DietPattern) => {
    for (const v of vs) {
      if (v.rule === 'diet') r.violations.diet++;
      else if (v.rule === 'allergen') r.violations.allergen++;
      else if (v.rule === 'exclusion') r.violations.exclusion++;
      else r.violations.product++;
      r.byDiet[diet].violations++;
      if (r.violationExamples.length < 20) r.violationExamples.push(v);
    }
  };

  let i = 0;
  for (const diet of DIETS)
    for (const allergies of ALLERGY_SETS)
      for (const exclusions of EXCLUSION_SETS)
        for (let k = 0; k < perCombination; k++) {
          const b = makeProfile(i++, diet, allergies, exclusions, rnd);
          const u: UserRules = { diet, allergies, exclusions };
          r.profiles++;
          r.byDiet[diet].profiles++;
          const t = calculateTargets(b);
          if (!t.ok) {
            r.infeasibleWithoutReasons++;
            continue;
          }
          const targets = planTargetsFrom(t.record);
          const gen = generatePlanOptions(b, targets, cat);
          if (!gen.ok) {
            if (gen.reasons.length > 0) r.infeasibleWithReasons++;
            else r.infeasibleWithoutReasons++;
            continue;
          }
          r.feasible++;
          r.byDiet[diet].feasible++;
          if (new Set(gen.plans.map((p) => p.meals.map((m) => `${m.recipeId}x${m.servings}`).join())).size !== gen.plans.length) r.distinctPlanFailures++;
          if (gen.plans.length < 3) {
            if (gen.notes.length) r.fewerOptionsExplained++;
            else r.distinctPlanFailures++;
          }
          if (i % 10 === 0) {
            r.determinismChecks++;
            if (JSON.stringify(generatePlanOptions(b, targets, cat)) !== JSON.stringify(gen)) r.determinismFailures++;
          }
          for (const plan of gen.plans) {
            r.plansChecked++;
            r.mealsChecked += plan.meals.length;
            record(checkPlan(plan, u, cat.recipes, cat.ingredients), diet);
            checkNutrition(plan, b, targets, cat, r);
            const input = { bundle: b, plan, targets, patch: {}, pantry: [], cat };
            const res = runPipeline(input);
            r.basketsChecked++;
            if (opts.collectBaskets && plan === gen.plans[0]) opts.collectBaskets.push({ restrictions: { dietPattern: diet, allergies: [...b.preferences.allergies], hardExclusions: [...b.preferences.hardExclusions] }, lines: res.basket.lines });
            record(checkBasket(res.basket, u, cat.products, cat.ingredients), diet);
            checkBasketMaths(res.basket, r);
            // Budget alternatives: apply each (top N) and re-check everything.
            if (plan.optionKey === 'balanced' || res.basket.status === 'OVER_BUDGET') {
              const n = negotiate(input, res);
              for (const alt of n.alternatives.filter((a) => !a.blocked && a.kind !== 'raise_budget').slice(0, maxAlt)) {
                r.alternativesChecked++;
                const after = runPipeline({ ...input, patch: mergePatch({}, alt.patch) });
                record(checkPlan(after.plan, u, cat.recipes, cat.ingredients), diet);
                record(checkBasket(after.basket, u, cat.products, cat.ingredients), diet);
                if (!after.validation.valid) r.alternativesBreakingPlan++; // an unblocked alternative must keep the plan valid
              }
              // The checkout rule: an over-budget hard basket is flagged, never silently approved.
              if (res.basket.budgetMode === 'hard' && res.basket.budgetInr != null && res.basket.totalInr > res.basket.budgetInr && res.basket.status !== 'OVER_BUDGET') r.hardBudgetBreachesAfterAlternatives++;
            }
          }
        }

  for (const o of outOfScopeProfiles()) {
    r.outOfScope.total++;
    const t = calculateTargets(o.b);
    if (!t.ok) r.outOfScope.correctlyRefused++;
    else r.outOfScope.failures.push(o.label);
  }
  r.durationMs = Date.now() - t0;
  return r;
}

function checkNutrition(plan: PlanDraft, b: ProfileBundle, targets: { energyKcal: number; proteinEarG: number; proteinRdaG: number }, cat: Catalog, r: RecommendationReport) {
  const ev = evaluatePlan(plan, targets, cat, b.preferences.groceryTier);
  for (const d of ev.days) {
    const o = dayTotals(plan, d.day, cat.recipes, cat.ingredients);
    r.energyDaysTotal++;
    r.proteinDaysTotal++;
    if (Math.abs(o.kcal - targets.energyKcal) <= targets.energyKcal * ENERGY_TOLERANCE + 0.5) r.energyDaysOk++;
    if (o.protein + 0.05 >= targets.proteinEarG) r.proteinDaysOk++;
    if (Math.abs(o.kcal - d.totals.energyKcal.value) > 1) r.engineOracleMismatches++;
    // Any nutrient with a missing ingredient value must not be reported as complete.
    for (const k of o.unknownFor) if (d.totals[k].status === 'complete') r.unknownMarkedComplete++;
  }
  // spot-check single recipes too
  const m = plan.meals[0];
  const t = aggregateRecipeNutrition(cat.recipes.get(m.recipeId)!, cat.ingredients, 1, plan.swaps);
  if (t.energyKcal.value < 0) r.engineOracleMismatches++;
}

function checkBasketMaths(b: import('../domain/grocery/optimise.ts').BasketResult, r: RecommendationReport) {
  for (const l of b.lines) if (l.coveredQty + 1e-6 < l.demandQty) r.basketCoverageFailures++;
  const sum = Math.round(b.lines.reduce((s, l) => s + l.lineTotalInr, 0) * 100) / 100;
  if (Math.abs(sum - b.totalInr) > 0.01) r.basketCoverageFailures++;
  if (b.budgetInr != null) {
    const shouldBeOver = b.totalInr > b.budgetInr;
    if (shouldBeOver !== (b.status === 'OVER_BUDGET')) r.budgetStatusErrors++;
  }
}
