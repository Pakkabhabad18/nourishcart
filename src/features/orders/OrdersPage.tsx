// Order history and receipt (screen 15). Simulated status is impossible to miss.
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Receipt } from 'lucide-react';
import { useActiveProfile, useOrders } from '../../app/hooks.ts';
import { EmptyState, ErrorState, PageHeader, SimulatedTag, Spinner, Tag } from '../../components/ui.tsx';
import { dateTime, formatInr } from '../../lib/format.ts';
import { SIMULATED_LABEL, type OrderStatus } from '../../domain/orders/checkout.ts';

const STATUS_TONE: Record<OrderStatus, 'good' | 'warn' | 'danger' | 'neutral'> = {
  CONFIRMED: 'good', FAILED: 'danger', CANCELLED: 'neutral', CHECKOUT_PROCESSING: 'warn', APPROVED: 'neutral', DRAFT: 'neutral', OPTIMISED: 'neutral', REVIEW_REQUIRED: 'warn',
};
const STATUS_LABEL: Record<OrderStatus, string> = {
  CONFIRMED: 'Confirmed (simulated)', FAILED: 'Failed', CANCELLED: 'Cancelled', CHECKOUT_PROCESSING: 'Processing', APPROVED: 'Approved', DRAFT: 'Draft', OPTIMISED: 'Optimised', REVIEW_REQUIRED: 'Needs review',
};

export function OrdersPage() {
  const orders = useOrders();
  const { all } = useActiveProfile();
  if (orders.isLoading) return <Spinner label="Loading orders" />;
  if (orders.error) return <ErrorState error={orders.error} retry={() => orders.refetch()} />;
  const name = (id: string) => all.find((p) => p.id === id)?.displayName ?? 'Profile';
  return (
    <>
      <PageHeader title="Orders" description="All orders in this version are simulated. Nothing was bought or paid for." />
      {orders.data!.length === 0 ? (
        <EmptyState icon={<Receipt className="h-5 w-5" />} title="No orders yet" action={<Link to="/groceries" className="link">Build a basket</Link>}>
          Approved baskets you check out appear here with a receipt.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-outline-variant">
          {orders.data!.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-on-surface/[0.06]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{name(o.profileId)}, {o.lines.length} items</p>
                  <p className="text-sm text-on-surface-variant">{dateTime(o.createdAt)}</p>
                </div>
                <Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag>
                <span className="num w-24 text-right font-medium">{formatInr(o.totalInr)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const orders = useOrders();
  if (orders.isLoading) return <Spinner label="Loading receipt" />;
  const o = orders.data?.find((x) => x.id === id);
  if (!o) return <EmptyState title="Order not found" action={<Link to="/orders" className="link">All orders</Link>} />;
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Orders
      </Link>
      <div className="rounded-card border-2 border-dashed border-warning bg-warninging-container px-5 py-4 text-center">
        <p className="text-lg font-medium text-warning">{SIMULATED_LABEL}</p>
        <p className="mt-1 text-sm text-on-surface-variant">No retailer was contacted and no stock was reserved.</p>
      </div>
      <section className="card mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-normal">Receipt</h1>
          <Tag tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Tag>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-on-surface-variant">Receipt ID</dt>
          <dd className="num break-all text-right">{o.id.slice(0, 8).toUpperCase()}</dd>
          <dt className="text-on-surface-variant">{o.status === 'CONFIRMED' ? 'Confirmed' : 'Attempted'}</dt>
          <dd className="text-right">{dateTime(o.confirmedAt ?? o.createdAt)}</dd>
          <dt className="text-on-surface-variant">Basket version</dt>
          <dd className="num text-right">{o.basketVersion}</dd>
        </dl>
        {o.failureReason && <p className="mt-3 text-sm text-error">{o.failureReason}</p>}
        <ul className="mt-4 divide-y divide-outline-variant border-t border-outline-variant text-sm">
          {o.lines.map((l) => (
            <li key={l.productId} className="num flex justify-between gap-3 py-2">
              <span>{l.packs} × {l.title}</span>
              <span>{formatInr(l.lineTotalInr)}</span>
            </li>
          ))}
        </ul>
        <p className="num mt-3 flex justify-between border-t border-outline-variant pt-3 text-base font-medium">
          <span>Total <SimulatedTag>not charged</SimulatedTag></span>
          <span>{formatInr(o.totalInr)}</span>
        </p>
        <ol className="mt-5 space-y-1 text-xs text-on-surface-variant">
          {o.history.map((h) => (
            <li key={h.status + h.at}>{STATUS_LABEL[h.status]} at {dateTime(h.at)}</li>
          ))}
        </ol>
      </section>
      {o.status === 'CONFIRMED' && (
        <p className="mt-4 text-sm text-on-surface-variant">
          The pantry for this profile now includes these items. <Link to="/pantry" className="link">Check the pantry</Link> and correct anything that differs.
        </p>
      )}
    </div>
  );
}
