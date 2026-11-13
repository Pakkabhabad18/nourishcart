// Meal plans: three-plan comparison (FR-007/008) and the selected week (FR-009/010).
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarDays, Clock, Minus, Plus, RefreshCw, Repeat2 } from 'lucide-react';
import { store } from '../../lib/store/index.ts';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useBundle, useSavePlan, useSelectedPlan } from '../../app/hooks.ts';
import { Button, EmptyState, ErrorState, Notice, PageHeader, Sheet, Spinner, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { evaluatePlan, OPTION_META, replaceMeal, replacementCandidates, roundServings, SERVING_MAX, SERVING_MIN, SERVING_STEP, type PlannedMeal } from '../../domain/planning/plan.ts';
import { aggregateRecipeNutrition } from '../../domain/recipes/aggregate.ts';
import { applyPatchToPlan, runPipeline } from '../../domain/pipeline.ts';
import type { StoredPlan } from '../../domain/persistence/mappers.ts';
import type { ProfileBundle } from '../../domain/types.ts';
import { dayLong, dayName, formatInr, SLOT_LABEL, servingsLabel, todayIndex } from '../../lib/format.ts';
import { validateProfileForNutrition } from '../../domain/nutrition/eligibility.ts';
import { ScopeMessage } from '../nutrition/NutritionPage.tsx';

function Compare({ plans, bundle, onChoose, choosing }: { plans: StoredPlan[]; bundle: ProfileBundle; onChoose: (p: StoredPlan) => void; choosing: string | null }) {
  const rows = useMemo(
    () =>
      plans
        .slice()
        .sort((a, b) => ['budget', 'balanced', 'goal'].indexOf(a.optionKey) - ['budget', 'balanced', 'goal'].indexOf(b.optionKey))
        .map((p) => {
          const ev = evaluatePlan(p.draft, p.targets, CAT, bundle.preferences.groceryTier);
          const basket = runPipeline({ bundle, plan: p.draft, targets: p.targets, patch: {}, pantry: [], cat: CAT }).basket;
          return { p, ev, basket };
        }),
    [plans, bundle],
  );
  const minCost = Math.min(...rows.map((r) => r.basket.totalInr));
  const maxVariety = Math.max(...rows.map((r) => r.ev.distinctRecipes));
  const t = plans[0].targets;
  const proteinAim = t.proteinTargetG ?? t.proteinEarG;
  return (
    <div className="space-y-3">
      {rows.map(({ p, ev, basket }) => {
        const meta = OPTION_META[p.optionKey];
        const dishes = [...new Set(p.draft.meals.map((m) => m.recipeId))].slice(0, 4).map((id) => CAT.recipes.get(id)!.name);
        return (
          <article key={p.id} className="card p-5" aria-labelledby={`opt-${p.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`opt-${p.id}`} className="text-lg font-medium">{meta.label}</h2>
              {basket.totalInr === minCost && p.optionKey !== 'budget' && <Tag tone="good">Cheapest</Tag>}
              {ev.distinctRecipes === maxVariety && p.optionKey !== 'balanced' && <Tag>Most dishes</Tag>}
            </div>
            <p className="mt-0.5 text-sm text-on-surface-variant">{meta.emphasis}</p>
            {/* Three numbers people compare on: cost, protein against their own target, variety. */}
            <dl className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-on-surface-variant">Groceries</dt>
                <dd className="num text-lg">{formatInr(basket.totalInr)}</dd>
              </div>
              <div>
                <dt className="text-xs text-on-surface-variant">Protein a day</dt>
                <dd className={clsx('num text-lg', ev.dailyAverage.proteinG < proteinAim * 0.9 && 'text-warning')}>
                  {Math.round(ev.dailyAverage.proteinG)}<span className="text-sm text-on-surface-variant">/{proteinAim} g</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-on-surface-variant">Dishes</dt>
                <dd className="num text-lg">{ev.distinctRecipes}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-on-surface-variant">{dishes.join(', ')}{p.draft.meals.length > 4 ? '…' : ''}</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-primary">More numbers</summary>
              <dl className="num mt-2 grid grid-cols-2 gap-y-1 text-on-surface-variant">
                <dt>Calories a day</dt><dd className="text-right text-on-surface">{ev.dailyAverage.energyKcal.toLocaleString('en-IN')} / {t.energyKcal.toLocaleString('en-IN')}</dd>
                <dt>Carbs / fat / fibre</dt><dd className="text-right text-on-surface">{Math.round(ev.dailyAverage.carbsG)} / {Math.round(ev.dailyAverage.fatG)} / {Math.round(ev.dailyAverage.fibreG)} g</dd>
                <dt>Iron / calcium</dt><dd className="text-right text-on-surface">{ev.dailyAverage.ironMg} / {ev.dailyAverage.calciumMg} mg</dd>
                <dt>Cooking time</dt><dd className="text-right text-on-surface">{ev.avgPrepMinutes} min a meal</dd>
              </dl>
            </details>
            {!ev.valid && <Notice tone="warn" className="mt-3">{ev.issues[0]}</Notice>}
            {basket.status === 'OVER_BUDGET' && <p className="mt-3 text-sm text-warning">{formatInr(basket.overBudgetByInr)} over your budget. You can swap to cheaper items later.</p>}
            <Button className="mt-4 w-full" onClick={() => onChoose(p)} loading={choosing === p.id}>
              Choose this plan
            </Button>
          </article>
        );
      })}
      <p className="text-xs text-on-surface-variant">All plans follow your food rules and allergies, and every day stays within 10% of your calories with at least {t.proteinEarG} g protein.</p>
    </div>
  );
}

function MealCard({ meal, plan, onReplace, onServings, disabled }: { meal: PlannedMeal; plan: StoredPlan; onReplace: () => void; onServings: (s: number) => void; disabled: boolean }) {
  const r = CAT.recipes.get(meal.recipeId)!;
  const t = aggregateRecipeNutrition(r, CAT.ingredients, meal.servings, plan.draft.swaps);
  return (
    <li className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-on-surface-variant">{SLOT_LABEL[meal.slot]}</p>
        <Link to={`/recipes/${r.id}?servings=${meal.servings}`} className="mt-0.5 block font-medium hover:text-primary">
          {r.name}
        </Link>
        <p className="num mt-1 flex flex-wrap gap-x-3 text-sm text-on-surface-variant">
          <span>{Math.round(t.energyKcal.value)} kcal</span>
          <span>{Math.round(t.proteinG.value)} g protein</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{r.prepMinutes} min</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-ctl border border-outline-variant" role="group" aria-label={`Servings for ${r.name}`}>
          <button className="grid h-10 w-10 place-items-center text-on-surface-variant hover:text-on-surface disabled:opacity-40" aria-label="Fewer servings" disabled={disabled || meal.servings <= SERVING_MIN} onClick={() => onServings(roundServings(meal.servings - SERVING_STEP))}>
            <Minus className="h-4 w-4" />
          </button>
          <span className="num w-[92px] whitespace-nowrap text-center text-sm" aria-live="polite">{servingsLabel(meal.servings)}</span>
          <button className="grid h-10 w-10 place-items-center text-on-surface-variant hover:text-on-surface disabled:opacity-40" aria-label="More servings" disabled={disabled || meal.servings >= SERVING_MAX} onClick={() => onServings(roundServings(meal.servings + SERVING_STEP))}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <Button size="sm" variant="secondary" icon={<Repeat2 className="h-4 w-4" aria-hidden />} onClick={onReplace} disabled={disabled}>
          Replace
        </Button>
      </div>
    </li>
  );
}

function Week({ plan, bundle }: { plan: StoredPlan; bundle: ProfileBundle }) {
  const savePlan = useSavePlan();
  const { online, toast } = useApp();
  const [day, setDay] = useState(todayIndex());
  const [replacing, setReplacing] = useState<PlannedMeal | null>(null);
  // The plan as eaten = draft + accepted grocery alternatives.
  const effective = useMemo(() => ({ ...plan, draft: applyPatchToPlan(plan.draft, plan.patch ?? {}, bundle, CAT) }), [plan, bundle]);
  const ev = useMemo(() => evaluatePlan(effective.draft, plan.targets, CAT, bundle.preferences.groceryTier), [effective, plan.targets, bundle]);
  const dEv = ev.days[day];
  const meals = effective.draft.meals.filter((m) => m.day === day);
  const candidates = useMemo(() => (replacing ? replacementCandidates(effective.draft, replacing.id, bundle, CAT).slice(0, 8) : []), [replacing, effective, bundle]);

  async function commit(next: StoredPlan, message: string) {
    await savePlan.mutateAsync(next);
    toast(message);
  }
  async function doReplace(recipeId: string) {
    if (!replacing) return;
    const res = replaceMeal(effective.draft, replacing.id, recipeId, null, bundle, CAT);
    if (!res.ok) return toast(res.reason);
    const m = res.plan.meals.find((x) => x.id === replacing.id)!;
    // Write into the draft and drop any budget alternative that targeted this meal.
    const draft = { ...plan.draft, meals: plan.draft.meals.map((x) => (x.id === m.id ? m : x)) };
    const patch = { ...plan.patch, mealReplacements: (plan.patch.mealReplacements ?? []).filter((r) => r.mealId !== m.id) };
    setReplacing(null);
    await commit({ ...plan, draft, patch }, `${SLOT_LABEL[m.slot]} on ${dayLong(m.day)} replaced`);
  }
  async function setServings(meal: PlannedMeal, s: number) {
    const draft = { ...plan.draft, meals: plan.draft.meals.map((x) => (x.id === meal.id ? { ...x, servings: s } : x)) };
    await commit({ ...plan, draft }, 'Servings updated');
  }

  const t = plan.targets;
  return (
    <>
      <div className="card mb-4 p-1.5 sm:p-2">
        <ul className="grid grid-cols-7 gap-0.5 sm:gap-1" role="tablist" aria-label="Days">
          {ev.days.map((d) => (
            <li key={d.day}>
              <button
                role="tab"
                aria-selected={day === d.day}
                onClick={() => setDay(d.day)}
                className={clsx('flex w-full flex-col items-center rounded-ctl px-0.5 py-2.5 text-xs sm:text-sm', day === d.day ? 'bg-primary text-on-primary' : 'hover:bg-on-surface/[0.06]')}
              >
                <span className="font-medium">{dayName(d.day)}</span>
                {d.day === todayIndex() && <span className="sr-only">(today)</span>}
                <span className={clsx('num text-[11px] sm:text-xs', day === d.day ? 'text-on-primary/80' : 'text-on-surface-variant')}>{Math.round(d.totals.energyKcal.value)}</span>
                <span className={clsx('mt-1 h-1.5 w-1.5 rounded-full', d.energyOk && d.proteinOk ? (day === d.day ? 'bg-secondary-container' : 'bg-primary') : 'bg-warning')} aria-label={d.energyOk && d.proteinOk ? 'Within targets' : 'Outside targets'} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="day-h">
          <h2 id="day-h" className="mb-3 text-xl font-normal">{dayLong(day)}</h2>
          <ul className="space-y-3">
            {meals.map((m) => (
              <MealCard key={m.id} meal={m} plan={effective} onReplace={() => setReplacing(m)} onServings={(s) => setServings(m, s)} disabled={!online || savePlan.isPending} />
            ))}
          </ul>
        </section>
        <aside className="space-y-4">
          <section className="card p-5">
            <h3 className="font-medium">This day</h3>
            <ul className="mt-3 space-y-3">
              {[
                { label: 'Calories', v: dEv.totals.energyKcal.value, aim: t.energyKcal, unit: 'kcal' },
                { label: 'Protein', v: dEv.totals.proteinG.value, aim: t.proteinTargetG ?? t.proteinEarG, unit: 'g' },
                { label: 'Carbs', v: dEv.totals.carbsG.value, aim: t.carbsG, unit: 'g' },
                { label: 'Fat', v: dEv.totals.fatG.value, aim: t.fatG, unit: 'g' },
                { label: 'Fibre', v: dEv.totals.fibreG.value, aim: t.fibreG, unit: 'g' },
              ].map((r) => (
                <li key={r.label}>
                  <div className="num flex justify-between text-sm">
                    <span className="text-on-surface-variant">{r.label}</span>
                    <span>
                      {Math.round(r.v).toLocaleString('en-IN')}
                      {r.aim ? <span className="text-on-surface-variant"> / {Math.round(r.aim).toLocaleString('en-IN')} {r.unit}</span> : ` ${r.unit}`}
                    </span>
                  </div>
                  {r.aim ? (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-container-highest" aria-hidden>
                      <div className={clsx('h-full rounded-full', r.v / r.aim < 0.85 ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.min(100, (r.v / r.aim) * 100)}%` }} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {(!dEv.energyOk || !dEv.proteinOk) && <Notice tone="warn" className="mt-3">This day is off target. Change servings or swap a meal.</Notice>}
          </section>
          {Object.keys(effective.draft.swaps).length > 0 && (
            <Notice title="Ingredient swaps from your basket choices">
              {Object.entries(effective.draft.swaps).map(([from, s]) => (
                <p key={from}>{CAT.ingredients.get(from)?.name} → {CAT.ingredients.get(s.ingredientId)?.name}</p>
              ))}
            </Notice>
          )}
          <Link to="/groceries" className="flex min-h-[48px] items-center justify-center rounded-full bg-primary px-4 font-medium text-on-primary hover:brightness-110">
            Shop for this week
          </Link>
          <Link to="/cook" className="flex min-h-[48px] items-center justify-center rounded-full border border-outline px-4 font-medium text-primary hover:bg-primary/[0.08]">
            Menu for my cook
          </Link>
        </aside>
      </div>

      <Sheet open={!!replacing} onClose={() => setReplacing(null)} title={replacing ? `Replace ${SLOT_LABEL[replacing.slot].toLowerCase()} on ${dayLong(replacing.day)}` : ''} wide>
        <p className="mb-3 text-sm text-on-surface-variant">Only this meal changes. All options follow your food rules.</p>
        <ul className="divide-y divide-outline-variant">
          {candidates.map((c) => (
            <li key={c.recipe.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.recipe.name}</p>
                <p className="num text-sm text-on-surface-variant">
                  {servingsLabel(c.servings)}, {c.recipe.prepMinutes} min;{' '}
                  <span className={c.deltaProteinG < 0 ? 'text-warning' : ''}>{c.deltaProteinG >= 0 ? '+' : ''}{c.deltaProteinG} g protein</span>,{' '}
                  {c.deltaKcal >= 0 ? '+' : ''}{c.deltaKcal} kcal, {c.deltaCostInr >= 0 ? '+' : '−'}₹{Math.abs(c.deltaCostInr)}
                </p>
              </div>
              <Button size="sm" onClick={() => doReplace(c.recipe.id)} loading={savePlan.isPending}>
                Use this
              </Button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

export function PlansPage() {
  const { profile } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const { plan, proposed, isLoading, error } = useSelectedPlan(profile?.id);
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { online, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [genError, setGenError] = useState<unknown>(null);
  const comparing = params.get('compare') === '1' || (!plan && proposed.length > 0);
  const autoStarted = useRef(false);

  if (!profile) return <EmptyState title="Create a profile first" action={<Link className="link" to="/profiles">Go to profiles</Link>} />;
  if (isLoading || bundle.isLoading) return <Spinner label="Loading plans" />;
  if (error) return <ErrorState error={error} />;
  const b = bundle.data!;
  const elig = validateProfileForNutrition(b);

  async function generate() {
    setBusy(true);
    setReasons(null);
    setGenError(null);
    try {
      const r = await store.generatePlans(profile!.id);
      if (!r.ok) setReasons(r.reasons);
      await qc.invalidateQueries({ queryKey: qk.plans(profile!.id) });
      await qc.invalidateQueries({ queryKey: qk.calc(profile!.id) });
      setParams({ compare: '1' });
    } catch (e) {
      setGenError(e);
    } finally {
      setBusy(false);
    }
  }
  async function choose(p: StoredPlan) {
    setChoosing(p.id);
    await store.selectPlan(p.id);
    await qc.invalidateQueries({ queryKey: qk.plans(profile!.id) });
    setChoosing(null);
    setParams({});
    toast(`${OPTION_META[p.optionKey].label} plan selected`);
  }

  // First visit: make the three options straight away instead of asking for another tap.
  if (!plan && proposed.length === 0 && !busy && !reasons && genError == null && online && elig.status === 'eligible' && !autoStarted.current) {
    autoStarted.current = true;
    queueMicrotask(generate);
  }

  if (elig.status !== 'eligible')
    return (
      <>
        <PageHeader title="Meal plans" />
        <ScopeMessage e={elig} />
        {elig.status === 'incomplete' && <Button className="mt-4" onClick={() => nav(`/profiles/${profile.id}/setup`)}>Finish profile setup</Button>}
      </>
    );

  if (busy || (!plan && proposed.length === 0 && !reasons && genError == null)) return <Spinner label="Making three plans for your week" />;

  if (comparing && proposed.length >= 1)
    return (
      <>
        <PageHeader
          title="Pick a plan for this week"
          description="You can change any meal later." 
          actions={
            <>
              {plan && <Button variant="secondary" onClick={() => setParams({})}>Back to current plan</Button>}
              <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={generate} disabled={!online}>
                New options
              </Button>
            </>
          }
        />
        {proposed.length < 3 && (
          <Notice className="mb-4" title={`Only ${proposed.length} different week${proposed.length === 1 ? '' : 's'} possible`}>
            Your food rules leave too few recipes for three different weeks. Removing a food you've excluded (not an allergy) gives more choice.
          </Notice>
        )}
        <Compare plans={proposed} bundle={b} onChoose={choose} choosing={choosing} />
      </>
    );

  if (!plan)
    return (
      <>
        <PageHeader title="Meal plans" />
        {reasons && (
          <Notice tone="warn" title="We couldn't make a plan that fits" className="mb-4">
            {reasons.map((r) => <p key={r}>{r}</p>)}
            <p className="mt-1">Allergies are never relaxed. Try allowing more cooking time or removing a food you've excluded.</p>
          </Notice>
        )}
        {genError != null && <ErrorState error={genError} />}
        <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="Make meal plans" action={<Button onClick={generate} disabled={!online}>Try again</Button>} />
      </>
    );

  return (
    <>
      <PageHeader
        title="This week's meals"
        description={`${OPTION_META[plan.optionKey].label} plan. Tap a dish for the recipe.`}
        actions={
          <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => (proposed.length >= 1 ? setParams({ compare: '1' }) : generate())} disabled={!online}>
            Change plan
          </Button>
        }
      />
      <Week plan={plan} bundle={b} />
    </>
  );
}
