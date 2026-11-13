// Groceries (screens 11 + 13): consolidated demand, optimised simulated basket and the
// budget conversation. Every accepted change is reversible and re-validated.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronDown, Minus, Plus, ShoppingBasket, Trash2, Undo2, Users } from 'lucide-react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useBasket, useBundle, useGroceryPipeline, usePantry, useSavePlan, useSaveBundle, useSelectedPlan } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Button, EmptyState, ErrorState, Input, Notice, PageHeader, Select, Sheet, Spinner, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { formatInr, formatQty } from '../../lib/format.ts';
import { unitPrice } from '../../domain/units.ts';
import { eligibleProducts, type BasketLine } from '../../domain/grocery/optimise.ts';
import { mergePatch, type Alternative, type BasketPatch } from '../../domain/grocery/negotiate.ts';
import { restrictionsOf } from '../../domain/planning/plan.ts';
import { buildGroceryDemand } from '../../domain/grocery/demand.ts';
import { applyPatchToPlan, weeklyBudget } from '../../domain/pipeline.ts';
import type { StoredBasket } from '../../domain/orders/checkout.ts';
import type { StoredPlan } from '../../domain/persistence/mappers.ts';


function describePatch(p: BasketPatch): { key: string; label: string; undo: BasketPatch }[] {
  const out: { key: string; label: string; undo: BasketPatch }[] = [];
  Object.entries(p.swaps ?? {}).forEach(([from, s]) => out.push({ key: `swap:${from}`, label: `${CAT.ingredients.get(from)?.name} replaced by ${CAT.ingredients.get(s.ingredientId)?.name}`, undo: { ...p, swaps: Object.fromEntries(Object.entries(p.swaps ?? {}).filter(([k]) => k !== from)) } }));
  (p.cheapestOnly ?? []).forEach((id) => out.push({ key: `pack:${id}`, label: `Cheapest packs for ${CAT.ingredients.get(id)?.name.toLowerCase()}`, undo: { ...p, cheapestOnly: (p.cheapestOnly ?? []).filter((x) => x !== id) } }));
  (p.removed ?? []).forEach((id) => out.push({ key: `rm:${id}`, label: `Skipped optional ${CAT.ingredients.get(id)?.name.toLowerCase()}`, undo: { ...p, removed: (p.removed ?? []).filter((x) => x !== id) } }));
  if ((p.mealReplacements ?? []).length) out.push({ key: 'meals', label: `${p.mealReplacements!.length} meal${p.mealReplacements!.length === 1 ? '' : 's'} changed to use fewer ingredients`, undo: { ...p, mealReplacements: [] } });
  Object.entries(p.skuOverrides ?? {}).forEach(([ing, pid]) => out.push({ key: `sku:${ing}`, label: `You chose ${CAT.products.find((x) => x.id === pid)?.title}`, undo: { ...p, skuOverrides: Object.fromEntries(Object.entries(p.skuOverrides ?? {}).filter(([k]) => k !== ing)) } }));
  return out;
}

function HouseholdDemand({ selfId }: { selfId: string }) {
  const { all } = useActiveProfile();
  const others = all.filter((p) => !p.archived && p.id !== selfId);
  const plans = useQueries({ queries: [selfId, ...others.map((o) => o.id)].map((id) => ({ queryKey: qk.plans(id), queryFn: () => store.listPlans(id) })) });
  const bundles = useQueries({ queries: [selfId, ...others.map((o) => o.id)].map((id) => ({ queryKey: qk.bundle(id), queryFn: () => store.getBundle(id) })) });
  const sources = plans
    .map((q, i) => {
      const plan = q.data?.find((p: StoredPlan) => p.status === 'selected');
      const b = bundles[i].data;
      return plan && b ? { profileId: b.profile.id, profileName: b.profile.displayName, plan: applyPatchToPlan(plan.draft, plan.patch ?? {}, b, CAT), budget: weeklyBudget(b) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (plans.some((q) => q.isLoading)) return <Spinner label="Combining profiles" />;
  if (sources.length < 2) return <Notice>Only one person has picked meals so far.</Notice>;
  const demand = buildGroceryDemand(sources, [], CAT);
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-outline-variant px-5 py-3 text-sm text-on-surface-variant">
        Everyone's needs together: {sources.map((s) => s.profileName).join(', ')}. Each person keeps their own targets and budget.
      </p>
      <ul className="divide-y divide-outline-variant">
        {demand.map((d) => (
          <li key={d.ingredientId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span className="font-medium">{d.name}</span>
            <span className="num text-on-surface-variant">
              {formatQty(d.requiredQty, d.unit)} = {d.sources.map((s) => `${s.profileName} ${formatQty(s.requiredQty, d.unit)}`).join(' + ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GroceriesPage() {
  const nav = useNavigate();
  const { online, toast } = useApp();
  const { profile, all } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const { plan, isLoading } = useSelectedPlan(profile?.id);
  const pantry = usePantry(profile?.id);
  const existing = useBasket(profile?.id);
  const savePlan = useSavePlan();
  const saveBundle = useSaveBundle();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'basket' | 'household'>('basket');
  const [open, setOpen] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAllAlts, setShowAllAlts] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const pantryStock = useMemo(() => pantry.data?.map((p) => ({ profileId: p.profileId, ingredientId: p.ingredientId, quantity: p.quantity })), [pantry.data]);
  const pipe = useGroceryPipeline(bundle.data, plan, pantryStock);

  if (!profile) return <EmptyState title="Create a profile first" action={<Link className="link" to="/profiles">Go to profiles</Link>} />;
  if (isLoading || bundle.isLoading || pantry.isLoading) return <Spinner label="Preparing groceries" />;
  if (bundle.error) return <ErrorState error={bundle.error} />;
  if (!plan || !pipe)
    return (
      <>
        <PageHeader title="Shopping list" />
        <EmptyState icon={<ShoppingBasket className="h-5 w-5" />} title="Pick your meals first" action={<Button onClick={() => nav('/plans')}>Pick meals</Button>}>
          The list is made from this week's meals.
        </EmptyState>
      </>
    );

  const { result, alternatives, drivers } = pipe;
  const basket = result.basket;
  const b = bundle.data!;
  const budget = basket.budgetInr;
  const over = basket.status === 'OVER_BUDGET';
  const hardBlocked = over && basket.budgetMode === 'hard';
  const accepted = describePatch(plan.patch ?? {});

  async function applyPatch(next: BasketPatch, message: string) {
    await savePlan.mutateAsync({ ...plan!, patch: next });
    toast(message);
  }
  // ---- cart edits (saved on the plan's patch, so totals, compare and cart filling all follow)
  const patch = plan.patch ?? {};
  const packsOf = (l: BasketLine) => l.picks.reduce((sum, k) => sum + k.packs, 0);
  async function changePacks(l: BasketLine, delta: number) {
    const n = packsOf(l) + delta;
    if (l.extra) {
      const pid = l.picks[0].productId;
      const extras = (patch.extras ?? []).map((x) => (x.productId === pid ? { ...x, packs: n } : x)).filter((x) => x.packs > 0);
      return applyPatch({ ...patch, extras }, n > 0 ? 'Updated' : `${l.name} removed`);
    }
    if (n <= 0) return removeLine(l);
    await applyPatch({ ...patch, packCount: { ...(patch.packCount ?? {}), [l.ingredientId]: n } }, 'Updated');
  }
  async function removeLine(l: BasketLine) {
    if (l.extra) return applyPatch({ ...patch, extras: (patch.extras ?? []).filter((x) => x.productId !== l.picks[0].productId) }, `${l.name} removed`);
    const pc = { ...(patch.packCount ?? {}) };
    delete pc[l.ingredientId];
    await applyPatch({ ...patch, packCount: pc, skip: [...new Set([...(patch.skip ?? []), l.ingredientId])] }, `${l.name} removed. Your meals still use it.`);
  }
  async function addProduct(productId: string) {
    const extras = [...(patch.extras ?? [])];
    const at = extras.findIndex((x) => x.productId === productId);
    if (at >= 0) extras[at] = { ...extras[at], packs: extras[at].packs + 1 };
    else extras.push({ productId, packs: 1 });
    await applyPatch({ ...patch, extras }, 'Added to your list');
    setAdding(false);
    setQuery('');
  }
  const restrictions = restrictionsOf(b);
  const q = query.trim().toLowerCase();
  const addable = !adding
    ? []
    : CAT.products
        .filter((p) => p.available && (!q || `${p.brand} ${p.title} ${CAT.ingredients.get(p.ingredientId)?.name ?? ''}`.toLowerCase().includes(q)))
        .filter((p) => eligibleProducts(p.ingredientId, CAT.products, CAT.ingredients.get(p.ingredientId)!, restrictions).some((c) => c.id === p.id))
        .slice(0, 30);

  async function accept(a: Alternative) {
    if (a.kind === 'raise_budget') return setRaise(true);
    await applyPatch(mergePatch(plan!.patch ?? {}, a.patch), `Applied: ${a.title.toLowerCase()}`);
  }
  async function confirmRaise() {
    const amount = Math.ceil(basket.totalInr);
    await saveBundle.mutateAsync({ ...b, budget: { ...b.budget, amountInr: b.budget.period === 'weekly' ? amount : Math.ceil(amount * 4.33), period: b.budget.period } });
    setRaise(false);
    toast('Budget updated');
  }
  async function review() {
    setBusy(true);
    const prev = existing.data;
    const now = new Date().toISOString();
    const next: StoredBasket = {
      id: prev?.id ?? crypto.randomUUID(),
      profileId: profile!.id,
      ownerUserId: b.profile.ownerUserId,
      version: (prev?.version ?? 0) + 1,
      status: basket.status,
      provider: 'SIMULATED',
      lines: basket.lines,
      totalInr: basket.totalInr,
      budgetInr: basket.budgetInr,
      budgetMode: basket.budgetMode,
      approvedAt: null,
      approvedVersion: null,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      catalogueSnapshotAt: basket.catalogueSnapshotAt,
      planId: plan!.id,
    };
    try {
      const saved = await store.saveBasket(next);
      qc.setQueryData(qk.basket(profile!.id), saved);
      nav('/checkout');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the basket');
    } finally {
      setBusy(false);
    }
  }

  const alts = showAllAlts ? alternatives.slice(0, 8) : alternatives.slice(0, 3);
  return (
    <>
      <PageHeader
        title="Shopping list"
        description={`${basket.lines.length} items for this week's meals, minus what's in your pantry.`}
      />

      {/* Total and budget in one line, with a thin bar. */}
      <section className="card p-5" aria-labelledby="budget-h">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="budget-h" className="num text-2xl">{formatInr(basket.totalInr)}</h2>
          {budget != null ? (
            over ? <Tag tone="warn">{formatInr(basket.overBudgetByInr)} over budget</Tag> : <Tag tone="good">{formatInr(budget - basket.totalInr)} under budget</Tag>
          ) : (
            <Tag>No budget set</Tag>
          )}
        </div>
        {budget != null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container-highest" aria-hidden>
            <div className={clsx('h-full rounded-full', over ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.min(100, (basket.totalInr / budget) * 100)}%` }} />
          </div>
        )}
        <p className="mt-2 text-xs text-on-surface-variant">Estimate from our price list. Real store prices are checked in the next step.</p>
        <Link to="/groceries/compare" className="mt-4 flex min-h-[52px] items-center justify-center rounded-full bg-primary px-6 font-medium text-on-primary hover:brightness-110">
          Compare Zepto and Instamart
        </Link>
        <p className="mt-2 text-center text-xs text-on-surface-variant">Finds the cheapest store for this list and fills your cart there.</p>
      </section>

      {over && (
        <section className="card mt-4 p-5" aria-labelledby="neg-h">
          <h2 id="neg-h" className="font-medium">Ways to save</h2>
          <p className="mt-0.5 text-sm text-on-surface-variant">Biggest costs: {drivers.slice(0, 3).map((d) => d.name).join(', ')}.</p>
          <ul className="mt-2 divide-y divide-outline-variant">
            {alts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  {a.nutritionNote && <p className={clsx('text-sm', (a.proteinDeltaG ?? 0) < -5 ? 'text-warning' : 'text-on-surface-variant')}>{a.nutritionNote}</p>}
                  {a.blocked && <p className="text-sm text-error">{a.blockedReason}</p>}
                </div>
                {a.savingsInr > 0 && <span className="num shrink-0 text-sm text-primary">−{formatInr(a.savingsInr)}</span>}
                <Button size="sm" variant={a.kind === 'raise_budget' ? 'secondary' : 'tonal'} disabled={a.blocked || !online || savePlan.isPending} onClick={() => accept(a)}>
                  {a.kind === 'raise_budget' ? 'Change budget' : 'Apply'}
                </Button>
              </li>
            ))}
          </ul>
          {alternatives.length > 3 && !showAllAlts && (
            <Button variant="ghost" size="sm" onClick={() => setShowAllAlts(true)}>
              More ideas
            </Button>
          )}
        </section>
      )}

      {accepted.length > 0 && (
        <section className="card mt-4 p-5" aria-labelledby="acc-h">
          <h2 id="acc-h" className="font-medium">Your changes</h2>
          <ul className="mt-2 divide-y divide-outline-variant">
            {accepted.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{c.label}</span>
                <Button size="sm" variant="ghost" icon={<Undo2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => applyPatch(c.undo, 'Change undone')} disabled={!online}>
                  Undo
                </Button>
              </li>
            ))}
          </ul>
          {!result.validation.valid && <Notice tone="warn" className="mt-3">{result.validation.issues[0]}</Notice>}
        </section>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-medium">Items</h2>
        <div className="flex gap-3 text-sm">
          <Link to="/pantry" className="text-primary">Have some at home?</Link>
          {all.filter((p) => !p.archived).length > 1 && (
            <button className="inline-flex items-center gap-1 text-primary" onClick={() => setTab(tab === 'household' ? 'basket' : 'household')}>
              <Users className="h-4 w-4" aria-hidden /> {tab === 'household' ? 'Just me' : 'Whole household'}
            </button>
          )}
        </div>
      </div>

      {tab === 'basket' && (
        <div className="mt-2 card overflow-hidden">
          {basket.unmatched.length > 0 && (
            <Notice tone="warn" className="m-4" title="Couldn't find some items">
              {basket.unmatched.map((u) => <p key={u.ingredientId}>{u.name}: {u.reason}</p>)}
            </Notice>
          )}
          <ul className="divide-y divide-outline-variant">
            {basket.lines.map((l) => {
              const ing = CAT.ingredients.get(l.ingredientId)!;
              const cands = eligibleProducts(l.ingredientId, CAT.products, ing, restrictionsOf(b));
              const isOpen = open === l.ingredientId;
              const pk = l.picks[0];
              const prod = pk ? CAT.products.find((x) => x.id === pk.productId) : undefined;
              return (
                <li key={`${l.ingredientId}${l.extra ? '-extra' : ''}`}>
                  {/* Row: name and packs (tap for details), quantity stepper, remove. */}
                  <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
                    <button className="min-w-0 flex-1 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.ingredientId)}>
                      <span className="flex items-center gap-1 font-semibold">
                        <span className="truncate">{l.name}</span>
                        {l.extra && <Tag tone="good">Added</Tag>}
                        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-on-surface-variant transition-transform', isOpen && 'rotate-180')} aria-hidden />
                      </span>
                      <span className="num block text-sm text-on-surface-variant">
                        {l.picks.map((x) => formatQty(CAT.products.find((y) => y.id === x.productId)!.packQty, CAT.products.find((y) => y.id === x.productId)!.packUnit)).join(' + ')}, <span className="font-medium text-on-surface">{formatInr(l.lineTotalInr)}</span>
                      </span>
                    </button>
                    <div className="flex items-center rounded-full border border-outline-variant" role="group" aria-label={`Packs of ${l.name}`}>
                      <button className="grid h-10 w-10 place-items-center text-primary disabled:opacity-30" aria-label={`One less ${l.name}`} disabled={!online || savePlan.isPending} onClick={() => changePacks(l, -1)}>
                        <Minus className="h-4 w-4" aria-hidden />
                      </button>
                      <span className="num w-6 text-center font-semibold" aria-live="polite">{packsOf(l)}</span>
                      <button className="grid h-10 w-10 place-items-center text-primary disabled:opacity-30" aria-label={`One more ${l.name}`} disabled={!online || savePlan.isPending} onClick={() => changePacks(l, 1)}>
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <button className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant hover:bg-error/[0.08] hover:text-error" aria-label={`Remove ${l.name}`} disabled={!online || savePlan.isPending} onClick={() => removeLine(l)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {l.adjusted && !l.extra && l.coveredQty < l.demandQty && <p className="-mt-1 px-4 pb-2 text-xs text-warning sm:px-5">Less than your meals need ({formatQty(l.demandQty, l.unit)}).</p>}
                  {isOpen && (
                    <div className="mx-4 mb-3 rounded-ctl bg-surface-container p-3 text-sm sm:mx-5">
                      {prod && <p>{prod.brand} {prod.title}, {formatInr(prod.priceInr)} ({formatInr(unitPrice(prod.priceInr, prod.packQty, prod.packUnit).value)}{unitPrice(prod.priceInr, prod.packQty, prod.packUnit).label})</p>}
                      <p className="num text-on-surface-variant">Meals need {formatQty(l.demandQty, l.unit)}{l.leftoverQty > 0 ? `; ${formatQty(l.leftoverQty, l.unit)} left over for later` : ''}.</p>
                      {cands.length > 1 && (
                        <label className="mt-3 block">
                          <span className="text-xs font-medium">Choose a different product</span>
                          <Select
                            className="mt-1"
                            value={plan.patch.skuOverrides?.[l.ingredientId] ?? ''}
                            disabled={!online}
                            onChange={(e) => {
                              const v = e.target.value;
                              const sku = { ...(plan.patch.skuOverrides ?? {}) };
                              if (v) sku[l.ingredientId] = v;
                              else delete sku[l.ingredientId];
                              applyPatch({ ...plan.patch, skuOverrides: sku }, 'Product updated');
                            }}
                          >
                            <option value="">Best value (our pick)</option>
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.brand} {c.title}, {formatInr(c.priceInr)}
                              </option>
                            ))}
                          </Select>
                        </label>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant px-4 py-3 sm:px-5">
            <Button variant="tonal" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)} disabled={!online}>
              Add an item
            </Button>
            {(plan.patch.skip ?? []).length > 0 && (
              <span className="flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
                Not buying:
                {(plan.patch.skip ?? []).map((id) => (
                  <button key={id} className="chip min-h-[32px] py-0.5 text-xs" onClick={() => applyPatch({ ...plan.patch, skip: (plan.patch.skip ?? []).filter((x) => x !== id) }, 'Back on the list')}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> {CAT.ingredients.get(id)?.name}
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === 'household' && <div className="mt-3"><HouseholdDemand selfId={profile.id} /></div>}

      {/* Without the browser helper, a practice checkout still lets you finish the flow. */}
      <div className="mt-6 text-center">
        {hardBlocked && <p className="mb-2 text-sm text-warning">Apply a saving above or change your budget first.</p>}
        <Button variant="ghost" onClick={review} loading={busy} disabled={hardBlocked || !online || basket.lines.length === 0 || !result.validation.valid}>
          Practice checkout (no real order)
        </Button>
      </div>

      <Sheet open={adding} onClose={() => (setAdding(false), setQuery(''))} title="Add to your list" wide>
        <Input aria-label="Search products" placeholder="Search: milk, banana, atta…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <p className="mt-2 text-xs text-on-surface-variant">Only products that fit {profile.displayName}'s food rules and allergies are shown.</p>
        <ul className="mt-2 max-h-[50vh] divide-y divide-outline-variant overflow-y-auto">
          {addable.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.brand} {p.title}</span>
                <span className="num text-sm text-on-surface-variant">{formatQty(p.packQty, p.packUnit)}, {formatInr(p.priceInr)}</span>
              </span>
              <Button size="sm" onClick={() => addProduct(p.id)} disabled={savePlan.isPending}>Add</Button>
            </li>
          ))}
          {addable.length === 0 && <li className="py-4 text-sm text-on-surface-variant">Nothing found. Try another word.</li>}
        </ul>
      </Sheet>

      <Sheet
        open={raise}
        onClose={() => setRaise(false)}
        title="Change your budget?"
        footer={<><Button variant="secondary" onClick={() => setRaise(false)}>Keep it</Button><Button onClick={confirmRaise} loading={saveBundle.isPending}>Make it {formatInr(Math.ceil(basket.totalInr))} a week</Button></>}
      >
        <p>Your budget goes from {formatInr(budget ?? 0)} to {formatInr(Math.ceil(basket.totalInr))} a week. The list stays the same.</p>
      </Sheet>
    </>
  );
}
