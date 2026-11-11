// POST { profileId } -> versioned calculation record (persisted, immutable).
import { fail, isUuid, loadBundle, ok, withAuth } from '../_shared/http.ts';
import { calculateTargets } from '../_shared/core/domain/nutrition/targets.ts';
import { calculationToRow } from '../_shared/core/domain/persistence/mappers.ts';

Deno.serve((req) =>
  withAuth(req, async ({ requestId, user, userDb, adminDb, body }) => {
    if (!isUuid(body.profileId)) return fail(400, 'INPUT_INVALID', 'profileId must be a UUID', requestId, [{ field: 'profileId' }]);
    const bundle = await loadBundle(userDb, body.profileId);
    // Same response whether the profile does not exist or belongs to someone else.
    if (!bundle || bundle.profile.ownerUserId !== user.id) return fail(404, 'PROFILE_NOT_OWNED', 'Profile not found', requestId);
    const result = calculateTargets(bundle);
    if (!result.ok) return ok({ ok: false, eligibility: result.eligibility }, requestId);
    const stored = { id: crypto.randomUUID(), profileId: bundle.profile.id, ownerUserId: user.id, record: result.record, createdAt: new Date().toISOString() };
    const { error } = await adminDb.from('calculation_runs').insert(calculationToRow(stored));
    if (error) throw new Error('insert_failed');
    return ok({ ok: true, calculation: stored, eligibility: result.eligibility }, requestId, result.record.methodVersion);
  }),
);
