// Overview (screen 4): the returning-user view (PRD 5.2) for the active profile —
// what to do next, today's meals, budget, pantry and next replenishment.
import { Link, Navigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Package, ShoppingBasket, Sparkles } from 'lucide-react';
import { qk, useActiveProfile, useBundle, useCalculation, useGroceryPipeline, usePantry, useReplenishment, useSelectedPlan, useOrders } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Notice, RangeBar, Spinner, Tag } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { dateShort, formatInr, SLOT_LABEL, todayIndex, dayLong } from '../../lib/format.ts';
import { applyPatchToPlan } from '../../domain/pipeline.ts';
import { aggregateRecipeNutrition } from '../../domain/recipes/aggregate.ts';
import { validateProfileForNutrition } from '../../domain/nutrition/eligibility.ts';
import { OPTION_META } from '../../domain/planning/plan.ts';

function NextStep({ done, title, to, children, icon }: { done: boolean; title: string; to: string; children: string; icon: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-start gap-3 rounded-ctl px-3 py-3 hover:bg-on-surface/[0.06]">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${done ? 'bg-primary text-on-primary' : 'bg-secondary-container text-primary'}`}>{done ? <Check className="h-4 w-4" aria-label="Done" /> : icon}</span>
        <span>
          <span className={`block font-medium ${done ? 'text-on-surface-variant line-through decoration-on-surface-variant/40' : ''}`}>{title}</span>
          <span className="block text-sm text-on-surface-variant">{children}</span>
        </span>
      </Link>
    </li>
  );
}

export function OverviewPage() {
  const { profile, profiles } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const calc = useCalculation(profile?.id);
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

  const steps = [
    { done: profile.onboardingComplete && elig.status === 'eligible', title: 'Finish the profile', to: `/profiles/${profile.id}/setup`, children: 'Body, activity, food rules and budget.', icon: <Sparkles className="h-4 w-4" /> },
    { done: !!calc.data, title: 'See nutrition estimates', to: '/nutrition', children: 'Energy and protein, with the method shown.', icon: <Sparkles className="h-4 w-4" /> },
    { done: !!plan, title: 'Choose a meal plan', to: '/plans', children: 'Compare three options for the week.', icon: <CalendarDays className="h-4 w-4" /> },
    { done: myOrders.length > 0, title: 'Approve a basket', to: '/groceries', children: 'Review the simulated basket and place a test order.', icon: <ShoppingBasket className="h-4 w-4" /> },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <>
      <h1 className="text-2xl font-normal sm:text-3xl">{allDone ? `${dayLong(today)} for ${profile.displayName}` : `Let’s set up ${profile.displayName}’s week`}</h1>
      {elig.status === 'out_of_scope' && <Notice tone="warn" className="mt-4" title="Personal plans are not available for this profile">{elig.scopeReasons[0]}</Notice>}
      {scheduledDue && (
        <Notice tone="info" className="mt-4" title="Your scheduled basket is ready to review">
          <Link to="/groceries" onClick={markPrepared} className="link">Review this week’s draft basket</Link>. It will not be ordered until you approve it.
        </Notice>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {!allDone ? (
          <section className="card p-3 sm:p-4" aria-labelledby="next-h">
            <h2 id="next-h" className="px-3 pt-2 text-lg font-medium">Next steps</h2>
            <ol className="mt-1">{steps.map((s) => <NextStep key={s.title} {...s} />)}</ol>
          </section>
        ) : (
          <section className="card p-5" aria-labelledby="today-h">
            <div className="flex items-baseline justify-between">
              <h2 id="today-h" className="text-lg font-medium">Today’s meals</h2>
              <Link to="/plans" className="text-sm text-primary">Full week</Link>
            </div>
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
            {plan && <p className="mt-2 text-xs text-on-surface-variant">{OPTION_META[plan.optionKey].label} plan, week of {dateShort(plan.weekStart)}.</p>}
          </section>
        )}

        <div className="space-y-4">
          {pipe && pipe.result.basket.budgetInr != null && (
            <section className="card p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">This week’s basket</h2>
                <Link to="/groceries" className="text-sm text-primary">Groceries</Link>
              </div>
              <RangeBar
                ariaLabel={`Basket ${pipe.result.basket.totalInr} against budget ${pipe.result.basket.budgetInr}`}
                min={0}
                max={Math.max(pipe.result.basket.budgetInr, pipe.result.basket.totalInr) * 1.15}
                value={pipe.result.basket.totalInr}
                valueLabel={formatInr(pipe.result.basket.totalInr)}
                tone={pipe.result.basket.status === 'OVER_BUDGET' ? 'warn' : 'good'}
                ticks={[{ at: pipe.result.basket.budgetInr, label: `Budget ${formatInr(pipe.result.basket.budgetInr)}` }]}
              />
              <p className="text-sm text-on-surface-variant">{pipe.result.basket.lines.length} simulated products after pantry deduction.</p>
            </section>
          )}
          <section className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 font-medium"><Package className="h-4 w-4 text-primary" aria-hidden /> Pantry</h2>
              <Link to="/pantry" className="text-sm text-primary">Manage</Link>
            </div>
            {pantry.data?.length ? (
              <>
                <p className="mt-1 text-sm text-on-surface-variant">{pantry.data.length} items tracked.</p>
                {nextDue && (
                  <p className="mt-2 text-sm">
                    Next to run low: <strong>{nextDue.name}</strong> around {dateShort(nextDue.reorderOn!)} {nextDue.status !== 'ok' && <Tag tone="warn">soon</Tag>}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-on-surface-variant">Nothing tracked yet. Adding staples you already own makes the basket cheaper.</p>
            )}
          </section>
          {allDone && (
            <section className="card p-5">
              <h2 className="font-medium">Recent orders</h2>
              <p className="mt-1 text-sm text-on-surface-variant">{myOrders.length} simulated order{myOrders.length === 1 ? '' : 's'} for {profile.displayName}.</p>
              <Link to="/orders" className="mt-2 inline-block text-sm text-primary">Order history</Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
