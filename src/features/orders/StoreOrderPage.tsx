// Order the approved basket from a real quick-commerce store.
//
// 1. Swiggy Instamart, automatic: the app searches Instamart for each basket line, picks a
//    product that passes the same safety checks the evaluation scores, fills the Instamart
//    cart, shows the cart for review, and only orders after the person confirms.
//    Until Swiggy Builders Club grants production access this runs against an in-app
//    sandbox with the same tools and response shape. No real order is placed.
// 2. Instamart or Zepto, by hand: a checklist with a link that opens each item in the
//    store's own search. Zepto has no public ordering API, so this is the honest option.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink, ShoppingCart } from 'lucide-react';
import { useActiveProfile, useBasket, useBundle } from '../../app/hooks.ts';
import { useApp } from '../../app/context.tsx';
import { Button, EmptyState, ErrorState, Notice, PageHeader, Spinner, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { formatInr } from '../../lib/format.ts';
import { planInstamartCart, placeOrder, pushCart, searchQueries, STORE_LINKS, type CartPlan, type CartReview } from '../../domain/commerce/instamart.ts';
import { createMockInstamart } from '../../domain/commerce/instamartMock.ts';
import type { BasketLine } from '../../domain/grocery/optimise.ts';

const fmtQty = (q: number, unit: string) => (unit === 'piece' ? `${Math.ceil(q)} pcs` : q >= 1000 ? `${(q / 1000).toFixed(q % 1000 ? 1 : 0)} ${unit === 'g' ? 'kg' : 'L'}` : `${Math.round(q)} ${unit}`);

export function StoreOrderPage() {
  const nav = useNavigate();
  const { toast } = useApp();
  const { profile } = useActiveProfile();
  const basketQ = useBasket(profile?.id);
  const bundleQ = useBundle(profile?.id);
  // One sandbox per visit, so its cart persists between the steps below.
  const sandbox = useMemo(() => createMockInstamart(), []);
  const [plan, setPlan] = useState<CartPlan | null>(null);
  const [review, setReview] = useState<CartReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'plan' | 'push' | 'order' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  if (!profile) return null;
  if (basketQ.isLoading || bundleQ.isLoading) return <Spinner label="Loading basket" />;
  if (basketQ.error || bundleQ.error) return <ErrorState error={basketQ.error ?? bundleQ.error} />;
  const basket = basketQ.data;
  const b = bundleQ.data;
  if (!basket || !b || basket.status !== 'APPROVED')
    return (
      <EmptyState title="Approve a basket first" action={<Button onClick={() => nav('/checkout')}>Review basket</Button>}>
        Store orders start from an approved basket, so you have checked the items and the total.
      </EmptyState>
    );

  const lines = basket.lines.filter((l) => l.demandQty > 0);
  const rules = { dietPattern: b.preferences.dietPattern!, allergies: b.preferences.allergies, hardExclusions: b.preferences.hardExclusions };
  const itemCount = review?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  async function step<T>(name: 'plan' | 'push' | 'order', fn: () => Promise<T>): Promise<T | null> {
    setBusy(name);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return null;
    } finally {
      setBusy(null);
    }
  }

  const buildPlan = () => step('plan', async () => {
    setReview(null);
    setConfirmed(false);
    setOrderId(null);
    setPlan(await planInstamartCart(sandbox.call, lines, CAT.ingredients, rules));
  });
  const fillCart = () => step('push', async () => setReview(await pushCart(sandbox.call, plan!)));
  const order = () => step('order', async () => {
    const r = await placeOrder(sandbox.call, plan!, { confirmedByUser: true, totalInr: review!.totalInr, itemCount });
    setOrderId(r.orderId);
    toast('Sandbox order placed');
  });

  function shoppingListText(ls: BasketLine[]) {
    return ls.map((l) => `- ${l.name}: ${fmtQty(l.demandQty, l.unit)}`).join('\n');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/checkout" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to basket
      </Link>
      <PageHeader title="Order from a store" description={`${lines.length} items for ${profile.displayName}, approved at ${formatInr(basket.totalInr)} in sample prices.`} />

      {/* ---------------------------------------------------------------- automatic */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-medium">Swiggy Instamart, filled automatically</h2>
          <Tag tone="warn">Sandbox</Tag>
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          We search Instamart for each item, pick a product that fits your food rules and covers the amount you need, and put it in your Instamart cart. You check the cart before anything is ordered.
        </p>
        <Notice className="mt-3" tone="info">
          This runs on a sandbox copy of Instamart until Swiggy approves our Builders Club access. The steps are the same as the real service; no real order is placed and nothing is paid.
        </Notice>

        {!plan && (
          <Button className="mt-4" icon={<ShoppingCart className="h-4 w-4" aria-hidden />} onClick={buildPlan} loading={busy === 'plan'}>
            Find products on Instamart
          </Button>
        )}

        {plan && (
          <div className="mt-5">
            <h3 className="font-medium">
              {plan.items.length} of {lines.length} items found
            </h3>
            <ul className="mt-2 divide-y divide-outline-variant">
              {plan.items.map((i) => (
                <li key={i.spinId} className="grid grid-cols-[1fr_auto] gap-x-4 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{i.title}</span>
                    {i.quantity > 1 && <span className="text-on-surface-variant"> × {i.quantity}</span>}
                    <span className="block text-xs text-on-surface-variant">
                      For {i.lineName.toLowerCase()}: need {fmtQty(i.demandQty, i.unit)}, buying {fmtQty(i.coveredQty, i.unit)}
                      {i.confidence === 'medium' ? '. Close match, please check' : ''}
                    </span>
                  </span>
                  <span className="text-right">{formatInr(i.priceInr * i.quantity)}</span>
                </li>
              ))}
            </ul>

            {plan.skipped.length > 0 && (
              <div className="mt-4 rounded-ctl bg-surface-container p-4">
                <h3 className="text-sm font-medium">Not added. Please pick these yourself</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {plan.skipped.map((s) => (
                    <li key={s.ingredientId}>
                      <span className="font-medium">{s.lineName}</span>: {s.reason.toLowerCase()}.{' '}
                      <a className="text-primary hover:underline" href={STORE_LINKS.instamart(searchQueries({ name: s.lineName })[0])} target="_blank" rel="noreferrer">
                        Search Instamart
                      </a>
                      {s.refused.length > 0 && (
                        <details className="mt-1 text-xs text-on-surface-variant">
                          <summary className="cursor-pointer">Why {s.refused.length === 1 ? 'one product was' : `${s.refused.length} products were`} left out</summary>
                          <ul className="mt-1 list-disc pl-5">
                            {s.refused.map((r) => (
                              <li key={r.title}>
                                {r.title}: {r.reason}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!review && plan.items.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={fillCart} loading={busy === 'push'}>
                  Put {plan.items.length} items in my Instamart cart
                </Button>
                <Button variant="ghost" onClick={buildPlan}>Search again</Button>
              </div>
            )}
          </div>
        )}

        {review && !orderId && (
          <div className="mt-5 rounded-ctl border border-outline-variant p-4">
            <h3 className="font-medium">Your Instamart cart</h3>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt>Items ({itemCount})</dt>
              <dd className="text-right">{formatInr(review.itemTotalInr)}</dd>
              <dt>Delivery and fees</dt>
              <dd className="text-right">{formatInr(review.feesInr)}</dd>
              <dt className="font-medium">To pay</dt>
              <dd className="text-right font-medium">{formatInr(review.totalInr)}</dd>
            </dl>
            {review.problems.map((p) => (
              <Notice key={p} className="mt-3" tone="warn">{p}</Notice>
            ))}
            <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>I've checked the items and the total of {formatInr(review.totalInr)}. Place the order (sandbox: nothing is bought).</span>
            </label>
            <Button className="mt-3" onClick={order} loading={busy === 'order'} disabled={!confirmed || review.problems.length > 0}>
              Place order for {formatInr(review.totalInr)}
            </Button>
          </div>
        )}

        {orderId && (
          <Notice className="mt-5" tone="success" title={`Sandbox order ${orderId} placed`}>
            In the live version this order would appear in your Swiggy app for tracking. Nothing was bought here.
          </Notice>
        )}
        {error && <Notice className="mt-4" tone="danger">{error}</Notice>}
      </section>

      {/* ---------------------------------------------------------------- by hand */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Shop it yourself on Instamart or Zepto</h2>
            <p className="text-sm text-on-surface-variant">Each link opens the store's own search. Tick items off as you add them.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Copy className="h-4 w-4" aria-hidden />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shoppingListText(lines));
                toast('Shopping list copied');
              } catch {
                toast('Copy failed. Select the list and copy it instead.');
              }
            }}
          >
            Copy list
          </Button>
        </div>
        <ul className="mt-3 divide-y divide-outline-variant">
          {lines.map((l) => {
            const done = ticked.has(l.ingredientId);
            const q = searchQueries(l)[0];
            return (
              <li key={l.ingredientId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-primary"
                    checked={done}
                    onChange={() => setTicked((t) => {
                      const n = new Set(t);
                      if (n.has(l.ingredientId)) n.delete(l.ingredientId);
                      else n.add(l.ingredientId);
                      return n;
                    })}
                  />
                  <span className={done ? 'text-on-surface-variant line-through' : ''}>
                    {l.name} <span className="text-sm text-on-surface-variant">{fmtQty(l.demandQty, l.unit)}</span>
                  </span>
                </label>
                <span className="flex gap-3 text-sm">
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href={STORE_LINKS.instamart(q)} target="_blank" rel="noreferrer" aria-label={`Find ${l.name} on Instamart`}>
                    Instamart <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                  <a className="inline-flex items-center gap-1 text-primary hover:underline" href={STORE_LINKS.zepto(q)} target="_blank" rel="noreferrer" aria-label={`Find ${l.name} on Zepto`}>
                    Zepto <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </span>
              </li>
            );
          })}
        </ul>
        {ticked.size === lines.length && lines.length > 0 && (
          <Notice className="mt-3" tone="success" title="Everything ticked">
            <span className="inline-flex items-center gap-1"><Check className="h-4 w-4" aria-hidden /> Your list is complete.</span>
          </Notice>
        )}
      </section>
    </div>
  );
}
