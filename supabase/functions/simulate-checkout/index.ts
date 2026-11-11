// POST { basketId, basketVersion, explicitConfirm: true, simulateFailure?: boolean }
// Re-checks approval, version, prices and budget server-side, then writes a SIMULATED
// order (idempotent on basket+version) and updates the pantry. No payment, no retailer.
import { fail, isUuid, ok, withAuth } from '../_shared/http.ts';
import { simulateCheckout } from '../_shared/core/domain/orders/checkout.ts';
import { applyOrderToPantry } from '../_shared/core/domain/inventory/pantry.ts';
import { basketFromRow, orderFromRow, orderToRow, pantryFromRow, pantryToRow } from '../_shared/core/domain/persistence/mappers.ts';
import { CATALOGUE } from '../_shared/core/data/catalogue.ts';
import { RECIPE_MAP } from '../_shared/core/data/recipes.ts';
import { INGREDIENT_MAP } from '../_shared/core/data/ingredients.ts';

Deno.serve((req) =>
  withAuth(req, async ({ requestId, user, userDb, adminDb, body }) => {
    if (!isUuid(body.basketId) || typeof body.basketVersion !== 'number') return fail(400, 'INPUT_INVALID', 'basketId and basketVersion are required', requestId);
    if (body.explicitConfirm !== true) return fail(400, 'INPUT_INVALID', 'explicitConfirm must be true', requestId, [{ field: 'explicitConfirm' }]);
    const { data: row } = await userDb.from('baskets').select('*').eq('id', body.basketId).maybeSingle();
    if (!row || row.owner_user_id !== user.id) return fail(404, 'PROFILE_NOT_OWNED', 'Basket not found', requestId);
    const basket = basketFromRow(row);
    const { data: prior } = await adminDb.from('orders').select('*').eq('basket_id', basket.id);
    const result = simulateCheckout({
      basket, expectedVersion: body.basketVersion, explicitConfirm: true, online: true, products: CATALOGUE,
      existingOrders: (prior ?? []).map(orderFromRow), newId: () => crypto.randomUUID(), now: new Date(), simulateFailure: body.simulateFailure === true,
    });
    if (!result.ok) {
      if (result.order) {
        // Failed attempts are recorded with a distinct key so a later retry can still succeed.
        await adminDb.from('orders').insert(orderToRow({ ...result.order, idempotencyKey: `${result.order.idempotencyKey}:failed:${result.order.id}` }));
      }
      const status = result.error === 'BUDGET_EXCEEDED' ? 409 : result.error === 'SIMULATED_FAILURE' ? 502 : 409;
      return fail(status, result.error === 'BUDGET_EXCEEDED' ? 'BUDGET_EXCEEDED' : 'CONFLICT', result.message, requestId, [{ code: result.error }]);
    }
    if (result.duplicate) return ok({ order: result.order, duplicate: true }, requestId);
    const ins = await adminDb.from('orders').insert(orderToRow(result.order));
    if (ins.error) {
      // Unique idempotency key: a concurrent request won the race; return its order.
      const { data: again } = await adminDb.from('orders').select('*').eq('idempotency_key', result.order.idempotencyKey).maybeSingle();
      if (again) return ok({ order: orderFromRow(again), duplicate: true }, requestId);
      throw new Error('order_insert_failed');
    }
    await adminDb.from('baskets').update({ status: 'SIMULATED_ORDER' }).eq('id', basket.id);
    const { data: pantryRows } = await adminDb.from('pantry_items').select('*').eq('profile_id', basket.profileId);
    const next = applyOrderToPantry(result.order, (pantryRows ?? []).map(pantryFromRow), { recipes: RECIPE_MAP, ingredients: INGREDIENT_MAP, products: CATALOGUE }, () => crypto.randomUUID());
    await adminDb.from('pantry_items').upsert(next.map(pantryToRow), { onConflict: 'profile_id,ingredient_id' });
    return ok({ order: result.order, duplicate: false }, requestId);
  }),
);
