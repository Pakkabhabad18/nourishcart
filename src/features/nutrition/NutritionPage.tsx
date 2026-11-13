// Nutrition results (screen 6): estimates as ranges, with method, assumptions,
// limitations and reference context. Eligibility gates show a scope message instead.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Sparkles } from 'lucide-react';
import { store } from '../../lib/store/index.ts';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useCalculation, useBundle } from '../../app/hooks.ts';
import { Button, EmptyState, ErrorState, Notice, PageHeader, RangeBar, Spinner, Stat } from '../../components/ui.tsx';
import { METHODS } from '../../domain/nutrition/methods.ts';
import type { EligibilityResult } from '../../domain/nutrition/eligibility.ts';
import { validateProfileForNutrition } from '../../domain/nutrition/eligibility.ts';
import { dateTime } from '../../lib/format.ts';

const BAND_LABEL = { sedentary_light: 'Sedentary or light', active_moderate: 'Active or moderately active', vigorous: 'Vigorous' } as const;

export function ScopeMessage({ e }: { e: EligibilityResult }) {
  if (e.status === 'out_of_scope')
    return (
      <Notice tone="warn" title="A personal plan is not available for this profile">
        {e.scopeReasons.map((r) => (
          <p key={r}>{r}</p>
        ))}
        <p className="mt-1">You can still browse recipes and the simulated catalogue.</p>
      </Notice>
    );
  return (
    <Notice tone="warn" title="A few details are still needed">
      <ul className="list-disc pl-4">
        {[...e.missing, ...e.invalid].map((m) => (
          <li key={m.field}>{m.message}</li>
        ))}
      </ul>
    </Notice>
  );
}

export function NutritionPage() {
  const { profile } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const calc = useCalculation(profile?.id);
  const qc = useQueryClient();
  const nav = useNavigate();
  const { online } = useApp();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ineligible, setIneligible] = useState<EligibilityResult | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  async function recalc() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const r = await store.calculate(profile.id);
      if (!r.ok) setIneligible(r.eligibility);
      else setIneligible(null);
      await qc.invalidateQueries({ queryKey: qk.calc(profile.id) });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (params.get('calculate') === '1' && profile && online) {
      setParams({}, { replace: true });
      recalc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  if (!profile) return <EmptyState title="Create a profile first" action={<Link className="link" to="/profiles">Go to profiles</Link>} />;
  if (calc.isLoading || bundle.isLoading || busy) return <Spinner label={busy ? 'Calculating estimates' : 'Loading'} />;
  if (calc.error) return <ErrorState error={calc.error} retry={() => calc.refetch()} />;

  const eligibility = ineligible ?? (bundle.data ? validateProfileForNutrition(bundle.data) : null);
  if (eligibility && eligibility.status !== 'eligible') {
    return (
      <>
        <PageHeader title="Nutrition estimates" />
        <ScopeMessage e={eligibility} />
        {eligibility.status === 'incomplete' && (
          <Button className="mt-4" onClick={() => nav(`/profiles/${profile.id}/setup`)}>
            Finish profile setup
          </Button>
        )}
      </>
    );
  }

  const c = calc.data?.record;
  if (!c)
    return (
      <>
        <PageHeader title="Nutrition estimates" />
        <EmptyState icon={<Sparkles className="h-5 w-5" />} title="Ready to estimate" action={<Button onClick={recalc} disabled={!online}>Calculate estimates</Button>}>
          We will estimate daily energy and protein for {profile.displayName} and show exactly how.
        </EmptyState>
      </>
    );

  const stale = bundle.data && new Date(bundle.data.profile.updatedAt) > new Date(calc.data!.createdAt);
  const e = c.energy;
  const p = c.protein;
  return (
    <>
      <PageHeader
        title={`Daily estimates for ${profile.displayName}`}
        description={`Calculated ${dateTime(calc.data!.createdAt)}. These are planning estimates for a healthy adult, not a medical assessment.`}
        actions={
          <>
            <Button variant="secondary" onClick={recalc} disabled={!online}>
              Recalculate
            </Button>
            <Button onClick={() => nav('/plans')}>See meal plan options</Button>
          </>
        }
      />
      {stale && <Notice tone="warn" className="mb-4" title="Profile changed since this estimate">Recalculate to use the latest details.</Notice>}
      {error != null && <ErrorState error={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="energy-h">
          <h2 id="energy-h" className="text-lg font-medium">Energy</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Likely range for a day, with the value plans are built around.</p>
          <RangeBar
            ariaLabel={`Energy estimate ${e.rangeKcal.low} to ${e.rangeKcal.high} kcal per day; plans use ${c.planningEnergyKcal} kcal`}
            min={Math.min(e.rangeKcal.low, c.referenceContext?.rows[0].kcal ?? e.rangeKcal.low) - 200}
            max={e.rangeKcal.high + 250}
            band={[e.rangeKcal.low, e.rangeKcal.high]}
            value={c.planningEnergyKcal}
            valueLabel={`${c.planningEnergyKcal.toLocaleString('en-IN')} kcal`}
            ticks={c.referenceContext ? [{ at: c.referenceContext.rows[0].kcal, label: 'ICMR ref. sedentary' }] : []}
          />
          <div className="grid grid-cols-3 gap-3 border-t border-outline-variant pt-4">
            <Stat label="Range" value={<span className="text-base">{e.rangeKcal.low.toLocaleString('en-IN')}–{e.rangeKcal.high.toLocaleString('en-IN')}</span>} sub="kcal/day" />
            <Stat label="Resting (BMR)" value={<span className="text-base">{e.bmrKcal.toLocaleString('en-IN')}</span>} sub="kcal/day" />
            <Stat label="Activity level" value={<span className="text-base">PAL {e.pal.pal}</span>} sub={BAND_LABEL[e.pal.band]} />
          </div>
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="protein-h">
          <h2 id="protein-h" className="text-lg font-medium">Protein</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Plans are checked against the planning reference (EAR). The RDA is shown for context.</p>
          <RangeBar
            ariaLabel={`Protein planning reference ${p.earG} grams per day; RDA ${p.rdaG} grams`}
            min={0}
            max={Math.ceil((p.cerealBasedContextG * 1.35) / 10) * 10}
            value={p.earG}
            valueLabel={`${p.earG} g planning floor`}
            ticks={[
              { at: p.rdaG, label: `RDA ${p.rdaG} g` },
              { at: p.cerealBasedContextG, label: `Cereal-diet note ${p.cerealBasedContextG} g` },
            ]}
          />
          <ul className="space-y-1.5 border-t border-outline-variant pt-4 text-sm text-on-surface-variant">
            {p.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-medium">Carbohydrate, fat and fibre</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{c.macros.message}</p>
          <p className="mt-3 text-sm">
            BMI <span className="num font-medium">{c.bmi}</span> <span className="text-on-surface-variant">is shown for context only. It does not set any target and is not a diagnosis.</span>
          </p>
        </section>
        {c.referenceContext && (
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-medium">Population reference</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{c.referenceContext.label}.</p>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-outline-variant">
                {c.referenceContext.rows.map((r) => (
                  <tr key={r.work}>
                    <td className="py-2 text-on-surface-variant">{r.work}</td>
                    <td className="num py-2 text-right font-medium">{r.kcal.toLocaleString('en-IN')} kcal/day</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      <section className="card mt-4">
        <button className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6" aria-expanded={showMethod} onClick={() => setShowMethod((s) => !s)}>
          <span className="text-lg font-medium">How was this estimated?</span>
          <ChevronDown className={`h-5 w-5 text-on-surface-variant transition-transform ${showMethod ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showMethod && (
          <div className="space-y-5 border-t border-outline-variant px-5 py-5 text-sm sm:px-6">
            <div>
              <h3 className="font-medium">Method</h3>
              <p className="mt-1 text-on-surface-variant">{METHODS.energy.title}.</p>
              <p className="mt-1 text-on-surface-variant">
                Status: <strong>provisional demo method</strong>, not reviewed by a nutrition professional. Version {c.methodVersion}, equation {c.equationId}, coefficients {c.coefficientSetId}, activity mapping {c.activityMappingId}.
              </p>
              <p className="mt-1 text-on-surface-variant">
                Resting energy {e.bmrKcal} kcal × activity {e.pal.pal} (occupation {e.pal.occupationAnchor} + movement {e.pal.movementAdjustment} + exercise {e.pal.exerciseIncrement}) = {c.planningEnergyKcal} kcal.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Limitations</h3>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-on-surface-variant">
                {[...c.limitations, ...c.disclaimers].map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Inputs used</h3>
              <p className="mt-1 text-on-surface-variant">
                Age {c.inputsSnapshot.ageYears}, {c.inputsSnapshot.heightCm} cm, {c.inputsSnapshot.weightKg} kg, occupation {c.inputsSnapshot.occupation}, movement {c.inputsSnapshot.movement}, {c.inputsSnapshot.workoutsPerWeek} workouts of {c.inputsSnapshot.workoutMinutes} min, questionnaire {c.inputsSnapshot.questionnaireVersion}.
              </p>
            </div>
            <div>
              <h3 className="font-medium">Sources</h3>
              <ul className="mt-1 space-y-1">
                {c.sourceRefs.map((s) => (
                  <li key={s}>
                    <a className="link break-all" href={s} target="_blank" rel="noreferrer">
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
