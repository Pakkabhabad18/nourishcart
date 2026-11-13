// Evaluation of personal targets (goal, typed numbers, nutrients to boost). No AI involved.
//   T1 critical  calories never go below the floor (sex floor and resting energy) or past
//                the deficit/surplus caps, whatever the person types
//   T2 critical  protein target never below the EAR floor or above 2 g/kg
//   T3           plans made from personal targets still pass every day's energy and protein checks
//   T4           "Best for your goal" reaches at least 90% of the protein target
//   T5           asking for more iron / calcium raises it in the chosen plan (vs. the same person without)
import type { BodyGoal, FocusNutrient, ProfileBundle } from '../domain/types.ts';
import { calculateTargets, planTargetsFrom } from '../domain/nutrition/targets.ts';
import { KCAL_FLOOR, MAX_DEFICIT, MAX_SURPLUS, PROTEIN_MAX_G_PER_KG } from '../domain/nutrition/personal.ts';
import { evaluatePlan, generatePlanOptions, type Catalog } from '../domain/planning/plan.ts';
import { DIETS, makeProfile, mulberry32 } from './recommendations.ts';

export interface PersonalReport {
  people: number;
  kcalViolations: number;
  proteinViolations: number;
  typedNumbersTried: number;
  plansMade: number;
  plansValid: number;
  generationFailures: number;
  goalPlans: number;
  goalPlansReachProtein: number;
  focusChecks: { nutrient: FocusNutrient; people: number; raised: number; meanUpliftPct: number }[];
}

const GOALS: BodyGoal[] = ['lose', 'maintain', 'gain'];

/** Same person with a body goal, optional typed numbers and focus nutrients. */
function withGoals(b: ProfileBundle, bodyGoal: BodyGoal, custom: Partial<ProfileBundle['goals']['custom']>, focus: FocusNutrient[]): ProfileBundle {
  return { ...b, goals: { ...b.goals, bodyGoal, custom: { kcal: null, proteinG: null, carbsG: null, fatG: null, fibreG: null, ...custom }, focusNutrients: focus } };
}

export function runPersonalEval(cat: Catalog, people = 60, seed = 11): PersonalReport {
  const rnd = mulberry32(seed);
  const r: PersonalReport = { people: 0, kcalViolations: 0, proteinViolations: 0, typedNumbersTried: 0, plansMade: 0, plansValid: 0, generationFailures: 0, goalPlans: 0, goalPlansReachProtein: 0, focusChecks: [] };
  const focus: Record<'iron' | 'calcium', { people: number; raised: number; uplift: number[] }> = { iron: { people: 0, raised: 0, uplift: [] }, calcium: { people: 0, raised: 0, uplift: [] } };

  for (let i = 0; i < people; i++) {
    const base = makeProfile(5000 + i, DIETS[i % DIETS.length], [], [], rnd);
    r.people++;
    // T1/T2: suggested values plus extreme typed numbers for every goal.
    for (const g of GOALS) {
      for (const custom of [{}, { kcal: 800, proteinG: 10 }, { kcal: 6000, proteinG: 400 }, { kcal: Math.round(1000 + rnd() * 3000), proteinG: Math.round(30 + rnd() * 200) }]) {
        r.typedNumbersTried++;
        const t = calculateTargets(withGoals(base, g, custom, []));
        if (!t.ok || !t.record.personal) continue;
        const p = t.record.personal;
        const sex = base.profile.sex!;
        const maint = t.record.energy.teeKcal;
        const floor = Math.max(KCAL_FLOOR[sex], Math.round(t.record.energy.bmrKcal), Math.round(maint * (1 - MAX_DEFICIT)));
        const ceil = Math.max(floor, Math.round(maint * (1 + MAX_SURPLUS)));
        if (p.kcal.value < floor || p.kcal.value > ceil + 1) r.kcalViolations++;
        const w = base.profile.weightKg!;
        if (p.proteinG.value < t.record.protein.earG || p.proteinG.value > Math.round(w * PROTEIN_MAX_G_PER_KG) + 1) r.proteinViolations++;
      }
    }
    // T3/T4: plans for this person with a goal (rotating), no typed numbers.
    const g = GOALS[i % 3];
    const b = withGoals(base, g, {}, []);
    const t = calculateTargets(b);
    if (!t.ok) continue;
    const targets = planTargetsFrom(t.record);
    const gen = generatePlanOptions(b, targets, cat);
    if (!gen.ok) {
      r.generationFailures++;
      continue;
    }
    for (const plan of gen.plans) {
      r.plansMade++;
      if (evaluatePlan(plan, targets, cat, b.preferences.groceryTier).valid) r.plansValid++;
    }
    const goalPlan = gen.plans.find((p) => p.optionKey === 'goal');
    if (goalPlan && targets.proteinTargetG) {
      r.goalPlans++;
      const avg = evaluatePlan(goalPlan, targets, cat, b.preferences.groceryTier).dailyAverage.proteinG;
      if (avg >= targets.proteinTargetG * 0.9) r.goalPlansReachProtein++;
    }
    // T5: same person, same goal, with one focus nutrient. Compared on the plan they'd pick for their goal.
    if (i % 2 === 0) {
      for (const n of ['iron', 'calcium'] as const) {
        const bf = withGoals(base, g, {}, [n]);
        const tf = calculateTargets(bf);
        if (!tf.ok || !goalPlan) continue;
        const gf = generatePlanOptions(bf, planTargetsFrom(tf.record), cat);
        const fp = gf.plans.find((p) => p.optionKey === 'goal');
        if (!fp) continue;
        const key = n === 'iron' ? 'ironMg' : 'calciumMg';
        const before = evaluatePlan(goalPlan, targets, cat, b.preferences.groceryTier).dailyAverage[key];
        const after = evaluatePlan(fp, planTargetsFrom(tf.record), cat, bf.preferences.groceryTier).dailyAverage[key];
        focus[n].people++;
        if (after > before) focus[n].raised++;
        focus[n].uplift.push(before > 0 ? ((after - before) / before) * 100 : 0);
      }
    }
  }
  r.focusChecks = (['iron', 'calcium'] as const).map((n) => ({
    nutrient: n,
    people: focus[n].people,
    raised: focus[n].raised,
    meanUpliftPct: Math.round((focus[n].uplift.reduce((a, x) => a + x, 0) / Math.max(1, focus[n].uplift.length)) * 10) / 10,
  }));
  return r;
}
