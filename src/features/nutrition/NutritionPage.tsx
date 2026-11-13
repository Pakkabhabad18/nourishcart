// "My targets": the person's goal, their daily numbers and nutrients to get more of.
// The suggestion comes from the estimate (resting energy × activity, adjusted for the goal).
// Any number can be typed over; safety limits are applied in domain/nutrition/personal.ts
// and explained under the numbers when they change what was typed.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { store } from '../../lib/store/index.ts';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useCalculation, useBundle, useSaveBundle, useSelectedPlan } from '../../app/hooks.ts';
import { Button, EmptyState, ErrorState, Input, Notice, Spinner, Tag } from '../../components/ui.tsx';
import type { EligibilityResult } from '../../domain/nutrition/eligibility.ts';
import { validateProfileForNutrition } from '../../domain/nutrition/eligibility.ts';
import { BODY_GOAL_LABEL, PROTEIN_G_PER_KG, macroKcal, type TargetValue } from '../../domain/nutrition/personal.ts';
import type { BodyGoal, CustomTargets, FocusNutrient, Goal } from '../../domain/types.ts';
import { FocusPicker, GoalPicker } from './TargetsEditor.tsx';

export function ScopeMessage({ e }: { e: EligibilityResult }) {
  if (e.status === 'out_of_scope')
    return (
      <Notice tone="warn" title="We can't make a personal plan for this profile">
        {e.scopeReasons.map((r) => (
          <p key={r}>{r}</p>
        ))}
      </Notice>
    );
  return (
    <Notice tone="warn" title="A few details are missing">
      <ul className="list-disc pl-4">
        {[...e.missing, ...e.invalid].map((m) => (
          <li key={m.field}>{m.message}</li>
        ))}
      </ul>
    </Notice>
  );
}

type Key = keyof CustomTargets;
const ROWS: { key: Key; label: string; unit: string; field: 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fibreG' }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', field: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g', field: 'proteinG' },
  { key: 'carbsG', label: 'Carbs', unit: 'g', field: 'carbsG' },
  { key: 'fatG', label: 'Fat', unit: 'g', field: 'fatG' },
  { key: 'fibreG', label: 'Fibre', unit: 'g', field: 'fibreG' },
];

/** The coarse "goal" the planner already understood, kept in step with the body goal. */
function plannerGoal(body: BodyGoal, current: Goal | null): Goal {
  if (body === 'lose') return 'weight_management';
  if (body === 'gain') return 'muscle_fitness';
  return current === 'budget_first' ? 'budget_first' : 'general';
}

export function NutritionPage() {
  const { profile } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const calc = useCalculation(profile?.id);
  const { plan } = useSelectedPlan(profile?.id);
  const save = useSaveBundle();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { online, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [ineligible, setIneligible] = useState<EligibilityResult | null>(null);
  const [showMethod, setShowMethod] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  // Form state, filled from the saved profile once it loads.
  const [goal, setGoal] = useState<BodyGoal | null>(null);
  const [focus, setFocus] = useState<FocusNutrient[]>([]);
  const [typed, setTyped] = useState<Record<Key, string>>({ kcal: '', proteinG: '', carbsG: '', fatG: '', fibreG: '' });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const b = bundle.data;
    if (!b || loadedFor.current === b.profile.id) return;
    loadedFor.current = b.profile.id;
    setGoal(b.goals.bodyGoal);
    setFocus(b.goals.focusNutrients);
    const c = b.goals.custom;
    setTyped({ kcal: c.kcal?.toString() ?? '', proteinG: c.proteinG?.toString() ?? '', carbsG: c.carbsG?.toString() ?? '', fatG: c.fatG?.toString() ?? '', fibreG: c.fibreG?.toString() ?? '' });
  }, [bundle.data]);

  async function recalc() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const r = await store.calculate(profile.id);
      setIneligible(r.ok ? null : r.eligibility);
      await qc.invalidateQueries({ queryKey: qk.calc(profile.id) });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  // Work the numbers out without an extra tap: on first visit, after setup, or when the
  // saved estimate predates personal targets.
  const record = calc.data?.record;
  const eligible = bundle.data ? validateProfileForNutrition(bundle.data).status === 'eligible' : false;
  useEffect(() => {
    if (!profile || !online || busy || calc.isLoading || !eligible) return;
    if (params.get('calculate') === '1') setParams({}, { replace: true });
    if (!record || !record.personal || params.get('calculate') === '1') recalc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, calc.isLoading, eligible, record?.personal]);

  async function saveTargets() {
    const b = bundle.data;
    if (!b || !goal) return;
    const num = (s: string) => (s.trim() === '' ? null : Math.round(Number(s)));
    const custom: CustomTargets = { kcal: num(typed.kcal), proteinG: num(typed.proteinG), carbsG: num(typed.carbsG), fatG: num(typed.fatG), fibreG: num(typed.fibreG) };
    await save.mutateAsync({ ...b, goals: { ...b.goals, goal: plannerGoal(goal, b.goals.goal), bodyGoal: goal, custom, focusNutrients: focus } });
    await recalc();
    setEditing(false);
    setSaved(true);
    toast('Targets saved');
  }

  if (!profile) return <EmptyState title="Add a person first" action={<Link className="link" to="/profiles">Household</Link>} />;
  if (calc.isLoading || bundle.isLoading) return <Spinner />;
  if (calc.error) return <ErrorState error={calc.error} retry={() => calc.refetch()} />;

  const eligibility = ineligible ?? (bundle.data ? validateProfileForNutrition(bundle.data) : null);
  if (eligibility && eligibility.status !== 'eligible') {
    return (
      <>
        <h1 className="mb-4 text-2xl">Your daily targets</h1>
        <ScopeMessage e={eligibility} />
        {eligibility.status === 'incomplete' && (
          <Button className="mt-4" onClick={() => nav(`/profiles/${profile.id}/quick`)}>
            Finish setup
          </Button>
        )}
      </>
    );
  }
  if (!record?.personal || busy) return <Spinner label="Working out your numbers" />;

  const t = record.personal;
  const b = bundle.data!;
  const dirty =
    goal !== b.goals.bodyGoal ||
    focus.join() !== b.goals.focusNutrients.join() ||
    ROWS.some((r) => (typed[r.key].trim() === '' ? null : Math.round(Number(typed[r.key]))) !== b.goals.custom[r.key]);
  const sumKcal = macroKcal(t);

  return (
    <>
      <h1 className="text-2xl sm:text-3xl">Your daily targets</h1>
      <p className="mt-1 text-on-surface-variant">Meals are planned around these numbers.</p>
      {error != null && <ErrorState error={error} />}

      <section className="mt-6" aria-labelledby="goal-h">
        <h2 id="goal-h" className="mb-2 font-medium">Goal</h2>
        <GoalPicker value={goal} onChange={setGoal} />
      </section>

      <section className="card mt-6 p-5" aria-labelledby="nums-h">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="nums-h" className="font-medium">Per day</h2>
            <p className="text-xs text-on-surface-variant">You burn about {t.maintenanceKcal.toLocaleString('en-IN')} kcal a day</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit numbers'}
          </Button>
        </div>
        <ul className="mt-2 divide-y divide-outline-variant">
          {ROWS.map((r) => {
            const v: TargetValue = t[r.field];
            return (
              <li key={r.key} className="flex min-h-[56px] items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-on-surface-variant">{r.label}</span>
                {editing ? (
                  <label className="flex flex-1 items-center gap-2">
                    <span className="sr-only">{r.label} per day</span>
                    <Input
                      inputMode="numeric"
                      className="w-28"
                      placeholder={v.suggested.toString()}
                      value={typed[r.key]}
                      onChange={(e) => setTyped({ ...typed, [r.key]: e.target.value.replace(/[^\d]/g, '') })}
                    />
                    <span className="text-sm text-on-surface-variant">{r.unit}</span>
                  </label>
                ) : (
                  <span className="num flex-1 text-xl">
                    {v.value.toLocaleString('en-IN')} <span className="text-sm text-on-surface-variant">{r.unit}</span>
                  </span>
                )}
                {!editing && v.source !== 'suggested' && <Tag tone={v.source === 'yours_adjusted' ? 'warn' : 'good'}>{v.source === 'yours' ? 'Yours' : 'Adjusted'}</Tag>}
              </li>
            );
          })}
        </ul>
        {editing && <p className="mt-2 text-xs text-on-surface-variant">Leave a box empty to use our suggestion (shown in grey).</p>}
        {t.notes.length > 0 && !editing && (
          <Notice tone="warn" className="mt-3">
            {t.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </Notice>
        )}
        {!editing && Math.abs(sumKcal - t.kcal.value) > t.kcal.value * 0.1 && (
          <p className="mt-2 text-xs text-on-surface-variant">Your protein, carbs and fat add up to {sumKcal.toLocaleString('en-IN')} kcal; meals follow the calorie number.</p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="focus-h">
        <h2 id="focus-h" className="font-medium">Need more of anything?</h2>
        <p className="mb-3 text-sm text-on-surface-variant">For example, if a blood test showed you're low. Meals will lean towards foods rich in it.</p>
        <FocusPicker value={focus} onChange={setFocus} />
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Button onClick={saveTargets} disabled={!dirty || !goal || !online} loading={save.isPending}>
          Save targets
        </Button>
        {(saved || !plan) && (
          <Button variant={dirty ? 'secondary' : 'primary'} onClick={() => nav('/plans')} disabled={dirty}>
            {plan ? 'Make new meal plans' : 'See meal plans'}
          </Button>
        )}
      </div>
      {!goal && <p className="mt-2 text-sm text-on-surface-variant">Pick a goal to save.</p>}

      <section className="card mt-8">
        <button className="flex w-full items-center justify-between px-5 py-4 text-left" aria-expanded={showMethod} onClick={() => setShowMethod((s) => !s)}>
          <span className="font-medium">How we worked this out</span>
          <ChevronDown className={`h-5 w-5 text-on-surface-variant transition-transform ${showMethod ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showMethod && (
          <div className="space-y-3 border-t border-outline-variant px-5 py-4 text-sm text-on-surface-variant">
            <p>
              You burn about <strong className="text-on-surface">{t.maintenanceKcal.toLocaleString('en-IN')} kcal</strong> a day: resting energy {record.energy.bmrKcal.toLocaleString('en-IN')} kcal × activity level {record.energy.pal.pal}.
              {t.bodyGoal !== 'maintain' && ` For "${BODY_GOAL_LABEL[t.bodyGoal]}" we suggest ${t.kcal.suggested.toLocaleString('en-IN')} kcal.`}
            </p>
            <p>
              Protein: {PROTEIN_G_PER_KG[t.bodyGoal]} g per kg of body weight. Every day of a plan gets at least {record.protein.earG} g (ICMR-NIN planning minimum), whatever is typed here.
            </p>
            <p>Fat about a quarter of calories, carbs the rest, fibre 14 g per 1,000 kcal.</p>
            <p>
              BMI {record.bmi}, shown for context only. These are estimates for healthy adults, not medical advice. Method {record.methodVersion}, targets {t.version}.
            </p>
            <ul className="list-disc space-y-1 pl-4">
              {record.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
