// Public landing. The hero is a live example computed by the real engines for a sample
// profile, so visitors see the actual product loop rather than a claim about it.
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { Logo } from '../../components/Logo.tsx';
import { RangeBar } from '../../components/ui.tsx';
import { calculateTargets, planTargetsFrom } from '../../domain/nutrition/targets.ts';
import { generatePlanOptions } from '../../domain/planning/plan.ts';
import { runPipeline } from '../../domain/pipeline.ts';
import { CAT } from '../../lib/catalog.ts';
import { SAMPLE_BUNDLE } from './sample.ts';
import { formatInr, SLOT_LABEL } from '../../lib/format.ts';

function useSampleWeek() {
  return useMemo(() => {
    const t = calculateTargets(SAMPLE_BUNDLE, new Date('2026-11-11T09:00:00Z'));
    if (!t.ok) return null;
    const targets = planTargetsFrom(t.record);
    const plan = generatePlanOptions(SAMPLE_BUNDLE, targets, CAT).plans[0];
    const r = runPipeline({ bundle: SAMPLE_BUNDLE, plan, targets, patch: {}, pantry: [], cat: CAT });
    return { t: t.record, plan, r };
  }, []);
}

export function LandingPage() {
  const s = useSampleWeek();
  const day = s?.plan.meals.filter((m) => m.day === 2) ?? [];
  return (
    <div className="min-h-dvh bg-surface-container">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link to="/sign-in" className="rounded-full px-4 py-2 text-sm font-medium text-primary hover:bg-primary/[0.08]">
          Sign in
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-14">
        <section>
          <h1 className="text-3xl font-normal leading-tight sm:text-4xl">A week of Indian meals for your goal, and the groceries in your cart.</h1>
          <p className="mt-4 max-w-prose text-lg text-on-surface-variant">
            Answer a few questions by voice. We plan meals for your calories, protein and budget, then fill your Zepto or Instamart cart with the cheapest picks.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/sign-in" className="inline-flex min-h-[50px] items-center rounded-full bg-primary px-5 text-lg font-medium text-on-primary hover:brightness-110">
              Get started
            </Link>
            <a href="#how" className="inline-flex min-h-[50px] items-center rounded-full px-5 font-medium text-primary hover:bg-primary/[0.08]">
              How it works
            </a>
          </div>
          <p className="mt-6 max-w-prose text-sm text-on-surface-variant">Plan for everyone at home. You always check the cart and pay in the store app yourself.</p>
        </section>

        {s && (
          <section aria-label="Example week for a sample profile" className="card p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">A day for Asha</h2>
              <span className="text-xs text-on-surface-variant">Example</span>
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">26, desk job, walks daily, eggetarian, ₹1,500 a week.</p>
            <RangeBar
              ariaLabel={`Estimated energy ${s.t.energy.rangeKcal.low} to ${s.t.energy.rangeKcal.high} kcal per day, planning at ${s.t.planningEnergyKcal}`}
              min={1500}
              max={2500}
              band={[s.t.energy.rangeKcal.low, s.t.energy.rangeKcal.high]}
              value={s.t.planningEnergyKcal}
              valueLabel={`${s.t.planningEnergyKcal} kcal`}
              ticks={[{ at: 1660, label: 'ICMR ref. woman' }]}
            />
            <ul className="mt-2 divide-y divide-outline-variant">
              {day.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="w-20 shrink-0 text-sm text-on-surface-variant">{SLOT_LABEL[m.slot]}</span>
                  <span className="flex-1 text-sm font-medium">{CAT.recipes.get(m.recipeId)?.name}</span>
                  <span className="num text-xs text-on-surface-variant">×{m.servings}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-ctl bg-secondary-container px-4 py-3 text-sm">
              <p className="font-medium text-primary">
                Week's groceries: about <span className="num">{formatInr(s.r.basket.totalInr)}</span> for {s.r.basket.lines.length} items
              </p>
              <p className="mt-0.5 text-on-surface-variant">Under her ₹1,500 budget.</p>
            </div>
          </section>
        )}
      </main>

      <section id="how" className="border-t border-outline-variant bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <h2 className="text-2xl font-normal">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ['Talk for two minutes', 'Your body, your day, what you eat, your goal and budget. Speak or type.'],
              ['Pick your meals', 'Three weekly plans that hit your targets. Swap any dish.'],
              ['Fill your cart', 'We compare Zepto and Instamart and add the cheapest picks. You pay in the store app.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary-container text-sm font-medium text-primary">{i + 1}</span>
                <div>
                  <h3 className="font-medium">{t}</h3>
                  <p className="mt-1 text-sm text-on-surface-variant">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-prose text-xs text-on-surface-variant">
            For healthy adults, 18 and over. Not medical advice. Nutrition values are sample data in this version.
          </p>
        </div>
      </section>
    </div>
  );
}
