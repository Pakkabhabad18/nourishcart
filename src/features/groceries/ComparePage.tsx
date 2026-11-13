// Compare this week's basket across Zepto and Swiggy Instamart.
//
// 1. The NourishCart Shopper extension opens each store's own search page for every item,
//    in the person's own browser (their location and login), and copies the visible text.
// 2. AI (Gemini) reads the products off each page. Every product is checked against the page
//    text, so nothing invented or planted by a page gets through (listings.ts).
// 3. Deterministic code picks the cheapest safe product per item and store and totals three
//    options: all from Zepto, all from Instamart, or the cheapest store per item (compare.ts).
// Nothing is added to any cart and nothing is bought from this screen.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Puzzle, Scale } from 'lucide-react';
import { useActiveProfile, useBundle, useGroceryPipeline, usePantry, useSelectedPlan } from '../../app/hooks.ts';
import { Button, EmptyState, ErrorState, Notice, PageHeader, Spinner, Stat, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { formatInr } from '../../lib/format.ts';
import { searchQueries } from '../../domain/commerce/instamart.ts';
import { compareStores, STORE_NAMES, type CompareLine, type Comparison, type StoreId } from '../../domain/commerce/compare.ts';
import type { Listing, PageInput, PageState } from '../../domain/commerce/listings.ts';
import { aiReadListings, detectShopper, readStorePages, STORE_SEARCH, type ReadJob } from '../../lib/shopper.ts';
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
  const [model, setModel] = useState<string | null>(null);
  const [checksRejected, setChecksRejected] = useState(0);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    detectShopper().then((v) => setShopper(v ?? 'missing'));
  }, []);

  if (!profile) return null;
  if (isLoading || bundle.isLoading || pantry.isLoading) return <Spinner label="Preparing your basket" />;
  if (bundle.error) return <ErrorState error={bundle.error} />;
  if (!plan || !pipe || !bundle.data)
    return <EmptyState title="Choose a meal plan first" action={<Button onClick={() => nav('/plans')}>Go to meal plans</Button>}>The comparison uses this week's grocery basket.</EmptyState>;

  const b = bundle.data;
  const rules = { dietPattern: b.preferences.dietPattern!, allergies: b.preferences.allergies, hardExclusions: b.preferences.hardExclusions };
  const basketLines: CompareLine[] = pipe.result.basket.lines.filter((l) => l.demandQty > 0).map((l) => ({ ingredientId: l.ingredientId, name: l.name, demandQty: l.demandQty, unit: l.unit }));

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
    setModel(ai.model);
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

  const busy = phase.kind === 'reading' || phase.kind === 'ai';
  const best = result ? STORES.filter((s) => result.totals[s].found === result.lines.length).sort((a, c) => result.totals[a].costInr - result.totals[c].costInr)[0] : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/groceries" className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Groceries
      </Link>
      <PageHeader title="Compare prices" description={`Checks today's prices for your ${basketLines.length} grocery items on Zepto and Swiggy Instamart, using your own browser.`} />

      <section className="card p-5">
        {shopper === 'checking' && <p className="text-sm text-on-surface-variant">Looking for the NourishCart Shopper extension…</p>}
        {shopper === 'missing' && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Puzzle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div>
                <h2 className="font-medium">Add the NourishCart Shopper extension (Chrome or Edge, on a computer)</h2>
                <p className="text-sm text-on-surface-variant">It opens each store's search page in the background of your own browser, so prices match your delivery area. It only reads search results: it never logs in, adds to cart or pays.</p>
              </div>
            </div>
            <ol className="list-decimal space-y-1 pl-10 text-sm">
              <li>
                <a className="text-primary hover:underline" href="/nourishcart-shopper.zip" download>
                  Download the extension <Download className="inline h-3.5 w-3.5" aria-hidden />
                </a>{' '}
                and unzip it.
              </li>
              <li>
                Open <code>chrome://extensions</code>, turn on <strong>Developer mode</strong>, click <strong>Load unpacked</strong> and choose the unzipped folder.
              </li>
              <li>Open zepto.com and swiggy.com/instamart once and set your delivery location.</li>
              <li>Come back here and reload the page.</li>
            </ol>
          </div>
        )}
        {shopper !== 'checking' && shopper !== 'missing' && (
          <p className="text-sm">
            <Tag tone="good">Extension ready</Tag> Version {shopper}. Make sure your delivery location is set on both stores so prices are right for you.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button icon={<Scale className="h-4 w-4" aria-hidden />} onClick={runLive} loading={busy && !sample} disabled={busy || shopper === 'missing' || shopper === 'checking'}>
            Compare {basketLines.length} items now
          </Button>
          <Button variant="secondary" onClick={runSample} loading={busy && sample} disabled={busy}>
            Try it on saved store pages
          </Button>
        </div>
        {phase.kind === 'reading' && <Progress label={`Reading store pages in your browser: ${phase.done} of ${phase.total}`} value={phase.done / Math.max(1, phase.total)} />}
        {phase.kind === 'ai' && <Progress label={`AI is reading the products: ${phase.done} of ${phase.total} batches`} value={phase.done / Math.max(1, phase.total)} />}
        {phase.kind === 'error' && <Notice className="mt-4" tone="danger">{phase.message}</Notice>}
      </section>

      {result && (
        <>
          {sample && <Notice tone="info">Saved pages for toor dal and paneer, captured from Zepto and Instamart on 13 Nov 2026. Instamart asked for a login on the paneer page, so that one is shown as a problem.</Notice>}
          {STORES.map((s) =>
            problems[s].length ? (
              <Notice key={s} tone="warn" title={`${STORE_NAMES[s]} ${STATE_TEXT[problems[s][0].state as Exclude<PageState, 'ok'>]} for ${problems[s].length} item${problems[s].length === 1 ? '' : 's'}`}>
                Open {STORE_NAMES[s]} in this browser, sign in or set your location, then compare again. Affected: {problems[s].map((p) => p.item).join(', ')}.
              </Notice>
            ) : null,
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {STORES.map((s) => (
              <Stat key={s} label={`Everything from ${STORE_NAMES[s]}`} value={formatInr(result.totals[s].costInr)} sub={`${result.totals[s].found} of ${result.lines.length} items found${best === s ? ' · cheapest single store' : ''}`} />
            ))}
            <Stat label="Cheapest store for each item" value={formatInr(result.split.costInr)} sub={`${result.split.found} of ${result.lines.length} items; two deliveries`} />
          </div>
          <p className="text-xs text-on-surface-variant">
            Item prices only. Delivery, handling and small-cart fees depend on your cart and membership, and each store shows them at checkout. {sample ? 'Prices come from the saved pages' : 'Prices were read just now from your browser'}{model ? ` by AI (${model})` : ''}; {checksRejected} AI reading{checksRejected === 1 ? ' was' : 's were'} thrown out by our checks.
          </p>

          <section className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-left text-on-surface-variant">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  {STORES.map((s) => (
                    <th key={s} className="px-4 py-2 font-medium">
                      {STORE_NAMES[s]}
                    </th>
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
                    {STORES.map((s) => {
                      const p = r.best[s];
                      const refused = r.refused[s] ?? [];
                      return (
                        <td key={s} className={`px-4 py-3 ${r.cheapest === s ? 'bg-secondary-container/40' : ''}`}>
                          {p ? (
                            <>
                              <span className="font-medium">{formatInr(p.costInr)}</span> {r.cheapest === s && <Tag tone="good">Cheapest</Tag>}
                              <span className="block">
                                {p.title}
                                {p.packs > 1 ? ` × ${p.packs}` : ''}
                              </span>
                              <span className="block text-xs text-on-surface-variant">
                                {p.pack} · {formatInr(Math.round(p.unitPriceInr))}/{unitLabel(r.line.unit)}
                                {p.mrpInr ? ` · MRP ${formatInr(p.mrpInr)}` : ''}
                                {p.sponsored ? ' · ad' : ''}
                              </span>
                            </>
                          ) : (
                            <span className="text-on-surface-variant">Not found</span>
                          )}
                          <span className="mt-1 flex flex-wrap gap-x-3 text-xs">
                            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={STORE_SEARCH[s](searchQueries(r.line)[0])} target="_blank" rel="noreferrer">
                              Open <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                            {refused.length > 0 && (
                              <details>
                                <summary className="cursor-pointer text-on-surface-variant">{refused.length} left out</summary>
                                <ul className="mt-1 list-disc pl-4 text-on-surface-variant">
                                  {refused.slice(0, 8).map((x, i) => (
                                    <li key={i}>
                                      {x.title}: {x.reason}
                                    </li>
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
          </section>
          {result.missingEverywhere.length > 0 && <Notice tone="info">Not found on either store: {result.missingEverywhere.join(', ')}. Search for these yourself or pick a substitute.</Notice>}
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
