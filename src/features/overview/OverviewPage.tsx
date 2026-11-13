// Overview (screen 4): the returning-user view (PRD 5.2) for the active profile —
// what to do next, today's meals, budget, pantry and next replenishment.
import { Link, Navigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Package, ShoppingBasket } from 'lucide-react';
import { qk, useActiveProfile, useBundle, useGroceryPipeline, usePantry, useReplenishment, useSelectedPlan, useOrders } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Notice, Spinner } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { dateShort, formatInr, SLOT_LABEL, todayIndex, dayLong } from '../../lib/format.ts';
import { applyPatchToPlan } from '../../domain/pipeline.ts';
import { aggregateRecipeNutrition } from '../../domain/recipes/aggregate.ts';
import { validateProfileForNutrition } from '../../domain/nutrition/eligibility.ts';
import { cartFilled } from '../../lib/cartFilled.ts';
import { OPTION_META } from '../../domain/planning/plan.ts';

export function OverviewPage() {
  const { profile, profiles } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const { plan } = useSelectedPlan(profile?.id);
  const pantry = usePantry(profile?.id);
  const orders = useOrders();
  const repl = useReplenishment(profile?.id);
  const qc = useQueryClient();
  const schedule = useQuery({ queryKey: qk.schedule(profile?.id ?? '-'), queryFn: () => store.getScheduleRule(profile!.id), enabled: !!profile });
  const pantryStock = useMemo(() => pantry.data?.map((p) => ({ profileId: p.profileId, ingredientId: p.ingredientId, quantity: p.quantity })), [pantry.data]);
  const pipe = useGroceryPipeline(bundle.data, plan, pantryStock);

  if (profiles.isLoading) return <Spinner />;
  if (!profile) return <Navigate to="/welcome" replace />;
  if (bundle.isLoading) return <Spinner />;
  const b = bundle.data!;
  const elig = validateProfileForNutrition(b);
  const today = todayIndex();
  const effective = plan ? applyPatchToPlan(plan.draft, plan.patch ?? {}, b, CAT) : null;
  const todays = effective?.meals.filter((m) => m.day === today) ?? [];
  const myOrders = orders.data?.filter((o) => o.profileId === profile.id && o.status === 'CONFIRMED') ?? [];
  const nextDue = repl?.find((r) => r.reorderOn);
  const r = schedule.data;
  const scheduledDue = r?.enabled && today === r.weekday && (!r.lastPreparedAt || Date.now() - new Date(r.lastPreparedAt).getTime() > 5 * 86_400_000);
  const markPrepared = async () => {
    if (r) await store.saveScheduleRule({ ...r, lastPreparedAt: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: qk.schedule(profile.id) });
  };

  // The weekly loop as three stages. The first unfinished one becomes the single next step.
  const stages = [
    { done: profile.onboardingComplete && elig.status === 'eligible', label: 'Set up', title: 'Finish setting up', text: 'A few questions about you and your food.', to: `/profiles/${profile.id}/quick`, cta: 'Continue' },
    { done: !!plan, label: 'Meals', title: 'Pick your meals for the week', text: 'Three plans made for your targets. Choose one.', to: '/plans', cta: 'See plans' },
    { done: myOrders.length > 0 || (!!plan && cartFilled(plan.id)), label: 'Groceries', title: "Get this week's groceries", text: 'Compare Zepto and Instamart and fill your cart.', to: '/groceries', cta: 'Open shopping list' },
  ];
  const next = stages.find((x) => !x.done);
  const dayKcal = todays.reduce((sum, m) => sum + aggregateRecipeNutrition(CAT.recipes.get(m.recipeId)!, CAT.ingredients, m.servings, effective!.swaps).energyKcal.value, 0);
  const dayProtein = todays.reduce((sum, m) => sum + aggregateRecipeNutrition(CAT.recipes.get(m.recipeId)!, CAT.ingredients, m.servings, effective!.swaps).proteinG.value, 0);

  return (
    <>
      <h1 className="text-2xl sm:text-3xl">{plan ? dayLong(today) : `Hi ${profile.displayName}`}</h1>
      {elig.status === 'out_of_scope' && <Notice tone="warn" className="mt-4" title="We can't make a personal plan for this profile">{elig.scopeReasons[0]}</Notice>}
      {scheduledDue && (
        <Notice className="mt-4" title="This week's list is ready">
          <Link to="/groceries" onClick={markPrepared} className="link">Check it</Link>. Nothing is ordered until you say so.
        </Notice>
      )}

      {next && (
        <section className="card mt-5 p-5" aria-labelledby="next-h">
          {/* Three stages of the week, so people see where they are. */}
          <ol className="flex gap-2 text-xs" aria-label="Progress">
            {stages.map((x) => (
              <li key={x.label} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${x.done ? 'bg-primary text-on-primary' : x === next ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {x.done && <Check className="h-3 w-3" aria-label="Done" />} {x.label}
              </li>
            ))}
          </ol>
          <h2 id="next-h" className="mt-4 text-xl">{next.title}</h2>
          <p className="mt-1 text-on-surface-variant">{next.text}</p>
          <Link to={next.to} className="mt-4 inline-flex min-h-[48px] items-center rounded-full bg-primary px-6 font-medium text-on-primary hover:brightness-110">
            {next.cta}
          </Link>
        </section>
      )}

      {plan && (
        <section className="card mt-4 p-5" aria-labelledby="today-h">
          <div className="flex items-baseline justify-between">
            <h2 id="today-h" className="font-medium">Today's meals</h2>
            <Link to="/plans" className="text-sm text-primary">Whole week</Link>
          </div>
          <p className="num mt-0.5 text-sm text-on-surface-variant">
            {Math.round(dayKcal).toLocaleString('en-IN')} / {plan.targets.energyKcal.toLocaleString('en-IN')} kcal · {Math.round(dayProtein)} / {plan.targets.proteinTargetG ?? plan.targets.proteinEarG} g protein
          </p>
          <ul className="mt-2 divide-y divide-outline-variant">
            {todays.map((m) => {
              const rec = CAT.recipes.get(m.recipeId)!;
              const t = aggregateRecipeNutrition(rec, CAT.ingredients, m.servings, effective!.swaps);
              return (
                <li key={m.id}>
                  <Link to={`/recipes/${rec.id}?servings=${m.servings}`} className="flex items-center gap-3 py-3 hover:text-primary">
                    <span className="w-20 shrink-0 text-sm text-on-surface-variant">{SLOT_LABEL[m.slot]}</span>
                    <span className="flex-1 font-medium">{rec.name}</span>
                    <span className="num text-sm text-on-surface-variant">{Math.round(t.energyKcal.value)} kcal</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {plan && pipe && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Link to="/groceries" className="card block p-5 hover:bg-on-surface/[0.03]">
            <p className="flex items-center gap-2 font-medium"><ShoppingBasket className="h-4 w-4 text-primary" aria-hidden /> Groceries</p>
            <p className="num mt-1 text-sm text-on-surface-variant">
              {pipe.result.basket.lines.length} items, about {formatInr(pipe.result.basket.totalInr)}
              {pipe.result.basket.budgetInr != null && (pipe.result.basket.status === 'OVER_BUDGET' ? ' (over budget)' : ' (within budget)')}
            </p>
          </Link>
          <Link to="/pantry" className="card block p-5 hover:bg-on-surface/[0.03]">
            <p className="flex items-center gap-2 font-medium"><Package className="h-4 w-4 text-primary" aria-hidden /> Pantry</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {pantry.data?.length ? (nextDue ? `${nextDue.name} runs low around ${dateShort(nextDue.reorderOn!)}` : `${pantry.data.length} items at home`) : 'Add what you have at home to buy less.'}
            </p>
          </Link>
        </div>
      )}
      {plan && <p className="mt-3 text-xs text-on-surface-variant">{OPTION_META[plan.optionKey].label} plan, week of {dateShort(plan.weekStart)}.</p>}
    </>
  );
}
