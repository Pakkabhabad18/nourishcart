// POST { confirmationPhrase: "DELETE" } -> deletes the caller's auth user. Every owned
// table references auth.users with ON DELETE CASCADE, so all profiles, plans, baskets,
// orders, pantry and consent records go with it. A minimal deletion request row (no
// personal data beyond the user id) is kept as evidence that deletion was completed.
import { fail, ok, withAuth } from '../_shared/http.ts';

Deno.serve((req) =>
  withAuth(req, async ({ requestId, user, adminDb, body }) => {
    if (body.confirmationPhrase !== 'DELETE') return fail(400, 'INPUT_INVALID', 'Type DELETE to confirm', requestId, [{ field: 'confirmationPhrase' }]);
    const { data: reqRow } = await adminDb.from('deletion_requests').insert({ user_id: user.id, scope: 'account' }).select('id').single();
    const { error } = await adminDb.auth.admin.deleteUser(user.id);
    if (error) {
      await adminDb.from('deletion_requests').update({ status: 'failed' }).eq('id', reqRow?.id);
      throw new Error('delete_failed');
    }
    await adminDb.from('deletion_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', reqRow?.id);
    return ok({ deleted: true }, requestId);
  }),
);
