// Meal plans: three-plan comparison (FR-007/008) and the selected week (FR-009/010).
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarDays, Clock, Minus, Plus, RefreshCw, Repeat2 } from 'lucide-react';
import { store } from '../../lib/store/index.ts';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useBundle, useSavePlan, useSelectedPlan } from '../../app/hooks.ts';
import { Button, EmptyState, ErrorState, Notice, PageHeader, RangeBar, Sheet, Spinner, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { evaluatePlan, OPTION_META, replaceMeal, replacementCandidates, roundServings, SERVING_MAX, SERVING_MIN, SERVING_STEP, ENERGY_TOLERANCE, type PlannedMeal } from '../../domain/planning/plan.ts';
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
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {rows.map(({ p, ev, basket }) => {
        const meta = OPTION_META[p.optionKey];
        const dishes = [...new Set(p.draft.meals.map((m) => m.recipeId))].slice(0, 5).map((id) => CAT.recipes.get(id)!.name);
        return (
          <article key={p.id} className="card flex flex-col p-5" aria-labelledby={`opt-${p.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`opt-${p.id}`} className="text-lg font-medium">{meta.label}</h2>
              {basket.totalInr === minCost && <Tag tone="good">Lowest basket cost</Tag>}
              {ev.distinctRecipes === maxVariety && <Tag>Most variety</Tag>}
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">{meta.emphasis}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-on-surface-variant">Energy, daily average</dt>
                <dd className="num font-medium">{ev.dailyAverage.energyKcal.toLocaleString('en-IN')} kcal</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Protein, daily average</dt>
                <dd className="num font-medium">{ev.dailyAverage.proteinG} g <span className="font-normal text-on-surface-variant">(EAR {t.proteinEarG} g)</span></dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Carbs / fat / fibre</dt>
                <dd className="num font-medium">{ev.dailyAverage.carbsG} / {ev.dailyAverage.fatG} / {ev.dailyAverage.fibreG} g</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Iron / calcium</dt>
                <dd className="num font-medium">≈{ev.dailyAverage.ironMg} mg / ≈{ev.dailyAverage.calciumMg} mg</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Simulated basket</dt>
                <dd className="num font-medium">{formatInr(basket.totalInr)} <span className="font-normal text-on-surface-variant">this week</span></dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Food used</dt>
                <dd className="num font-medium">{formatInr(ev.dayCostInr)}/day</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Different dishes</dt>
                <dd className="num font-medium">{ev.distinctRecipes} in the week</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant">Average prep</dt>
                <dd className="num font-medium">{ev.avgPrepMinutes} min per meal</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm"><span className="text-on-surface-variant">Includes </span>{dishes.join(', ')}{p.draft.meals.length > 5 ? ' and more' : ''}.</p>
            {!ev.valid && <Notice tone="warn" className="mt-3">{ev.issues[0]}</Notice>}
            {basket.status === 'OVER_BUDGET' && <p className="mt-3 text-sm text-warning">The first basket is {formatInr(basket.overBudgetByInr)} over budget. You can pick cheaper options before approving.</p>}
            <div className="mt-auto pt-5">
              <Button className="w-full" onClick={() => onChoose(p)} loading={choosing === p.id}>
                Choose {meta.label}
              </Button>
            </div>
          </article>
        );
      })}
      <p className="text-xs text-on-surface-variant lg:col-span-3">
        Food used is the cost of the ingredients the week needs. The basket is what the first shop costs after rounding to whole packs, so it is higher when staples like oil and dal last beyond the week. Micronutrients are approximate: sample data and no cooking-loss factors. All three plans meet the same allergy, food-pattern, energy (±{ENERGY_TOLERANCE * 100}%) and protein checks.
      </p>
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
            <h3 className="font-medium">Day totals</h3>
            <RangeBar
              ariaLabel={`Day energy ${Math.round(dEv.totals.energyKcal.value)} kcal against target ${t.energyKcal}`}
              min={t.energyKcal * 0.7}
              max={t.energyKcal * 1.3}
              band={[t.energyKcal * (1 - ENERGY_TOLERANCE), t.energyKcal * (1 + ENERGY_TOLERANCE)]}
              value={dEv.totals.energyKcal.value}
              valueLabel={`${Math.round(dEv.totals.energyKcal.value)} kcal`}
              tone={dEv.energyOk ? 'good' : 'warn'}
              ticks={[{ at: t.energyKcal, label: 'estimate' }]}
            />
            <dl className="num grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-on-surface-variant">Protein</dt>
              <dd className={clsx('text-right font-medium', !dEv.proteinOk && 'text-warning')}>{Math.round(dEv.totals.proteinG.value)} g <span className="font-normal text-on-surface-variant">/ EAR {t.proteinEarG}</span></dd>
              <dt className="text-on-surface-variant">Carbohydrate</dt>
              <dd className="text-right font-medium">{Math.round(dEv.totals.carbsG.value)} g</dd>
              <dt className="text-on-surface-variant">Fat</dt>
              <dd className="text-right font-medium">{Math.round(dEv.totals.fatG.value)} g</dd>
              <dt className="text-on-surface-variant">Fibre</dt>
              <dd className="text-right font-medium">{dEv.totals.fibreG.status === 'complete' ? '' : '≥'}{Math.round(dEv.totals.fibreG.value)} g</dd>
              <dt className="text-on-surface-variant">Iron</dt>
              <dd className="text-right font-medium">≈{dEv.totals.ironMg.value} mg</dd>
              <dt className="text-on-surface-variant">Food cost</dt>
              <dd className="text-right font-medium">{formatInr(dEv.costInr)}</dd>
            </dl>
            {(!dEv.energyOk || !dEv.proteinOk) && <Notice tone="warn" className="mt-3">This day is outside the plan checks. Adjust servings or replace a meal.</Notice>}
            <p className="mt-3 text-xs text-on-surface-variant">≥ means some ingredients have no value in the sample data, so the true total may be higher. ≈ marks micronutrients without cooking-loss factors.</p>
          </section>
          {Object.keys(effective.draft.swaps).length > 0 && (
            <Notice title="Ingredient swaps from your basket choices">
              {Object.entries(effective.draft.swaps).map(([from, s]) => (
                <p key={from}>{CAT.ingredients.get(from)?.name} → {CAT.ingredients.get(s.ingredientId)?.name}</p>
              ))}
            </Notice>
          )}
          <Link to="/groceries" className="flex min-h-[48px] items-center justify-center rounded-full bg-primary px-4 font-medium text-on-primary hover:brightness-110">
            Build this week’s groceries
          </Link>
          <Link to="/cook" className="flex min-h-[48px] items-center justify-center rounded-full border border-outline px-4 font-medium text-primary hover:bg-primary/[0.08]">
            Menu for the cook (Telugu / Hindi)
          </Link>
        </aside>
      </div>

      <Sheet open={!!replacing} onClose={() => setReplacing(null)} title={replacing ? `Replace ${SLOT_LABEL[replacing.slot].toLowerCase()} on ${dayLong(replacing.day)}` : ''} wide>
        <p className="mb-3 text-sm text-on-surface-variant">Only this meal changes. Servings are set to keep the day’s energy close. Allergens and excluded foods are already filtered out.</p>
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

  if (elig.status !== 'eligible')
    return (
      <>
        <PageHeader title="Meal plans" />
        <ScopeMessage e={elig} />
        {elig.status === 'incomplete' && <Button className="mt-4" onClick={() => nav(`/profiles/${profile.id}/setup`)}>Finish profile setup</Button>}
      </>
    );

  if (busy) return <Spinner label="Building three plan options" />;

  if (comparing && proposed.length >= 1)
    return (
      <>
        <PageHeader
          title="Choose a plan for this week"
          description={`Three ways to plan ${profile.displayName}’s week from the same food rules and estimates. Pick the trade-off that suits you; you can change any meal afterwards.`}
          actions={
            <>
              {plan && <Button variant="secondary" onClick={() => setParams({})}>Back to current plan</Button>}
              <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={generate} disabled={!online}>
                New options
              </Button>
            </>
          }
        />
        {proposed.length < 3 && (
          <Notice className="mb-4" title={`Only ${proposed.length} different week${proposed.length === 1 ? '' : 's'} possible`}>
            {profile.displayName}’s food rules leave too few recipes for three different weeks, so we show {proposed.length === 1 ? 'one' : 'two'} instead of repeating a plan. Removing a non-allergy exclusion adds more choice.
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
          <Notice tone="warn" title="We could not build a plan that passes every check" className="mb-4">
            {reasons.map((r) => <p key={r}>{r}</p>)}
            <p className="mt-1">We never relax allergy or exclusion rules. Try removing a non-allergy exclusion or allowing more cooking time.</p>
          </Notice>
        )}
        {genError != null && <ErrorState error={genError} />}
        <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="Get three plan options" action={<Button onClick={generate} disabled={!online}>Show me three plans</Button>}>
          Budget-optimised, balanced and goal-aligned weeks, all checked against {profile.displayName}’s energy, protein, allergies and food rules.
        </EmptyState>
      </>
    );

  return (
    <>
      <PageHeader
        title={`${OPTION_META[plan.optionKey].label} week`}
        description={`Week of ${new Date(plan.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}. Tap a meal to see the recipe, change servings or replace it.`}
        actions={
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => (proposed.length >= 1 ? setParams({ compare: '1' }) : generate())} disabled={!online}>
            {proposed.length >= 1 ? 'Compare options' : 'Regenerate options'}
          </Button>
        }
      />
      <Week plan={plan} bundle={b} />
    </>
  );
}
