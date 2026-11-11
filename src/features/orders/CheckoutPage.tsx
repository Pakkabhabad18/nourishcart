// Checkout review (screen 14): exact basket snapshot, explicit approval, explicit
// confirmation, then a simulated order. No payment fields exist anywhere.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useBasket } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Button, EmptyState, ErrorState, Notice, PageHeader, SimulatedTag, Spinner } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { formatInr } from '../../lib/format.ts';
import { recomputeLines } from '../../domain/orders/checkout.ts';

export function CheckoutPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { online, toast } = useApp();
  const { profile } = useActiveProfile();
  const basketQ = useBasket(profile?.id);
  const [confirmed, setConfirmed] = useState(false);
  const [failTest, setFailTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;
  if (basketQ.isLoading) return <Spinner label="Loading basket" />;
  if (basketQ.error) return <ErrorState error={basketQ.error} />;
  const basket = basketQ.data;
  if (!basket)
    return <EmptyState title="No basket to review" action={<Button onClick={() => nav('/groceries')}>Go to groceries</Button>}>Build a basket from your meal plan first.</EmptyState>;

  const receipt = recomputeLines(basket.lines, CAT.products);
  const over = basket.budgetInr != null && basket.totalInr > basket.budgetInr;
  const approved = basket.status === 'APPROVED' && basket.approvedVersion === basket.version;
  const canApprove = !(over && basket.budgetMode === 'hard');

  async function approve() {
    setBusy(true);
    const saved = await store.saveBasket({ ...basket!, status: 'APPROVED', approvedAt: new Date().toISOString(), approvedVersion: basket!.version });
    qc.setQueryData(qk.basket(profile!.id), saved);
    setBusy(false);
  }
  async function placeOrder() {
    setBusy(true);
    setError(null);
    const r = await store.checkout(basket!.id, basket!.version, { simulateFailure: failTest });
    setBusy(false);
    await qc.invalidateQueries({ queryKey: qk.orders });
    await qc.invalidateQueries({ queryKey: qk.basket(profile!.id) });
    await qc.invalidateQueries({ queryKey: qk.pantry(profile!.id) });
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast(r.duplicate ? 'This order was already placed' : 'Simulated order confirmed');
    nav(`/orders/${r.order.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/groceries" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Edit basket
      </Link>
      <PageHeader title="Review basket" description={<>For {profile.displayName}. Version {basket.version}. <SimulatedTag>Simulated order</SimulatedTag></>} />
      <section className="card overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Basket lines</caption>
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Product</th>
              <th className="px-3 py-3 text-right font-medium">Qty</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="num divide-y divide-line">
            {receipt.lines.map((l) => (
              <tr key={l.productId}>
                <td className="px-5 py-2.5">
                  <span className="font-medium">{l.title}</span>
                  <span className="block text-xs text-muted">{l.brand}, {formatInr(l.unitPriceInr)} each</span>
                </td>
                <td className="px-3 py-2.5 text-right">{l.packs}</td>
                <td className="px-5 py-2.5 text-right">{formatInr(l.lineTotalInr)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="num border-t border-line">
            <tr>
              <td className="px-5 py-2 text-muted" colSpan={2}>Delivery and platform fees</td>
              <td className="px-5 py-2 text-right text-muted">Unknown, not included</td>
            </tr>
            <tr className="text-base">
              <td className="px-5 py-3 font-semibold" colSpan={2}>Total</td>
              <td className="px-5 py-3 text-right font-semibold">{formatInr(receipt.totalInr)}</td>
            </tr>
            {basket.budgetInr != null && (
              <tr>
                <td className="px-5 pb-3 text-muted" colSpan={2}>Budget ({basket.budgetMode})</td>
                <td className={`px-5 pb-3 text-right ${over ? 'text-warn' : 'text-muted'}`}>{formatInr(basket.budgetInr)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </section>

      {over && basket.budgetMode === 'hard' && <Notice tone="warn" className="mt-4" title="Over your hard budget">Go back to groceries to accept cheaper options or change the budget.</Notice>}
      {over && basket.budgetMode === 'flexible' && <Notice tone="warn" className="mt-4">This basket is over your flexible budget by {formatInr(basket.totalInr - basket.budgetInr!)}. You can still approve it.</Notice>}
      {!online && <Notice tone="warn" className="mt-4" title="You are offline">Approval and checkout need a connection.</Notice>}
      {error && <Notice tone="danger" className="mt-4" title="Order not placed">{error}</Notice>}

      <section className="card mt-4 p-5 sm:p-6">
        {!approved ? (
          <>
            <h2 className="text-lg font-semibold">Step 1: approve this exact basket</h2>
            <p className="mt-1 text-sm text-muted">Approval locks version {basket.version} and its total of {formatInr(basket.totalInr)}. Any later change to the basket needs a new approval.</p>
            <Button className="mt-4" onClick={approve} loading={busy} disabled={!canApprove || !online}>
              Approve basket
            </Button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Step 2: place the simulated order</h2>
            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-forest" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>I understand this is a simulated order. No retailer is contacted, nothing is delivered and no payment is taken.</span>
            </label>
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer">Testing options</summary>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-forest" checked={failTest} onChange={(e) => setFailTest(e.target.checked)} />
                Simulate a provider failure for this attempt
              </label>
            </details>
            <Button size="lg" className="mt-4 w-full sm:w-auto" icon={<ShieldCheck className="h-5 w-5" aria-hidden />} onClick={placeOrder} loading={busy} disabled={!confirmed || !online}>
              Place simulated order for {formatInr(basket.totalInr)}
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
