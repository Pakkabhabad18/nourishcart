// Groceries (screens 11 + 13): consolidated demand, optimised simulated basket and the
// budget conversation. Every accepted change is reversible and re-validated.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { ChevronDown, Info, ShoppingBasket, Undo2, Users } from 'lucide-react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useBasket, useBundle, useGroceryPipeline, usePantry, useSavePlan, useSaveBundle, useSelectedPlan } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Button, EmptyState, ErrorState, Notice, PageHeader, RangeBar, Select, Sheet, SimulatedTag, Spinner, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { formatInr, formatQty } from '../../lib/format.ts';
import { unitPrice } from '../../domain/units.ts';
import { eligibleProducts } from '../../domain/grocery/optimise.ts';
import { mergePatch, type Alternative, type BasketPatch } from '../../domain/grocery/negotiate.ts';
import { restrictionsOf } from '../../domain/planning/plan.ts';
import { buildGroceryDemand } from '../../domain/grocery/demand.ts';
import { applyPatchToPlan, weeklyBudget } from '../../domain/pipeline.ts';
import type { StoredBasket } from '../../domain/orders/checkout.ts';
import { CATALOGUE_SNAPSHOT_AT } from '../../data/catalogue.ts';
import type { StoredPlan } from '../../domain/persistence/mappers.ts';

const KIND_LABEL: Record<Alternative['kind'], string> = {
  cheaper_pack: 'Cheaper packs',
  ingredient_swap: 'Ingredient swap',
  meal_consolidation: 'Fewer ingredients',
  remove_optional: 'Optional item',
  raise_budget: 'Budget',
};

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
  if (sources.length < 2) return <Notice>Only one profile has a selected plan. Choose plans for others to combine their groceries.</Notice>;
  const demand = buildGroceryDemand(sources, [], CAT);
  return (
    <div className="card overflow-hidden">
      <p className="border-b border-line px-5 py-3 text-sm text-muted">
        Combined demand for {sources.map((s) => s.profileName).join(', ')}. Each person keeps their own targets and budget (total of personal budgets: {formatInr(sources.reduce((s, x) => s + (x.budget ?? 0), 0))}). Ordering a combined basket is planned for a later version.
      </p>
      <ul className="divide-y divide-line">
        {demand.map((d) => (
          <li key={d.ingredientId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span className="font-medium">{d.name}</span>
            <span className="num text-muted">
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
  const [tab, setTab] = useState<'basket' | 'list' | 'household'>('basket');
  const [open, setOpen] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const [busy, setBusy] = useState(false);
  const pantryStock = useMemo(() => pantry.data?.map((p) => ({ profileId: p.profileId, ingredientId: p.ingredientId, quantity: p.quantity })), [pantry.data]);
  const pipe = useGroceryPipeline(bundle.data, plan, pantryStock);

  if (!profile) return <EmptyState title="Create a profile first" action={<Link className="link" to="/profiles">Go to profiles</Link>} />;
  if (isLoading || bundle.isLoading || pantry.isLoading) return <Spinner label="Preparing groceries" />;
  if (bundle.error) return <ErrorState error={bundle.error} />;
  if (!plan || !pipe)
    return (
      <>
        <PageHeader title="Groceries" />
        <EmptyState icon={<ShoppingBasket className="h-5 w-5" />} title="Choose a meal plan first" action={<Button onClick={() => nav('/plans')}>Go to meal plans</Button>}>
          The grocery list is built from the meals in your selected week.
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
  const buyLines = result.demand.filter((d) => d.toBuyQty > 0);

  async function applyPatch(next: BasketPatch, message: string) {
    await savePlan.mutateAsync({ ...plan!, patch: next });
    toast(message);
  }
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

  return (
    <>
      <PageHeader
        title="Groceries for this week"
        description={<>Built from {profile.displayName}’s selected plan, minus what is already in the pantry. <SimulatedTag>Simulated catalogue</SimulatedTag></>}
        actions={<Link to="/groceries/catalogue" className="inline-flex min-h-[44px] items-center rounded-ctl border border-line bg-surface px-4 font-medium hover:border-teal-300">Browse catalogue</Link>}
      />

      <section className="card p-5 sm:p-6" aria-labelledby="budget-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="budget-h" className="text-lg font-semibold">
            Basket total <span className="num">{formatInr(basket.totalInr)}</span>
          </h2>
          {budget != null ? (
            over ? <Tag tone="warn">{formatInr(basket.overBudgetByInr)} over your {basket.budgetMode} budget</Tag> : <Tag tone="good">{formatInr(budget - basket.totalInr)} under budget</Tag>
          ) : (
            <Tag>No budget set</Tag>
          )}
        </div>
        {budget != null && (
          <RangeBar
            ariaLabel={`Basket ${basket.totalInr} rupees against budget ${budget}`}
            min={0}
            max={Math.max(budget, basket.totalInr) * 1.15}
            value={basket.totalInr}
            valueLabel={formatInr(basket.totalInr)}
            tone={over ? 'warn' : 'good'}
            ticks={[{ at: budget, label: `Budget ${formatInr(budget)}` }]}
          />
        )}
        <p className="text-xs text-muted">{basket.feesNote} Prices last checked {new Date(CATALOGUE_SNAPSHOT_AT).toLocaleDateString('en-IN')} in the simulated catalogue.</p>
      </section>

      {over && (
        <section className="card mt-4 border-warn/40 p-5 sm:p-6" aria-labelledby="neg-h">
          <h2 id="neg-h" className="text-lg font-semibold">Bring the basket under {formatInr(budget!)}</h2>
          <p className="mt-1 text-sm text-muted">
            Biggest costs: {drivers.map((d) => `${d.name} (${formatInr(d.totalInr)}, ${d.sharePct}%)`).join(', ')}. Pick any changes below. Portions and nutrition checks never change silently.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {alternatives.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">{KIND_LABEL[a.kind]}</p>
                  <p className="font-medium">{a.title}</p>
                  <p className="text-sm text-muted">{a.detail}</p>
                  {a.nutritionNote && <p className={clsx('mt-0.5 text-sm', (a.proteinDeltaG ?? 0) < -5 ? 'text-warn' : 'text-muted')}>{a.nutritionNote}</p>}
                  {a.blocked && <p className="mt-0.5 text-sm font-medium text-danger">{a.blockedReason}</p>}
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  {a.savingsInr > 0 && <span className="num font-semibold text-forest">Save {formatInr(a.savingsInr)}</span>}
                  <Button size="sm" variant={a.kind === 'raise_budget' ? 'secondary' : 'primary'} disabled={a.blocked || !online || savePlan.isPending} onClick={() => accept(a)}>
                    {a.kind === 'raise_budget' ? 'Change budget' : 'Accept'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {accepted.length > 0 && (
        <section className="card mt-4 p-5" aria-labelledby="acc-h">
          <h2 id="acc-h" className="font-semibold">Changes you accepted</h2>
          <ul className="mt-2 divide-y divide-line">
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

      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        <button role="tab" aria-selected={tab === 'basket'} className="chip" onClick={() => setTab('basket')}>Basket ({basket.lines.length})</button>
        <button role="tab" aria-selected={tab === 'list'} className="chip" onClick={() => setTab('list')}>Ingredient list ({result.demand.length})</button>
        {all.filter((p) => !p.archived).length > 1 && (
          <button role="tab" aria-selected={tab === 'household'} className="chip" onClick={() => setTab('household')}>
            <Users className="h-4 w-4" aria-hidden /> Household view
          </button>
        )}
      </div>

      {tab === 'basket' && (
        <div className="mt-3 card overflow-hidden">
          {basket.unmatched.length > 0 && (
            <Notice tone="warn" className="m-4" title="Some ingredients could not be matched">
              {basket.unmatched.map((u) => <p key={u.ingredientId}>{u.name}: {u.reason}</p>)}
            </Notice>
          )}
          <ul className="divide-y divide-line">
            {basket.lines.map((l) => {
              const ing = CAT.ingredients.get(l.ingredientId)!;
              const cands = eligibleProducts(l.ingredientId, CAT.products, ing, restrictionsOf(b));
              const isOpen = open === l.ingredientId;
              return (
                <li key={l.ingredientId} className="px-4 py-3 sm:px-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{l.name}</p>
                      {l.picks.map((pk) => {
                        const p = CAT.products.find((x) => x.id === pk.productId)!;
                        const up = unitPrice(p.priceInr, p.packQty, p.packUnit);
                        return (
                          <p key={pk.productId} className="num text-sm text-muted">
                            {pk.packs} × {p.brand} {p.title} at {formatInr(p.priceInr)} ({formatInr(up.value)}{up.label})
                          </p>
                        );
                      })}
                      <p className="num text-xs text-muted">Need {formatQty(l.demandQty, l.unit)}, buying {formatQty(l.coveredQty, l.unit)}{l.leftoverQty > 0 ? `, ${formatQty(l.leftoverQty, l.unit)} left for later` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="num font-semibold">{formatInr(l.lineTotalInr)}</p>
                      <button className="mt-1 inline-flex items-center gap-1 text-xs text-teal" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.ingredientId)}>
                        Why this <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 rounded-ctl bg-canvas p-3 text-sm">
                      <ul className="list-disc space-y-0.5 pl-4 text-muted">
                        {l.reasons.map((r) => <li key={r}>{r}</li>)}
                        <li>Match score {l.matchScore} (versioned weights, not a nutrition claim)</li>
                      </ul>
                      {cands.length > 1 && (
                        <label className="mt-3 block">
                          <span className="text-xs font-medium">Pick a different product</span>
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
                            <option value="">Let NourishCart choose</option>
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.brand} {c.title}, {formatInr(c.priceInr)} ({c.tier})
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
        </div>
      )}

      {tab === 'list' && (
        <div className="mt-3 card overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Ingredient demand for the week</caption>
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Ingredient</th>
                <th className="px-3 py-3 text-right font-medium">Week needs</th>
                <th className="px-3 py-3 text-right font-medium">In pantry</th>
                <th className="px-5 py-3 text-right font-medium">To buy</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-line">
              {result.demand.map((d) => (
                <tr key={d.ingredientId}>
                  <td className="px-5 py-2.5">{d.name}{d.optional && <span className="text-muted"> (optional)</span>}</td>
                  <td className="px-3 py-2.5 text-right">{formatQty(d.requiredQty, d.unit)}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{d.pantryQty > 0 ? `−${formatQty(d.pantryQty, d.unit)}` : ''}</td>
                  <td className="px-5 py-2.5 text-right font-medium">{d.toBuyQty > 0 ? formatQty(d.toBuyQty, d.unit) : 'Covered'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            {buyLines.length} of {result.demand.length} ingredients need buying. Add staples you already have in <Link to="/pantry" className="link">Pantry</Link> to lower the basket.
          </p>
        </div>
      )}

      {tab === 'household' && <div className="mt-3"><HouseholdDemand selfId={profile.id} /></div>}

      <div className="sticky bottom-[72px] mt-6 flex flex-col items-end gap-2 bg-canvas/90 py-3 backdrop-blur lg:bottom-0">
        {hardBlocked && (
          <p className="flex items-center gap-1.5 text-sm text-warn">
            <Info className="h-4 w-4" aria-hidden /> Accept changes above or raise the budget before reviewing.
          </p>
        )}
        <Button size="lg" onClick={review} loading={busy} disabled={hardBlocked || !online || basket.lines.length === 0 || !result.validation.valid}>
          Review basket
        </Button>
      </div>

      <Sheet
        open={raise}
        onClose={() => setRaise(false)}
        title="Change your budget?"
        footer={<><Button variant="secondary" onClick={() => setRaise(false)}>Keep current budget</Button><Button onClick={confirmRaise} loading={saveBundle.isPending}>Set budget to {formatInr(Math.ceil(basket.totalInr))} a week</Button></>}
      >
        <p>This changes {profile.displayName}’s saved grocery budget from {formatInr(budget ?? 0)} to {formatInr(Math.ceil(basket.totalInr))} per week. The basket stays exactly as it is.</p>
      </Sheet>
    </>
  );
}
