// Compare this week's basket across Zepto and Swiggy Instamart.
//
// 1. The NourishCart Shopper extension opens each store's own search page for every item,
//    in the person's own browser (their location and login), and copies the visible text.
// 2. An AI model reads the products off each page. Every product is checked against the page
//    text, so nothing invented or planted by a page gets through (listings.ts).
// 3. Deterministic code picks the cheapest safe product per item and store and totals three
//    options: all from Zepto, all from Instamart, or the cheapest store per item (compare.ts).
// 4. Only after the person confirms, the extension clicks Add on the chosen products in their
//    own store tab. Nothing is ever paid for from here; checkout happens in the store's app.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Puzzle, Scale } from 'lucide-react';
import { useActiveProfile, useBundle, useGroceryPipeline, usePantry, useSelectedPlan } from '../../app/hooks.ts';
import { Button, EmptyState, ErrorState, Notice, PageHeader, Spinner, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { formatInr } from '../../lib/format.ts';
import { searchQueries } from '../../domain/commerce/instamart.ts';
import { compareStores, STORE_NAMES, type CompareLine, type Comparison, type StoreId } from '../../domain/commerce/compare.ts';
import type { Listing, PageInput, PageState } from '../../domain/commerce/listings.ts';
import { markCartFilled } from '../../lib/cartFilled.ts';
import { aiReadListings, detectShopper, fillStoreCart, readStorePages, STORE_SEARCH, type FillStatus, type ReadJob } from '../../lib/shopper.ts';
import { STORE_PAGES } from '../../eval/datasets/storePages.ts';

const STORES: StoreId[] = ['zepto', 'instamart'];
const STATE_TEXT: Record<Exclude<PageState, 'ok'>, string> = {
  login_required: 'asked you to log in',
  location_required: 'needs a delivery location',
  no_results: 'had no matching products',
  unreadable: "couldn't be read",
};

type Phase = { kind: 'idle' } | { kind: 'reading'; done: number; total: number } | { kind: 'ai'; done: number; total: number } | { kind: 'done' } | { kind: 'error'; message: string };

const fmtQty = (q: number, unit: string) => (unit === 'piece' ? `${Math.ceil(q)} pcs` : q >= 1000 ? `${(q / 1000).toFixed(q % 1000 ? 1 : 0)} ${unit === 'g' ? 'kg' : 'L'}` : `${Math.round(q)} ${unit}`);
const unitLabel = (unit: string) => (unit === 'piece' ? 'piece' : unit === 'ml' ? 'L' : 'kg');

export function ComparePage() {
  const nav = useNavigate();
  const { profile } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const { plan, isLoading } = useSelectedPlan(profile?.id);
  const pantry = usePantry(profile?.id);
  const pantryStock = useMemo(() => pantry.data?.map((p) => ({ profileId: p.profileId, ingredientId: p.ingredientId, quantity: p.quantity })), [pantry.data]);
  const pipe = useGroceryPipeline(bundle.data, plan, pantryStock);

  const [shopper, setShopper] = useState<'checking' | 'missing' | string>('checking');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [result, setResult] = useState<Comparison | null>(null);
  const [problems, setProblems] = useState<Record<StoreId, { item: string; state: PageState }[]>>({ zepto: [], instamart: [] });
  const [checksRejected, setChecksRejected] = useState(0);
  const [sample, setSample] = useState(false);
  // Cart filling: which store the person is confirming, and what happened per item.
  const [confirmStore, setConfirmStore] = useState<StoreId | null>(null);
  const [filling, setFilling] = useState<StoreId | null>(null);
  const [fillResults, setFillResults] = useState<Record<string, FillStatus>>({});
  const [mode, setMode] = useState<'single' | 'split'>('single');

  useEffect(() => {
    detectShopper().then((v) => setShopper(v ?? 'missing'));
  }, []);

  if (!profile) return null;
  if (isLoading || bundle.isLoading || pantry.isLoading) return <Spinner label="Preparing your basket" />;
  if (bundle.error) return <ErrorState error={bundle.error} />;
  if (!plan || !pipe || !bundle.data)
    return <EmptyState title="Pick your meals first" action={<Button onClick={() => nav('/plans')}>Pick meals</Button>}>We compare the shopping list for this week's meals.</EmptyState>;

  const b = bundle.data;
  const rules = { dietPattern: b.preferences.dietPattern!, allergies: b.preferences.allergies, hardExclusions: b.preferences.hardExclusions };
  // What's in the cart: the meals' need, or the amount the person set or added by hand.
  const basketLines: CompareLine[] = pipe.result.basket.lines
    .filter((l) => l.demandQty > 0 || l.adjusted)
    .map((l) => ({ ingredientId: l.ingredientId, name: l.name, demandQty: l.adjusted ? l.coveredQty : l.demandQty, unit: l.unit }));

  /** Shared second half: AI reads the pages, checks run, comparison is computed. */
  async function readAndCompare(lines: CompareLine[], pages: PageInput[]) {
    setPhase({ kind: 'ai', done: 0, total: 1 });
    const ai = await aiReadListings(pages, (done, total) => setPhase({ kind: 'ai', done, total }));
    if (ai.failedBatches && ai.failedBatches * 4 >= pages.length) {
      setPhase({ kind: 'error', message: 'The AI store reader is busy right now. Try again in a minute.' });
      return;
    }
    const listings: Record<StoreId, Record<string, Listing[]>> = { zepto: {}, instamart: {} };
    const probs: Record<StoreId, { item: string; state: PageState }[]> = { zepto: [], instamart: [] };
    let rejected = 0;
    for (const p of ai.pages) {
      const [store, ingredientId] = p.id.split(':') as [StoreId, string];
      listings[store][ingredientId] = p.listings;
      rejected += p.rejected.filter((r) => r.title !== '*').length;
      if (p.state !== 'ok' && p.state !== 'no_results') probs[store].push({ item: lines.find((l) => l.ingredientId === ingredientId)?.name ?? ingredientId, state: p.state });
    }
    setChecksRejected(rejected);
    setProblems(probs);
    setResult(compareStores(lines, listings, CAT.ingredients, rules));
    setPhase({ kind: 'done' });
  }

  async function runLive() {
    setSample(false);
    setResult(null);
    const jobs: ReadJob[] = basketLines.flatMap((l) => STORES.map((s) => ({ id: `${s}:${l.ingredientId}`, store: s, query: searchQueries(l)[0], url: STORE_SEARCH[s](searchQueries(l)[0]) })));
    const pages: PageInput[] = [];
    setPhase({ kind: 'reading', done: 0, total: jobs.length });
    await readStorePages(jobs, (job, text, _err, done, total) => {
      pages.push({ id: job.id, store: job.store, query: job.query, text: text ?? '' });
      setPhase({ kind: 'reading', done, total });
    });
    await readAndCompare(basketLines, pages);
  }

  /** Without the extension: the same AI and checks, on store pages saved earlier (toor dal, paneer). */
  async function runSample() {
    setSample(true);
    setResult(null);
    const lines: CompareLine[] = [
      { ingredientId: 'toor_dal', name: 'Toor dal (pigeon pea)', demandQty: 700, unit: 'g' },
      { ingredientId: 'paneer', name: 'Paneer', demandQty: 400, unit: 'g' },
    ];
    const saved = (id: string) => STORE_PAGES.find((p) => p.id === id)!.text;
    const pages: PageInput[] = [
      { id: 'zepto:toor_dal', store: 'zepto', query: 'toor dal', text: saved('zepto-toor') },
      { id: 'instamart:toor_dal', store: 'instamart', query: 'toor dal', text: saved('instamart-toor') },
      { id: 'zepto:paneer', store: 'zepto', query: 'paneer', text: saved('zepto-paneer') },
      { id: 'instamart:paneer', store: 'instamart', query: 'paneer', text: saved('login-wall') },
    ];
    await readAndCompare(lines, pages);
  }

  const busy = phase.kind === 'reading' || phase.kind === 'ai' || filling !== null;

  /**
   * Items to put in a store's cart. 'single' = everything that store has (one delivery);
   * 'split' = only the items where this store is the cheaper one.
   */
  const itemsFor = (s: StoreId, m: 'single' | 'split' = mode) =>
    result ? result.lines.filter((l) => (m === 'single' ? !!l.best[s] : l.cheapest === s)).map((l) => ({ line: l.line, pick: l.best[s]! })) : [];

  async function fill(s: StoreId) {
    setConfirmStore(null);
    setFilling(s);
    const items = itemsFor(s).map(({ line, pick }) => ({ id: line.ingredientId, store: s, url: STORE_SEARCH[s](searchQueries(line)[0]), title: pick.title, price: pick.priceInr, packs: pick.packs }));
    let added = 0;
    await fillStoreCart(items, (id, status) => {
      if (status === 'added' || status === 'already_in_cart') added++;
      setFillResults((r) => ({ ...r, [`${s}:${id}`]: status }));
    });
    setFilling(null);
    // Remembered in this browser so Today can show the week's groceries as done.
    if (added > 0) markCartFilled(plan!.id);
  }
  const best = result ? STORES.filter((s) => result.totals[s].found === result.lines.length).sort((a, c) => result.totals[a].costInr - result.totals[c].costInr)[0] : undefined;

  const ready = shopper !== 'checking' && shopper !== 'missing';
  const saving = best && result ? result.totals[best].costInr - result.split.costInr : 0;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/groceries" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Shopping list
      </Link>
      <PageHeader title="Compare stores" description={`Today's Zepto and Instamart prices for your ${basketLines.length} items, in your delivery area.`} />

      {!result && (
        <section className="card p-5">
          {shopper === 'checking' && <p className="text-sm text-on-surface-variant">Checking for the NourishCart helper…</p>}
          {shopper === 'missing' && (
            <>
              <div className="flex items-start gap-3">
                <Puzzle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div>
                  <h2 className="font-medium">One-time setup on a computer</h2>
                  <p className="text-sm text-on-surface-variant">A small Chrome or Edge add-on checks the stores in your own browser, so prices match your area.</p>
                </div>
              </div>
              <ol className="mt-3 list-decimal space-y-1.5 pl-10 text-sm">
                <li>
                  <a className="text-primary hover:underline" href="/nourishcart-shopper.zip" download>
                    Download the helper <Download className="inline h-3.5 w-3.5" aria-hidden />
                  </a>{' '}
                  and unzip it.
                </li>
                <li>Go to <code>chrome://extensions</code>, switch on Developer mode, click Load unpacked and pick the folder.</li>
                <li>Open zepto.com and swiggy.com/instamart once, sign in and set your address. Then reload this page.</li>
              </ol>
            </>
          )}
          {ready && <p className="text-sm"><Tag tone="good">Helper ready</Tag> Make sure you're signed in on both stores with your address set.</p>}

          <div className="mt-4 flex flex-wrap gap-3">
            {ready && (
              <Button size="lg" icon={<Scale className="h-4 w-4" aria-hidden />} onClick={runLive} loading={busy && !sample} disabled={busy}>
                Compare {basketLines.length} items
              </Button>
            )}
            <Button variant={ready ? 'ghost' : 'secondary'} onClick={runSample} loading={busy && sample} disabled={busy}>
              See an example
            </Button>
          </div>
          {phase.kind === 'reading' && <Progress label={`Checking store pages: ${phase.done} of ${phase.total}`} value={phase.done / Math.max(1, phase.total)} />}
          {phase.kind === 'ai' && <Progress label={`Reading products: ${phase.done} of ${phase.total}`} value={phase.done / Math.max(1, phase.total)} />}
          {phase.kind === 'error' && <Notice className="mt-4" tone="danger">{phase.message}</Notice>}
        </section>
      )}

      {result && (
        <>
          {sample && <Notice>Example using saved Zepto and Instamart pages for toor dal and paneer (13 Nov 2026). Instamart asked for a login on one page, so you can see how that's handled.</Notice>}
          {STORES.map((s) =>
            problems[s].length ? (
              <Notice key={s} tone="warn" title={`${STORE_NAMES[s]} ${STATE_TEXT[problems[s][0].state as Exclude<PageState, 'ok'>]} for ${problems[s].length} item${problems[s].length === 1 ? '' : 's'}`}>
                Open {STORE_NAMES[s]}, sign in or set your address, then compare again.
              </Notice>
            ) : null,
          )}

          {/* The answer first: which store, how much, one button. */}
          <section className="card p-5">
            {best ? (
              <>
                <p className="text-sm text-on-surface-variant">Cheapest for everything</p>
                <p className="mt-0.5 text-2xl">
                  {STORE_NAMES[best]} <span className="num">{formatInr(result.totals[best].costInr)}</span>
                </p>
                <p className="num text-sm text-on-surface-variant">
                  {STORES.filter((x) => x !== best).map((x) => `${STORE_NAMES[x]} ${result.totals[x].found === result.lines.length ? formatInr(result.totals[x].costInr) : `has ${result.totals[x].found} of ${result.lines.length}`}`).join(' · ')}
                </p>
              </>
            ) : (
              <p className="text-sm">Neither store has every item. Splitting across both covers {result.split.found} of {result.lines.length} for {formatInr(result.split.costInr)}.</p>
            )}

            {!sample && ready && (
              <>
                <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="How to order">
                  {best && (
                    <button role="radio" aria-checked={mode === 'single'} className="chip" onClick={() => setMode('single')}>
                      One store
                    </button>
                  )}
                  <button role="radio" aria-checked={mode === 'split' || !best} className="chip" onClick={() => setMode('split')}>
                    Split across both{saving > 0 ? `, save ${formatInr(saving)}` : ''}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {(mode === 'single' && best ? [best] : STORES.filter((x) => itemsFor(x, 'split').length)).map((x) => (
                    <Button key={x} size="lg" onClick={() => setConfirmStore(x)} disabled={busy} loading={filling === x}>
                      Fill my {STORE_NAMES[x]} cart ({itemsFor(x).length})
                    </Button>
                  ))}
                </div>
              </>
            )}
            {confirmStore && (
              <Notice className="mt-4" tone="warn" title={`Add ${itemsFor(confirmStore).length} items to your ${STORE_NAMES[confirmStore]} cart?`}>
                <ul className="mt-1 list-disc pl-5">
                  {itemsFor(confirmStore).map(({ line, pick }) => (
                    <li key={line.ingredientId}>
                      {pick.title}
                      {pick.packs > 1 ? ` × ${pick.packs}` : ''} ({formatInr(pick.costInr)})
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Store tabs open one by one. Nothing is paid; you check out in {STORE_NAMES[confirmStore]} yourself.</p>
                <div className="mt-3 flex gap-3">
                  <Button onClick={() => fill(confirmStore)}>Yes, add them</Button>
                  <Button variant="ghost" onClick={() => setConfirmStore(null)}>Cancel</Button>
                </div>
              </Notice>
            )}
            {Object.keys(fillResults).length > 0 && (
              <ul className="mt-4 space-y-1 text-sm" aria-live="polite">
                {Object.entries(fillResults).map(([k, st]) => {
                  const [st0, id] = k.split(':') as [StoreId, string];
                  const l = result.lines.find((x) => x.line.ingredientId === id);
                  const text: Record<FillStatus, string> = { added: 'added', already_in_cart: 'already in your cart', not_found: "couldn't find this exact product, please add it yourself", needs_login_or_location: 'sign in or set your address on the store, then try again', not_allowed: 'not allowed', error: 'something went wrong' };
                  return (
                    <li key={k}>
                      <Tag tone={st === 'added' || st === 'already_in_cart' ? 'good' : 'warn'}>{STORE_NAMES[st0]}</Tag> {l?.best[st0]?.title ?? id}: {text[st]}
                    </li>
                  );
                })}
              </ul>
            )}
            {Object.values(fillResults).some((x) => x === 'added' || x === 'already_in_cart') && !filling && (
              <p className="mt-3 text-sm font-medium">Done. Open the store app to check the cart and pay.</p>
            )}
            <p className="mt-4 text-xs text-on-surface-variant">Item prices only; each store adds its own delivery fees at checkout. {checksRejected > 0 ? `${checksRejected} product readings didn't match the page and were ignored.` : ''}</p>
          </section>

          <details className="card overflow-hidden">
            <summary className="cursor-pointer px-5 py-4 font-medium">Item by item</summary>
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-left text-on-surface-variant">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  {STORES.map((x) => (
                    <th key={x} className="px-4 py-2 font-medium">{STORE_NAMES[x]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {result.lines.map((r) => (
                  <tr key={r.line.ingredientId} className="align-top">
                    <td className="px-4 py-3">
                      <span className="font-medium">{r.line.name}</span>
                      <span className="block text-xs text-on-surface-variant">need {fmtQty(r.line.demandQty, r.line.unit)}</span>
                    </td>
                    {STORES.map((x) => {
                      const pk = r.best[x];
                      const refused = r.refused[x] ?? [];
                      return (
                        <td key={x} className={`px-4 py-3 ${r.cheapest === x ? 'bg-secondary-container/40' : ''}`}>
                          {pk ? (
                            <>
                              <span className="num font-medium">{formatInr(pk.costInr)}</span>
                              <span className="block">{pk.title}{pk.packs > 1 ? ` × ${pk.packs}` : ''}</span>
                              <span className="block text-xs text-on-surface-variant">{pk.pack}, {formatInr(Math.round(pk.unitPriceInr))}/{unitLabel(r.line.unit)}</span>
                            </>
                          ) : (
                            <span className="text-on-surface-variant">Not found</span>
                          )}
                          <span className="mt-1 flex flex-wrap gap-x-3 text-xs">
                            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={STORE_SEARCH[x](searchQueries(r.line)[0])} target="_blank" rel="noreferrer">
                              Open <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                            {refused.length > 0 && (
                              <details>
                                <summary className="cursor-pointer text-on-surface-variant">{refused.length} skipped</summary>
                                <ul className="mt-1 list-disc pl-4 text-on-surface-variant">
                                  {refused.slice(0, 8).map((y, i) => (
                                    <li key={i}>{y.title}: {y.reason}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          {result.missingEverywhere.length > 0 && <Notice>Not on either store: {result.missingEverywhere.join(', ')}.</Notice>}
          <Button variant="ghost" onClick={() => { setResult(null); setPhase({ kind: 'idle' }); setFillResults({}); }}>Compare again</Button>
        </>
      )}
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-4" role="status">
      <p className="text-sm">{label}</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}
