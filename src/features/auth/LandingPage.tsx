// Public landing. The hero is a live example computed by the real engines for a sample
// profile, so visitors see the actual product loop rather than a claim about it.
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { Logo } from '../../components/Logo.tsx';
import { RangeBar } from '../../components/ui.tsx';
import { calculateTargets } from '../../domain/nutrition/targets.ts';
import { generatePlanOptions } from '../../domain/planning/plan.ts';
import { runPipeline } from '../../domain/pipeline.ts';
import { CAT } from '../../lib/catalog.ts';
import { SAMPLE_BUNDLE } from './sample.ts';
import { formatInr, SLOT_LABEL } from '../../lib/format.ts';

function useSampleWeek() {
  return useMemo(() => {
    const t = calculateTargets(SAMPLE_BUNDLE, new Date('2026-11-11T09:00:00Z'));
    if (!t.ok) return null;
    const targets = { energyKcal: t.record.planningEnergyKcal, proteinEarG: t.record.protein.earG, proteinRdaG: t.record.protein.rdaG };
    const plan = generatePlanOptions(SAMPLE_BUNDLE, targets, CAT).plans[0];
    const r = runPipeline({ bundle: SAMPLE_BUNDLE, plan, targets, patch: {}, pantry: [], cat: CAT });
    return { t: t.record, plan, r };
  }, []);
}

export function LandingPage() {
  const s = useSampleWeek();
  const day = s?.plan.meals.filter((m) => m.day === 2) ?? [];
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link to="/sign-in" className="rounded-ctl px-3 py-2 text-sm font-medium text-forest hover:bg-forest-50">
          Sign in
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-14">
        <section>
          <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">Plan a week of Indian meals around your body, your taste and your grocery budget.</h1>
          <p className="mt-4 max-w-prose text-lg text-muted">
            NourishCart estimates your energy and protein needs, offers three meal plans, then turns the plan you choose into a grocery basket that you review before anything is ordered.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/sign-in" className="inline-flex min-h-[50px] items-center rounded-ctl bg-forest px-5 text-lg font-medium text-white hover:bg-forest-700">
              Get started with email
            </Link>
            <a href="#how" className="inline-flex min-h-[50px] items-center rounded-ctl px-4 font-medium text-forest hover:bg-forest-50">
              How it works
            </a>
          </div>
          <ul className="mt-8 grid max-w-prose gap-2 text-sm text-muted">
            <li>One login can plan for several adults, each with their own needs and budget.</li>
            <li>Every estimate shows its method, range and what it does not know.</li>
            <li>Groceries and checkout are simulated in this version. No payment is taken.</li>
          </ul>
        </section>

        {s && (
          <section aria-label="Example week for a sample profile" className="card p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">A Wednesday for “Demo Asha”</h2>
              <span className="text-xs text-muted">Sample profile</span>
            </div>
            <p className="mt-1 text-sm text-muted">26, desk job, walks daily, eggetarian, ₹1,500 a week.</p>
            <RangeBar
              ariaLabel={`Estimated energy ${s.t.energy.rangeKcal.low} to ${s.t.energy.rangeKcal.high} kcal per day, planning at ${s.t.planningEnergyKcal}`}
              min={1500}
              max={2500}
              band={[s.t.energy.rangeKcal.low, s.t.energy.rangeKcal.high]}
              value={s.t.planningEnergyKcal}
              valueLabel={`${s.t.planningEnergyKcal} kcal`}
              ticks={[{ at: 1660, label: 'ICMR ref. woman' }]}
            />
            <ul className="mt-2 divide-y divide-line">
              {day.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="w-20 shrink-0 text-sm text-muted">{SLOT_LABEL[m.slot]}</span>
                  <span className="flex-1 text-sm font-medium">{CAT.recipes.get(m.recipeId)?.name}</span>
                  <span className="num text-xs text-muted">×{m.servings}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-ctl bg-mint px-4 py-3 text-sm">
              <p className="font-medium text-forest">
                Week’s simulated basket: <span className="num">{formatInr(s.r.basket.totalInr)}</span> for {s.r.basket.lines.length} items
              </p>
              <p className="mt-0.5 text-muted">Under the ₹1,500 budget, before any pantry items are counted.</p>
            </div>
          </section>
        )}
      </main>

      <section id="how" className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <h2 className="text-2xl font-semibold">How a week comes together</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Tell us about each person', 'Age, height, weight, daily activity, food pattern, allergies and a weekly budget. Each profile stays separate.'],
              ['See transparent estimates', 'Energy as a range, protein against the ICMR-NIN planning reference, and every assumption listed.'],
              ['Pick one of three plans', 'Budget, Balanced or Goal-aligned. Swap any meal; totals and groceries update straight away.'],
              ['Approve the basket', 'Pack sizes, unit prices and your pantry are counted. If it runs over budget, you choose what changes.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mint text-sm font-semibold text-forest">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-prose text-xs text-muted">
            NourishCart is a general-wellness planning tool for healthy adults aged 18 and over. It does not diagnose or treat any condition. Nutrition values in this version are illustrative sample data, and all products, prices and orders are simulated.
          </p>
        </div>
      </section>
    </div>
  );
}
