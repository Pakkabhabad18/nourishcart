// Public landing. The hero is a live example computed by the real engines for a sample
// profile, so visitors see the actual product loop rather than a claim about it.
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { Logo } from '../../components/Logo.tsx';
import { Nutrion } from '../../components/Nutrion.tsx';
import { Ring } from '../overview/OverviewPage.tsx';
import { aggregateRecipeNutrition } from '../../domain/recipes/aggregate.ts';
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
  const dayKcal = day.reduce((sum, m) => sum + aggregateRecipeNutrition(CAT.recipes.get(m.recipeId)!, CAT.ingredients, m.servings, {}).energyKcal.value, 0);
  const dayProtein = day.reduce((sum, m) => sum + aggregateRecipeNutrition(CAT.recipes.get(m.recipeId)!, CAT.ingredients, m.servings, {}).proteinG.value, 0);
  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link to="/sign-in" className="rounded-full px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/[0.08]">
          Sign in
        </Link>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-12">
        <section className="rise">
          <Nutrion mood="happy" size={96} />
          <h1 className="mt-4 text-4xl leading-[1.1] sm:text-5xl">Meals for your goal. Groceries in your cart.</h1>
          <p className="mt-4 max-w-prose text-lg text-on-surface-variant">
            Talk to Nutrion for two minutes. You get a week of Indian meals for your calories, protein and budget, and the cheapest Zepto or Instamart cart, ready to pay.
          </p>
          <Link to="/sign-in" className="mt-7 inline-flex min-h-[56px] items-center rounded-full bg-primary px-8 text-lg font-semibold text-on-primary active:scale-95">
            Get started
          </Link>
          <p className="mt-4 text-sm text-on-surface-variant">Free. Plan for the whole family. You always pay in the store app yourself.</p>
        </section>

        {s && (
          <section aria-label="An example day" className="rise rise-2 card p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xl">A day for Asha</h2>
              <span className="text-xs text-on-surface-variant">Example</span>
            </div>
            <p className="mt-1 text-sm text-on-surface-variant">26, desk job, veg + eggs, wants to build muscle, ₹1,500 a week.</p>
            <div className="mt-4 flex justify-around">
              <Ring label="Calories" value={dayKcal} target={s.t.planningEnergyKcal} unit="kcal" size={104} />
              <Ring label="Protein" value={dayProtein} target={s.t.personal?.proteinG.value ?? s.t.protein.earG} unit="g" size={104} />
            </div>
            <ul className="mt-3 divide-y divide-outline-variant">
              {day.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-28 shrink-0 text-sm text-on-surface-variant">{SLOT_LABEL[m.slot]}</span>
                  <span className="flex-1 text-sm font-semibold">{CAT.recipes.get(m.recipeId)?.name}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-ctl bg-mango-soft px-4 py-3 text-sm">
              <p className="font-semibold">
                Week's groceries: about <span className="num">{formatInr(s.r.basket.totalInr)}</span> for {s.r.basket.lines.length} items
              </p>
              <p className="mt-0.5 text-on-surface-variant">Under her ₹1,500 budget.</p>
            </div>
          </section>
        )}
      </main>

      <section id="how" className="border-t border-outline-variant bg-surface-container-lowest">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
          <h2 className="text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ['Talk for two minutes', 'Nutrion asks about you, one question at a time. Speak or type.'],
              ['Pick your meals', 'Three weekly plans that hit your targets. Swap any dish, log what you eat.'],
              ['Fill your cart', 'We compare Zepto and Instamart and add the cheapest picks. You pay in the store app.'],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-card bg-surface p-5">
                <span className="num grid h-10 w-10 place-items-center rounded-full bg-mango font-display text-lg font-bold">{i + 1}</span>
                <h3 className="mt-3 text-lg">{t}</h3>
                <p className="mt-1 text-sm text-on-surface-variant">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="border-t border-outline-variant">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-on-surface-variant sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>For healthy adults, 18 and over. Not medical advice. Nutrition values are sample data in this version.</p>
          <nav className="flex gap-4" aria-label="Legal">
            <Link to="/legal/privacy" className="hover:text-primary">Privacy</Link>
            <Link to="/legal/terms" className="hover:text-primary">Terms</Link>
            <Link to="/legal/health" className="hover:text-primary">Health disclaimer</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
