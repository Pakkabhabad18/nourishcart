// Simulated checkout and order state machine (PRD 10.1, prompt section 9).
// Baskets: DRAFT -> REVIEW | OVER_BUDGET -> APPROVED -> SIMULATED_ORDER (or EXPIRED).
// Orders:  DRAFT -> OPTIMISED -> REVIEW_REQUIRED -> APPROVED -> CHECKOUT_PROCESSING -> CONFIRMED,
//          with FAILED and CANCELLED as exits. No payment, no retailer call, ever.
import type { CatalogueProduct } from '../types.ts';
import type { BasketLine, BasketStatus } from '../grocery/optimise.ts';
import { fromPaise, toPaise } from '../units.ts';

export type OrderStatus = 'DRAFT' | 'OPTIMISED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'CHECKOUT_PROCESSING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['OPTIMISED', 'CANCELLED'],
  OPTIMISED: ['REVIEW_REQUIRED', 'CANCELLED'],
  REVIEW_REQUIRED: ['APPROVED', 'OPTIMISED', 'CANCELLED'],
  APPROVED: ['CHECKOUT_PROCESSING', 'CANCELLED'],
  CHECKOUT_PROCESSING: ['CONFIRMED', 'FAILED'],
  CONFIRMED: [],
  FAILED: ['REVIEW_REQUIRED', 'CANCELLED'],
  CANCELLED: [],
};

const BASKET_TRANSITIONS: Record<BasketStatus, BasketStatus[]> = {
  DRAFT: ['REVIEW', 'OVER_BUDGET'],
  REVIEW: ['DRAFT', 'APPROVED', 'EXPIRED', 'OVER_BUDGET'],
  OVER_BUDGET: ['REVIEW', 'DRAFT', 'APPROVED', 'EXPIRED'], // APPROVED only allowed in flexible mode, checked below
  APPROVED: ['SIMULATED_ORDER', 'DRAFT', 'EXPIRED'],
  SIMULATED_ORDER: [],
  EXPIRED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionBasket(from: BasketStatus, to: BasketStatus): boolean {
  return BASKET_TRANSITIONS[from].includes(to);
}

export const SIMULATED_LABEL = 'SIMULATED ORDER – NO PURCHASE PLACED – NO PAYMENT TAKEN';

export interface StoredBasket {
  id: string;
  profileId: string;
  ownerUserId: string;
  version: number;
  status: BasketStatus;
  provider: 'SIMULATED';
  lines: BasketLine[];
  totalInr: number;
  budgetInr: number | null;
  budgetMode: 'hard' | 'flexible';
  approvedAt: string | null;
  approvedVersion: number | null;
  createdAt: string;
  updatedAt: string;
  catalogueSnapshotAt: string;
  planId: string | null;
}

export interface ReceiptLine {
  productId: string;
  title: string;
  brand: string;
  packs: number;
  unitPriceInr: number;
  lineTotalInr: number;
  ingredientId: string;
  packQty: number;
  packUnit: string;
}

export interface SimulatedOrder {
  id: string;
  ownerUserId: string;
  profileId: string;
  basketId: string;
  basketVersion: number;
  idempotencyKey: string;
  status: OrderStatus;
  isSimulated: true;
  label: string;
  totalInr: number;
  lines: ReceiptLine[];
  budgetInr: number | null;
  createdAt: string;
  confirmedAt: string | null;
  failureReason: string | null;
  history: { status: OrderStatus; at: string }[];
}

export type CheckoutError =
  | 'CONFIRMATION_REQUIRED'
  | 'BASKET_NOT_APPROVED'
  | 'BASKET_VERSION_CHANGED'
  | 'BUDGET_EXCEEDED'
  | 'OFFLINE'
  | 'PROVIDER_NOT_SIMULATED'
  | 'PRICE_MISMATCH'
  | 'SIMULATED_FAILURE';

export type CheckoutResult = { ok: true; order: SimulatedOrder; duplicate: boolean } | { ok: false; error: CheckoutError; message: string; order?: SimulatedOrder };

export function idempotencyKeyFor(basketId: string, version: number): string {
  return `checkout:${basketId}:v${version}`;
}

/** Recompute the total from catalogue prices: client-supplied totals are never trusted. */
export function recomputeLines(lines: BasketLine[], products: CatalogueProduct[]): { lines: ReceiptLine[]; totalInr: number } {
  const out: ReceiptLine[] = [];
  let total = 0;
  for (const l of lines) {
    for (const pk of l.picks) {
      const p = products.find((x) => x.id === pk.productId);
      if (!p) throw new Error(`Unknown product ${pk.productId}`);
      const lt = toPaise(p.priceInr) * pk.packs;
      total += lt;
      out.push({ productId: p.id, title: p.title, brand: p.brand, packs: pk.packs, unitPriceInr: p.priceInr, lineTotalInr: fromPaise(lt), ingredientId: p.ingredientId, packQty: p.packQty, packUnit: p.packUnit });
    }
  }
  return { lines: out, totalInr: fromPaise(total) };
}

export interface CheckoutInput {
  basket: StoredBasket;
  expectedVersion: number;
  explicitConfirm: boolean;
  online: boolean;
  products: CatalogueProduct[];
  existingOrders: SimulatedOrder[];
  newId: () => string;
  now: Date;
  /** Test hook to exercise the FAILED path without any real provider. */
  simulateFailure?: boolean;
}

export function simulateCheckout(i: CheckoutInput): CheckoutResult {
  const key = idempotencyKeyFor(i.basket.id, i.expectedVersion);
  const existing = i.existingOrders.find((o) => o.idempotencyKey === key && o.status === 'CONFIRMED');
  if (existing) return { ok: true, order: existing, duplicate: true };
  if (!i.online) return { ok: false, error: 'OFFLINE', message: 'You are offline. Checkout needs a connection.' };
  if (!i.explicitConfirm) return { ok: false, error: 'CONFIRMATION_REQUIRED', message: 'Please confirm the simulated order explicitly.' };
  if (i.basket.provider !== 'SIMULATED') return { ok: false, error: 'PROVIDER_NOT_SIMULATED', message: 'Only simulated checkout is available in this version.' };
  if (i.basket.version !== i.expectedVersion || i.basket.approvedVersion !== i.expectedVersion)
    return { ok: false, error: 'BASKET_VERSION_CHANGED', message: 'The basket changed after you approved it. Please review and approve again.' };
  if (i.basket.status !== 'APPROVED') return { ok: false, error: 'BASKET_NOT_APPROVED', message: 'Approve the basket before checkout.' };
  const recomputed = recomputeLines(i.basket.lines, i.products);
  if (Math.abs(recomputed.totalInr - i.basket.totalInr) > 0.001)
    return { ok: false, error: 'PRICE_MISMATCH', message: 'Prices changed since approval. Please review the basket again.' };
  if (i.basket.budgetMode === 'hard' && i.basket.budgetInr != null && recomputed.totalInr > i.basket.budgetInr)
    return { ok: false, error: 'BUDGET_EXCEEDED', message: 'This basket is above your hard budget.' };

  const at = i.now.toISOString();
  const order: SimulatedOrder = {
    id: i.newId(),
    ownerUserId: i.basket.ownerUserId,
    profileId: i.basket.profileId,
    basketId: i.basket.id,
    basketVersion: i.basket.version,
    idempotencyKey: key,
    status: 'CHECKOUT_PROCESSING',
    isSimulated: true,
    label: SIMULATED_LABEL,
    totalInr: recomputed.totalInr,
    lines: recomputed.lines,
    budgetInr: i.basket.budgetInr,
    createdAt: at,
    confirmedAt: null,
    failureReason: null,
    history: [
      { status: 'APPROVED', at: i.basket.approvedAt ?? at },
      { status: 'CHECKOUT_PROCESSING', at },
    ],
  };
  if (i.simulateFailure) {
    order.status = 'FAILED';
    order.failureReason = 'Simulated provider failure (test mode). Nothing was purchased and your pantry was not changed.';
    order.history.push({ status: 'FAILED', at });
    return { ok: false, error: 'SIMULATED_FAILURE', message: order.failureReason, order };
  }
  order.status = 'CONFIRMED';
  order.confirmedAt = at;
  order.history.push({ status: 'CONFIRMED', at });
  return { ok: true, order, duplicate: false };
}
