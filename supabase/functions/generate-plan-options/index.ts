// POST { profileId } -> three validated plan options, persisted as "proposed".
import { fail, isUuid, loadBundle, ok, withAuth } from '../_shared/http.ts';
import { calculateTargets } from '../_shared/core/domain/nutrition/targets.ts';
import { generatePlanOptions, PLANNER_VERSION } from '../_shared/core/domain/planning/plan.ts';
import { calculationToRow, planToRow, DATA_VERSION, weekStartOf, type StoredPlan } from '../_shared/core/domain/persistence/mappers.ts';
import { RECIPE_MAP } from '../_shared/core/data/recipes.ts';
import { INGREDIENT_MAP } from '../_shared/core/data/ingredients.ts';
import { CATALOGUE } from '../_shared/core/data/catalogue.ts';

Deno.serve((req) =>
  withAuth(req, async ({ requestId, user, userDb, adminDb, body }) => {
    if (!isUuid(body.profileId)) return fail(400, 'INPUT_INVALID', 'profileId must be a UUID', requestId);
    const bundle = await loadBundle(userDb, body.profileId);
    if (!bundle || bundle.profile.ownerUserId !== user.id) return fail(404, 'PROFILE_NOT_OWNED', 'Profile not found', requestId);
    // Targets are recomputed server-side; the browser never supplies them.
    const t = calculateTargets(bundle);
    if (!t.ok) return fail(422, 'INELIGIBLE_PROFILE', 'This profile is incomplete or outside the planning scope', requestId, t.eligibility.missing);
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    await adminDb.from('calculation_runs').insert(calculationToRow({ id: runId, profileId: bundle.profile.id, ownerUserId: user.id, record: t.record, createdAt: now }));
    const targets = { energyKcal: t.record.planningEnergyKcal, proteinEarG: t.record.protein.earG, proteinRdaG: t.record.protein.rdaG };
    const gen = generatePlanOptions(bundle, targets, { recipes: RECIPE_MAP, ingredients: INGREDIENT_MAP, products: CATALOGUE });
    if (!gen.ok) return ok({ ok: false, reasons: gen.reasons }, requestId, PLANNER_VERSION);
    // Older unselected proposals are archived so the comparison always shows one fresh set.
    await userDb.from('meal_plans').update({ status: 'archived' }).eq('profile_id', bundle.profile.id).eq('status', 'proposed');
    const generationId = crypto.randomUUID();
    const plans: StoredPlan[] = gen.plans.map((d) => ({
      id: crypto.randomUUID(), profileId: bundle.profile.id, ownerUserId: user.id, calculationRunId: runId, optionKey: d.optionKey, generationId,
      weekStart: weekStartOf(new Date()), status: 'proposed', draft: d, patch: {}, targets, version: 1, plannerVersion: PLANNER_VERSION, dataVersion: DATA_VERSION, createdAt: now, updatedAt: now,
    }));
    const { error } = await userDb.from('meal_plans').insert(plans.map(planToRow));
    if (error) throw new Error('insert_failed');
    return ok({ ok: true, plans }, requestId, PLANNER_VERSION);
  }),
);
