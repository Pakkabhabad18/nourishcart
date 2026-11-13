// Today: the screen people open every day.
//  1. Nutrion says the one thing to do next (setup → pick meals → get groceries → log meals)
//  2. Rings: calories and protein eaten today vs. target, filled by meal check-ins
//  3. This week: 7-day strip and the streak (forgiving, see domain/progress)
//  4. Today's meals with one-tap check-in
//  5. Small tiles for groceries and pantry
import { Link, Navigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Package, ShoppingBasket } from 'lucide-react';
import { clsx } from 'clsx';
import { qk, useActiveProfile, useBundle, useGroceryPipeline, usePantry, useReplenishment, useOrders } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Notice, Spinner } from '../../components/ui.tsx';
import { NutrionSays } from '../../components/Nutrion.tsx';
import { dateShort, formatInr, todayIndex } from '../../lib/format.ts';
import { validateProfileForNutrition } from '../../domain/nutrition/eligibility.ts';
import { dayTotals, streak, week } from '../../domain/progress/progress.ts';
import { cartFilled } from '../../lib/cartFilled.ts';
import { useToday } from '../progress/useToday.ts';
import { MealCheck } from '../progress/LogSheet.tsx';

/** A progress ring. Draws in once; colour turns leaf-green when the target is reached. */
export function Ring({ value, target, label, unit, size = 112 }: { value: number; target: number; label: string; unit: string; size?: number }) {
  const r = 44;
  const len = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const done = pct >= 0.9;
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${Math.round(value)} of ${Math.round(target)} ${unit}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" className="text-surface-container-highest" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          stroke={done ? '#2F7A55' : '#4A2A6B'}
          strokeDasharray={len}
          strokeDashoffset={len * (1 - pct)}
          transform="rotate(-90 50 50)"
          className="ring-draw"
          style={{ ['--ring-len' as string]: `${len}` }}
        />
        <text x="50" y="49" textAnchor="middle" className="fill-on-surface font-display" fontSize="20" fontWeight="700">{Math.round(value).toLocaleString('en-IN')}</text>
        <text x="50" y="65" textAnchor="middle" className="fill-on-surface-variant" fontSize="10">of {Math.round(target).toLocaleString('en-IN')} {unit}</text>
      </svg>
      <figcaption className="mt-1 text-sm font-semibold">{label}</figcaption>
    </figure>
  );
}

const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function OverviewPage() {
  const { profile, profiles } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const pantry = usePantry(profile?.id);
  const orders = useOrders();
  const repl = useReplenishment(profile?.id);
  const qc = useQueryClient();
  const { meals, plan, checkins, today, checkIn, undo } = useToday(profile?.id);
  const schedule = useQuery({ queryKey: qk.schedule(profile?.id ?? '-'), queryFn: () => store.getScheduleRule(profile!.id), enabled: !!profile });
  const pantryStock = useMemo(() => pantry.data?.map((p) => ({ profileId: p.profileId, ingredientId: p.ingredientId, quantity: p.quantity })), [pantry.data]);
  const pipe = useGroceryPipeline(bundle.data, plan, pantryStock);

  if (profiles.isLoading) return <Spinner />;
  if (!profile) return <Navigate to="/welcome" replace />;
  if (bundle.isLoading) return <Spinner />;
  const b = bundle.data!;
  const elig = validateProfileForNutrition(b);
  const myOrders = orders.data?.filter((o) => o.profileId === profile.id && o.status === 'CONFIRMED') ?? [];
  const nextDue = repl?.find((r) => r.reorderOn);
  const r = schedule.data;
  const scheduledDue = r?.enabled && todayIndex() === r.weekday && (!r.lastPreparedAt || Date.now() - new Date(r.lastPreparedAt).getTime() > 5 * 86_400_000);
  const markPrepared = async () => {
    if (r) await store.saveScheduleRule({ ...r, lastPreparedAt: new Date().toISOString() });
    qc.invalidateQueries({ queryKey: qk.schedule(profile.id) });
  };

  // The weekly loop. The first unfinished step is the one thing Nutrion suggests.
  const groceriesDone = myOrders.length > 0 || (!!plan && cartFilled(plan.id));
  const steps = [
    { done: profile.onboardingComplete && elig.status === 'eligible', say: "Let's get to know you. It takes two minutes.", to: `/profiles/${profile.id}/quick`, cta: 'Start' },
    { done: !!plan, say: "I've made three meal plans for your week. Pick one!", to: '/plans', cta: 'See plans' },
    { done: groceriesDone, say: "Let's get your groceries. I'll find the cheapest store.", to: '/groceries', cta: 'Shopping list' },
  ];
  const next = steps.find((x) => !x.done);
  const eaten = dayTotals(checkins, today);
  const s = streak(checkins, today);
  const strip = week(checkins, today);
  const left = meals.filter((m) => !m.checkin).length;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-5">
      <h1 className="rise text-3xl">
        {hello}, {profile.displayName}
      </h1>
      {elig.status === 'out_of_scope' && <Notice tone="warn" title="We can't make a personal plan for this profile">{elig.scopeReasons[0]}</Notice>}
      {scheduledDue && (
        <Notice title="This week's list is ready">
          <Link to="/groceries" onClick={markPrepared} className="link">Check it</Link>. Nothing is ordered until you say so.
        </Notice>
      )}

      {/* 1. Nutrion's one suggestion */}
      <section className="rise rise-1 rounded-card bg-primary p-5 text-on-primary" aria-label="Next step">
        <div className="flex items-center gap-4">
          <NutrionSays mood={next ? 'idle' : left === 0 ? 'happy' : 'idle'} size={64} className="[&>div]:bg-white [&>div]:text-on-surface">
            {next ? next.say : meals.length === 0 ? 'Nothing planned for today.' : left === 0 ? 'Everything logged today. Proud of you!' : `${left} ${left === 1 ? 'meal' : 'meals'} to log today. Tap + when you eat.`}
          </NutrionSays>
        </div>
        {next && (
          <Link to={next.to} className="mt-4 inline-flex min-h-[48px] items-center rounded-full bg-mango px-6 font-semibold text-on-surface active:scale-95">
            {next.cta}
          </Link>
        )}
      </section>

      {plan && (
        <>
          {/* 2. Rings */}
          <section className="rise rise-2 card flex items-center justify-around p-5" aria-label="Eaten today">
            <Ring label="Calories" value={eaten.kcal} target={plan.targets.energyKcal} unit="kcal" />
            <Ring label="Protein" value={eaten.proteinG} target={plan.targets.proteinTargetG ?? plan.targets.proteinEarG} unit="g" />
          </section>

          {/* 3. Week strip + streak */}
          <section className="rise rise-3 card p-5" aria-label="This week">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">This week</h2>
              <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-lg font-bold', s.days > 0 ? 'bg-mango-soft text-tertiary' : 'bg-surface-container text-on-surface-variant')}>
                <Flame className="h-5 w-5" aria-hidden /> {s.days} {s.days === 1 ? 'day' : 'days'}
              </span>
            </div>
            <ol className="mt-3 grid grid-cols-7 gap-1.5">
              {strip.map((d) => {
                const wd = (new Date(`${d.day}T00:00:00`).getDay() + 6) % 7;
                return (
                  <li key={d.day} className="flex flex-col items-center gap-1">
                    <span className={clsx('grid h-10 w-10 place-items-center rounded-full text-sm font-bold', d.active ? 'bg-leaf text-white' : d.day === today ? 'border-2 border-primary text-primary' : 'bg-surface-container text-on-surface-variant')}>
                      {DAY_LETTER[wd]}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-xs text-on-surface-variant">A missed day now and then won't break your streak.</p>
          </section>

          {/* 4. Today's meals */}
          <section className="rise rise-4 card px-5 pb-2 pt-4" aria-labelledby="meals-h">
            <div className="flex items-baseline justify-between">
              <h2 id="meals-h" className="text-lg">Today's meals</h2>
              <Link to="/plans" className="text-sm font-semibold text-primary">Whole week</Link>
            </div>
            <ul className="divide-y divide-outline-variant">
              {meals.map((m) => (
                <MealCheck key={m.meal.id} m={m} onCheck={checkIn} onUndo={undo} />
              ))}
            </ul>
          </section>

          {/* 5. Tiles */}
          <div className="grid grid-cols-2 gap-3">
            <Link to="/groceries" className="card block p-4 active:scale-[0.98]">
              <ShoppingBasket className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-2 font-semibold">Groceries</p>
              <p className="num text-sm text-on-surface-variant">{pipe ? `${pipe.result.basket.lines.length} items, ${formatInr(pipe.result.basket.totalInr)}` : 'Your list'}</p>
            </Link>
            <Link to="/pantry" className="card block p-4 active:scale-[0.98]">
              <Package className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-2 font-semibold">Pantry</p>
              <p className="text-sm text-on-surface-variant">{pantry.data?.length ? (nextDue ? `${nextDue.name} low by ${dateShort(nextDue.reorderOn!)}` : `${pantry.data.length} items`) : 'What you have'}</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
