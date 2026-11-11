// Composes the pure engines into the end-to-end flow the UI and Edge Functions use:
// plan (+accepted patch) -> validation -> demand (minus pantry) -> optimised basket -> alternatives.
// Keeping this in one place means the browser demo and the server compute identical results.
import type { ProfileBundle } from './types.ts';
import { evaluatePlan, replaceMeal, restrictionsOf, validatePlanAgainstTargets, type Catalog, type PlanDraft, type PlanEvaluation, type PlanTargets } from './planning/plan.ts';
import { buildGroceryDemand, type DemandLine, type PantryStock, type DemandSource } from './grocery/demand.ts';
import { optimiseBasket, type BasketResult } from './grocery/optimise.ts';
import { costDrivers, mergePatch, proposeAlternatives, type Alternative, type BasketPatch, type CostDriver, type PatchEvaluation } from './grocery/negotiate.ts';

export function applyPatchToPlan(plan: PlanDraft, patch: BasketPatch, b: ProfileBundle, cat: Catalog): PlanDraft {
  let next: PlanDraft = { ...plan, swaps: { ...plan.swaps, ...(patch.swaps ?? {}) } };
  for (const r of patch.mealReplacements ?? []) {
    const res = replaceMeal(next, r.mealId, r.recipeId, null, b, cat);
    if (res.ok) next = res.plan;
  }
  return next;
}

export interface PipelineInput {
  bundle: ProfileBundle;
  plan: PlanDraft;
  targets: PlanTargets;
  patch: BasketPatch;
  pantry: PantryStock[];
  cat: Catalog;
  /** Extra demand sources for an opt-in household basket. */
  extraSources?: DemandSource[];
  budgetInrOverride?: number | null;
}

export interface PipelineResult {
  plan: PlanDraft;
  evaluation: PlanEvaluation;
  validation: { valid: boolean; issues: string[] };
  demand: DemandLine[];
  basket: BasketResult;
}

export function runPipeline(i: PipelineInput): PipelineResult {
  const plan = applyPatchToPlan(i.plan, i.patch, i.bundle, i.cat);
  const evaluation = evaluatePlan(plan, i.targets, i.cat, i.bundle.preferences.groceryTier);
  const validation = validatePlanAgainstTargets(plan, i.bundle, i.targets, i.cat);
  const demand = buildGroceryDemand([{ profileId: i.bundle.profile.id, profileName: i.bundle.profile.displayName, plan }, ...(i.extraSources ?? [])], i.pantry, i.cat);
  const basket = optimiseBasket({
    demand,
    restrictions: restrictionsOf(i.bundle),
    tier: i.bundle.preferences.groceryTier,
    products: i.cat.products,
    ingredients: i.cat.ingredients,
    cheapestOnly: i.patch.cheapestOnly,
    skuOverrides: i.patch.skuOverrides,
    removed: i.patch.removed,
    budgetInr: i.budgetInrOverride !== undefined ? i.budgetInrOverride : weeklyBudget(i.bundle),
    budgetMode: i.bundle.budget.mode,
  });
  return { plan, evaluation, validation, demand, basket };
}

/** Personal budget per profile, expressed per week (monthly / 4.33 weeks, explicit). */
export function weeklyBudget(b: ProfileBundle): number | null {
  if (b.budget.amountInr == null) return null;
  return b.budget.period === 'weekly' ? b.budget.amountInr : Math.round(b.budget.amountInr / 4.33);
}

export function negotiate(i: PipelineInput, result: PipelineResult): { drivers: CostDriver[]; alternatives: Alternative[] } {
  const evalPatch = (p: BasketPatch): PatchEvaluation => {
    const r = runPipeline({ ...i, patch: mergePatch(i.patch, p) });
    return { totalInr: r.basket.totalInr, valid: r.validation.valid, issues: r.validation.issues, weekProteinG: r.evaluation.week.proteinG.value, weekEnergyKcal: r.evaluation.week.energyKcal.value };
  };
  return {
    drivers: costDrivers(result.basket),
    alternatives: proposeAlternatives({
      basket: result.basket,
      plan: i.plan,
      restrictions: restrictionsOf(i.bundle),
      ingredients: i.cat.ingredients,
      recipes: i.cat.recipes,
      current: i.patch,
      evaluate: evalPatch,
      baseline: { totalInr: result.basket.totalInr, valid: result.validation.valid, issues: result.validation.issues, weekProteinG: result.evaluation.week.proteinG.value, weekEnergyKcal: result.evaluation.week.energyKcal.value },
    }),
  };
}
