// Builds the full evaluation report and the pass/fail gates used in CI and the app.
import type { Catalog } from '../domain/planning/plan.ts';
import { PLANNER_VERSION } from '../domain/planning/plan.ts';
import { OPTIMISER_CONFIG } from '../domain/grocery/optimise.ts';
import { EXTRACTOR_VERSION } from '../domain/intake/extract.ts';
import { MATCHER_VERSION } from '../domain/commerce/match.ts';
import { DATA_VERSION } from '../domain/persistence/mappers.ts';
import { METHODS } from '../domain/nutrition/methods.ts';
import { runRecommendationEval, type RecommendationReport } from './recommendations.ts';
import { runExtractionEval, type ExtractionReport } from './extraction.ts';
import { runMatchingEval, type MatchingReport } from './matching.ts';

export interface Gate {
  id: string;
  group: 'Safety' | 'Nutrition' | 'Grocery' | 'Scope' | 'Voice intake' | 'Store matching' | 'Reliability';
  name: string;
  measured: string;
  threshold: string;
  pass: boolean;
  critical: boolean;
}

export interface EvalReport {
  generatedAt: string;
  mode: 'full' | 'quick';
  versions: Record<string, string>;
  recommendation: RecommendationReport;
  extraction: ExtractionReport;
  matching: MatchingReport;
  gates: Gate[];
  passed: boolean;
}

/** "Rule of three": with 0 failures in n independent trials, the 95% upper bound on the failure rate is about 3/n. */
export function ruleOfThree(n: number): number {
  return n > 0 ? 3 / n : 1;
}
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

export function buildGates(rec: RecommendationReport, ex: ExtractionReport, mt: MatchingReport): Gate[] {
  const g: Gate[] = [];
  const add = (x: Gate) => g.push(x);
  const meals = rec.mealsChecked;
  add({ id: 'S1', group: 'Safety', name: 'No food outside the person’s diet pattern (e.g. egg for a vegetarian)', measured: `${rec.violations.diet} in ${meals.toLocaleString('en-IN')} meals (95% upper bound ${pct(ruleOfThree(meals), 2)})`, threshold: '0', pass: rec.violations.diet === 0, critical: true });
  add({ id: 'S2', group: 'Safety', name: 'No allergen the person declared', measured: `${rec.violations.allergen} in ${meals.toLocaleString('en-IN')} meals`, threshold: '0', pass: rec.violations.allergen === 0, critical: true });
  add({ id: 'S3', group: 'Safety', name: 'No strictly excluded food', measured: `${rec.violations.exclusion} in ${meals.toLocaleString('en-IN')} meals`, threshold: '0', pass: rec.violations.exclusion === 0, critical: true });
  add({ id: 'S4', group: 'Safety', name: 'No basket product that breaks diet or allergy rules (incl. label allergens, out of stock)', measured: `${rec.violations.product} in ${rec.basketsChecked} baskets`, threshold: '0', pass: rec.violations.product === 0, critical: true });
  add({ id: 'S5', group: 'Safety', name: 'Budget alternatives keep every rule and keep the plan valid', measured: `${rec.alternativesBreakingPlan} broken of ${rec.alternativesChecked} applied`, threshold: '0', pass: rec.alternativesBreakingPlan === 0, critical: true });
  add({ id: 'N1', group: 'Nutrition', name: 'Each day within ±10% of the energy estimate (independent recount)', measured: `${rec.energyDaysOk}/${rec.energyDaysTotal} days (${pct(rec.energyDaysOk / Math.max(1, rec.energyDaysTotal))})`, threshold: '100%', pass: rec.energyDaysOk === rec.energyDaysTotal, critical: false });
  add({ id: 'N2', group: 'Nutrition', name: 'Each day meets the protein planning floor (EAR)', measured: `${rec.proteinDaysOk}/${rec.proteinDaysTotal} days`, threshold: '100%', pass: rec.proteinDaysOk === rec.proteinDaysTotal, critical: false });
  add({ id: 'N3', group: 'Nutrition', name: 'App nutrition totals agree with the independent recount (±1 kcal)', measured: `${rec.engineOracleMismatches} mismatches`, threshold: '0', pass: rec.engineOracleMismatches === 0, critical: false });
  add({ id: 'N4', group: 'Nutrition', name: 'Missing nutrient data never shown as complete', measured: `${rec.unknownMarkedComplete} cases`, threshold: '0', pass: rec.unknownMarkedComplete === 0, critical: true });
  add({ id: 'G1', group: 'Grocery', name: 'Basket covers every ingredient need and totals add up', measured: `${rec.basketCoverageFailures} failures`, threshold: '0', pass: rec.basketCoverageFailures === 0, critical: false });
  add({ id: 'G2', group: 'Grocery', name: 'Over-budget baskets are always flagged (hard budget never silently exceeded)', measured: `${rec.budgetStatusErrors + rec.hardBudgetBreachesAfterAlternatives} errors`, threshold: '0', pass: rec.budgetStatusErrors + rec.hardBudgetBreachesAfterAlternatives === 0, critical: true });
  add({ id: 'R1', group: 'Reliability', name: 'Same input gives the same plans', measured: `${rec.determinismFailures}/${rec.determinismChecks} reruns differed`, threshold: '0', pass: rec.determinismFailures === 0, critical: false });
  add({ id: 'R2', group: 'Reliability', name: 'Plan options are never duplicates; fewer than three is explained', measured: `${rec.distinctPlanFailures} duplicates; ${rec.fewerOptionsExplained} profiles shown fewer options with a reason`, threshold: '0 duplicates', pass: rec.distinctPlanFailures === 0, critical: false });
  add({ id: 'R3', group: 'Reliability', name: 'When no safe plan exists, the reason is shown (rules never relaxed)', measured: `${rec.infeasibleWithoutReasons} silent failures; ${rec.infeasibleWithReasons} explained refusals`, threshold: '0 silent', pass: rec.infeasibleWithoutReasons === 0, critical: false });
  add({ id: 'C1', group: 'Scope', name: 'Minors, pregnancy and clinical cases get no personal targets', measured: `${rec.outOfScope.correctlyRefused}/${rec.outOfScope.total} refused`, threshold: '100%', pass: rec.outOfScope.correctlyRefused === rec.outOfScope.total, critical: true });
  add({ id: 'V1', group: 'Voice intake', name: 'No unsafe misreading (diet too lenient, allergy or condition missed, “none” invented)', measured: `${ex.criticalErrors} in ${ex.cases} descriptions`, threshold: '0', pass: ex.criticalErrors === 0, critical: true });
  add({ id: 'V2', group: 'Voice intake', name: 'Field precision (filled values that are right)', measured: pct(ex.overall.precision), threshold: '≥ 95%', pass: ex.overall.precision >= 0.95, critical: false });
  add({ id: 'V3', group: 'Voice intake', name: 'Field recall (stated values that were captured; the rest are asked)', measured: pct(ex.overall.recall), threshold: '≥ 85%', pass: ex.overall.recall >= 0.85, critical: false });
  add({ id: 'M1', group: 'Store matching', name: 'No egg/meat/fish/allergen marker missed in a product title', measured: `${mt.criticalErrors} in ${mt.cases} titles`, threshold: '0', pass: mt.criticalErrors === 0, critical: true });
  add({ id: 'M2', group: 'Store matching', name: 'Precision when a product is mapped', measured: pct(mt.precisionWhenMapped), threshold: '≥ 95%', pass: mt.precisionWhenMapped >= 0.95, critical: false });
  add({ id: 'M3', group: 'Store matching', name: 'Processed/different products correctly left unmapped', measured: pct(mt.refusalRecall), threshold: '≥ 90%', pass: mt.refusalRecall >= 0.9, critical: false });
  add({ id: 'M4', group: 'Store matching', name: 'Pack size read correctly', measured: `${mt.packCorrect}/${mt.packCases}`, threshold: '≥ 95%', pass: mt.packCorrect / Math.max(1, mt.packCases) >= 0.95, critical: false });
  return g;
}

export function runFullEvaluation(cat: Catalog, mode: 'full' | 'quick' = 'full'): EvalReport {
  const recommendation = runRecommendationEval(cat, mode === 'full' ? { perCombination: 3, maxAlternatives: 3 } : { perCombination: 1, maxAlternatives: 2, seed: 42 });
  const extraction = runExtractionEval();
  const matching = runMatchingEval(cat.ingredients);
  const gates = buildGates(recommendation, extraction, matching);
  return {
    generatedAt: new Date().toISOString(),
    mode,
    versions: { planner: PLANNER_VERSION, optimiser: OPTIMISER_CONFIG.version, extractor: EXTRACTOR_VERSION, matcher: MATCHER_VERSION, data: DATA_VERSION, energyMethod: `${METHODS.energy.id}@${METHODS.energy.version}` },
    recommendation,
    extraction,
    matching,
    gates,
    passed: gates.every((x) => x.pass),
  };
}
