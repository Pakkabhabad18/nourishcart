// Onboarding wizard (FR-004/005). Saves on every "Continue" so it can be resumed.
// Mandatory fields are validated per step; optional ones can be skipped.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { useBundle, useSaveBundle } from '../../app/hooks.ts';
import { useApp } from '../../app/context.tsx';
import { Button, Chip, ErrorState, Field, Input, Notice, Select, Spinner } from '../../components/ui.tsx';
import type { Allergen, ClinicalFlag, DietPattern, Goal, ProfileBundle } from '../../domain/types.ts';
import { ALLERGEN_LABELS, DIET_LABELS } from '../../domain/diet.ts';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, round, ageInYears } from '../../domain/units.ts';
import { BOUNDS } from '../../domain/nutrition/eligibility.ts';
import { INGREDIENTS } from '../../data/ingredients.ts';

const STEPS = ['About', 'Body', 'Activity', 'Food', 'Goal and budget', 'Health scope', 'Review'] as const;

const CLINICAL: { id: ClinicalFlag; label: string }[] = [
  { id: 'pregnancy', label: 'Pregnant' },
  { id: 'lactation', label: 'Breastfeeding' },
  { id: 'eating_disorder', label: 'Living with or recovering from an eating disorder' },
  { id: 'kidney_disease', label: 'Kidney disease' },
  { id: 'diabetes_clinical_diet', label: 'Diabetes that needs a clinical diet' },
  { id: 'bariatric_surgery', label: 'Recent bariatric surgery' },
  { id: 'other_medical_condition', label: 'Another condition where a doctor manages my diet' },
];

const CUISINES = [
  ['south_indian', 'South Indian'],
  ['hyderabadi', 'Hyderabadi / Telangana'],
  ['north_indian', 'North Indian'],
  ['pan_indian', 'Everyday pan-Indian'],
  ['continental', 'Simple continental'],
] as const;

const OCCUPATION = [
  ['sedentary', 'Mostly sitting', 'Desk or computer work, studying, driving.'],
  ['light', 'Some standing and walking', 'Teaching, retail, lab or shop-floor work.'],
  ['moderate', 'On my feet most of the day', 'Delivery, nursing, housework-heavy days, field work.'],
  ['heavy', 'Hard physical work', 'Construction, farming, loading, manual labour.'],
] as const;

const numInRange = (min: number, max: number, msg: string) => z.number({ message: msg }).min(min, msg).max(max, msg);

function stepErrors(step: number, b: ProfileBundle): Record<string, string> {
  const e: Record<string, string> = {};
  const p = b.profile;
  if (step === 0) {
    if (!p.displayName.trim()) e.name = 'Enter a name for this profile.';
    if (!p.dateOfBirth) e.dob = 'Enter a date of birth.';
    else {
      const age = ageInYears(p.dateOfBirth);
      if (Number.isNaN(age)) e.dob = 'Enter a valid date.';
      else if (age < 18) e.dob = 'NourishCart currently plans only for adults aged 18 and over.';
      else if (age > 100) e.dob = 'Please check the year.';
    }
    if (!p.sex) e.sex = 'Choose one option, including “prefer not to say”.';
  }
  if (step === 1) {
    const h = numInRange(BOUNDS.heightCm.min, BOUNDS.heightCm.max, `Height must be between ${BOUNDS.heightCm.min} and ${BOUNDS.heightCm.max} cm.`).safeParse(p.heightCm ?? NaN);
    if (!h.success) e.height = h.error.issues[0].message;
    const w = numInRange(BOUNDS.weightKg.min, BOUNDS.weightKg.max, `Weight must be between ${BOUNDS.weightKg.min} and ${BOUNDS.weightKg.max} kg.`).safeParse(p.weightKg ?? NaN);
    if (!w.success) e.weight = w.error.issues[0].message;
  }
  if (step === 2) {
    if (!b.activity.occupation) e.occupation = 'Choose the option closest to a usual day.';
    if (!b.activity.movement) e.movement = 'Choose your everyday movement.';
    if (b.activity.workoutsPerWeek > 0) {
      if (!b.activity.intensity) e.intensity = 'Choose how hard your workouts usually are.';
      if (!(b.activity.workoutMinutes > 0 && b.activity.workoutMinutes <= 240)) e.minutes = 'Enter minutes per session (1–240).';
    }
  }
  if (step === 3) {
    if (!b.preferences.dietPattern) e.diet = 'Choose a food pattern.';
    if (!b.preferences.allergiesConfirmed) e.allergies = 'Select allergies, or confirm that there are none.';
  }
  if (step === 4) {
    if (!b.goals.goal) e.goal = 'Choose a goal.';
    if (b.budget.amountInr == null || !(b.budget.amountInr >= 200 && b.budget.amountInr <= 100000)) e.budget = 'Enter a grocery budget between ₹200 and ₹1,00,000.';
  }
  if (step === 5 && !b.preferences.noClinicalFlagsConfirmed && b.preferences.clinicalFlags.length === 0) e.clinical = 'Tick any that apply, or confirm that none apply.';
  return e;
}

export function OnboardingPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { setActiveProfileId, online } = useApp();
  const q = useBundle(id);
  const save = useSaveBundle();
  const [draft, setDraft] = useState<ProfileBundle | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>('cm');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [exclusionQuery, setExclusionQuery] = useState('');

  useEffect(() => {
    if (q.data && !draft) {
      setDraft(q.data);
      setStep(Math.min(q.data.profile.onboardingStep, STEPS.length - 1));
      setActiveProfileId(q.data.profile.id);
    }
  }, [q.data, draft, setActiveProfileId]);

  const ftin = useMemo(() => (draft?.profile.heightCm ? cmToFtIn(draft.profile.heightCm) : { feet: 0, inches: 0 }), [draft?.profile.heightCm]);

  if (q.isLoading || (!draft && q.data)) return <Spinner label="Loading profile" />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!draft) return <ErrorState error={new Error('Profile not found')} />;

  const b = draft;
  const set = (fn: (d: ProfileBundle) => ProfileBundle) => setDraft((d) => (d ? fn(structuredClone(d)) : d));
  const pref = b.preferences;

  async function next() {
    const errs = stepErrors(step, b);
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`err-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    const last = step === STEPS.length - 1;
    const nextStep = last ? step : step + 1;
    const saved = await save.mutateAsync({ ...b, profile: { ...b.profile, onboardingStep: Math.max(b.profile.onboardingStep, nextStep), onboardingComplete: last ? true : b.profile.onboardingComplete } });
    setDraft(saved);
    if (last) nav('/nutrition?calculate=1');
    else {
      setStep(nextStep);
      window.scrollTo({ top: 0 });
    }
  }

  const err = (k: string) => (errors[k] ? <p id={`err-${k}`} tabIndex={-1} role="alert" className="mt-1.5 text-xs font-medium text-danger">{errors[k]}</p> : null);
  const filteredIngredients = INGREDIENTS.filter((i) => i.foodGroup !== 'condiment' && i.name.toLowerCase().includes(exclusionQuery.toLowerCase()));

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => (step === 0 ? nav('/profiles') : setStep(step - 1))} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {step === 0 ? 'Profiles' : 'Back'}
      </button>
      <div className="mb-6">
        <p className="text-sm text-muted">
          Setting up <strong className="text-ink">{b.profile.displayName || 'profile'}</strong>, step {step + 1} of {STEPS.length}
        </p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-forest' : 'bg-line'}`} />
          ))}
        </div>
        <h1 className="mt-4 text-2xl font-semibold">{STEPS[step]}</h1>
      </div>

      <div className="card space-y-6 p-5 sm:p-7">
        {step === 0 && (
          <>
            <Field label="Profile name" htmlFor="name">
              <Input id="name" value={b.profile.displayName} maxLength={60} onChange={(e) => set((d) => ((d.profile.displayName = e.target.value), d))} />
            </Field>
            {err('name')}
            <div>
              <Field label="Date of birth" htmlFor="dob" hint="Used to work out age in completed years. We never guess age.">
                <Input id="dob" type="date" value={b.profile.dateOfBirth ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set((d) => ((d.profile.dateOfBirth = e.target.value || null), d))} invalid={!!errors.dob} />
              </Field>
              {err('dob')}
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Which reference equation fits this body best?</legend>
              <p className="mt-1 text-xs text-muted">Energy equations differ for male and female bodies. If you prefer not to say, we show a wider range covering both.</p>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
                {(['female', 'male', 'prefer_not_to_say'] as const).map((s) => (
                  <Chip key={s} role="radio" selected={b.profile.sex === s} onClick={() => set((d) => ((d.profile.sex = s), d))}>
                    {s === 'female' ? 'Female' : s === 'male' ? 'Male' : 'Prefer not to say'}
                  </Chip>
                ))}
              </div>
              {err('sex')}
            </fieldset>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Height</span>
                <div className="flex gap-1 text-xs" role="radiogroup" aria-label="Height unit">
                  <Chip role="radio" selected={heightUnit === 'cm'} onClick={() => setHeightUnit('cm')}>cm</Chip>
                  <Chip role="radio" selected={heightUnit === 'ftin'} onClick={() => setHeightUnit('ftin')}>ft / in</Chip>
                </div>
              </div>
              {heightUnit === 'cm' ? (
                <Input id="height" aria-label="Height in centimetres" inputMode="decimal" type="number" step="0.5" value={b.profile.heightCm ?? ''} onChange={(e) => set((d) => ((d.profile.heightCm = e.target.value === '' ? null : Number(e.target.value)), d))} invalid={!!errors.height} />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Input aria-label="Feet" inputMode="numeric" type="number" value={ftin.feet || ''} onChange={(e) => set((d) => ((d.profile.heightCm = round(ftInToCm(Number(e.target.value) || 0, ftin.inches), 1)), d))} placeholder="ft" />
                  <Input aria-label="Inches" inputMode="numeric" type="number" value={ftin.inches || ''} onChange={(e) => set((d) => ((d.profile.heightCm = round(ftInToCm(ftin.feet, Number(e.target.value) || 0), 1)), d))} placeholder="in" />
                </div>
              )}
              {b.profile.heightCm && heightUnit === 'ftin' && <p className="mt-1 text-xs text-muted">Saved as {b.profile.heightCm} cm.</p>}
              {err('height')}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Current weight</span>
                <div className="flex gap-1" role="radiogroup" aria-label="Weight unit">
                  <Chip role="radio" selected={weightUnit === 'kg'} onClick={() => setWeightUnit('kg')}>kg</Chip>
                  <Chip role="radio" selected={weightUnit === 'lb'} onClick={() => setWeightUnit('lb')}>lb</Chip>
                </div>
              </div>
              <Input
                aria-label={`Weight in ${weightUnit}`}
                inputMode="decimal"
                type="number"
                step="0.1"
                value={b.profile.weightKg == null ? '' : weightUnit === 'kg' ? b.profile.weightKg : round(kgToLb(b.profile.weightKg), 1)}
                onChange={(e) => set((d) => ((d.profile.weightKg = e.target.value === '' ? null : round(weightUnit === 'kg' ? Number(e.target.value) : lbToKg(Number(e.target.value)), 1)), d))}
                invalid={!!errors.weight}
              />
              {b.profile.weightKg != null && weightUnit === 'lb' && <p className="mt-1 text-xs text-muted">Saved as {b.profile.weightKg} kg.</p>}
              {err('weight')}
            </div>
            <Notice>We use weight for energy and protein estimates. BMI is shown later for context only and never sets your targets.</Notice>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset>
              <legend className="text-sm font-medium">What is a usual work or study day like?</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup">
                {OCCUPATION.map(([v, t, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={b.activity.occupation === v} onClick={() => set((x) => ((x.activity.occupation = v), x))} className="chip h-auto flex-col items-start rounded-ctl px-4 py-3 text-left">
                    <span className="font-medium">{t}</span>
                    <span className="text-xs font-normal text-muted">{d}</span>
                  </button>
                ))}
              </div>
              {err('occupation')}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Everyday movement outside workouts</legend>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
                {([['low', 'Low (under 5,000 steps)'], ['medium', 'Medium (5,000–10,000 steps)'], ['high', 'High (over 10,000 steps)']] as const).map(([v, l]) => (
                  <Chip key={v} role="radio" selected={b.activity.movement === v} onClick={() => set((x) => ((x.activity.movement = v), x))}>
                    {l}
                  </Chip>
                ))}
              </div>
              {err('movement')}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Workouts per week" htmlFor="wpw">
                <Input id="wpw" type="number" inputMode="numeric" min={0} max={14} value={b.activity.workoutsPerWeek} onChange={(e) => set((x) => ((x.activity.workoutsPerWeek = Math.max(0, Math.min(14, Number(e.target.value) || 0))), (x.activity.workoutType = x.activity.workoutsPerWeek === 0 ? 'none' : x.activity.workoutType === 'none' ? 'mixed' : x.activity.workoutType), x))} />
              </Field>
              {b.activity.workoutsPerWeek > 0 && (
                <>
                  <Field label="Minutes per session" htmlFor="wmin">
                    <Input id="wmin" type="number" inputMode="numeric" min={1} max={240} value={b.activity.workoutMinutes || ''} onChange={(e) => set((x) => ((x.activity.workoutMinutes = Number(e.target.value) || 0), x))} invalid={!!errors.minutes} />
                  </Field>
                  <Field label="Type" htmlFor="wtype">
                    <Select id="wtype" value={b.activity.workoutType} onChange={(e) => set((x) => ((x.activity.workoutType = e.target.value as typeof x.activity.workoutType), x))}>
                      <option value="strength">Strength / gym</option>
                      <option value="cardio">Running, cycling, cardio</option>
                      <option value="mixed">Mixed</option>
                      <option value="sport">Sport</option>
                      <option value="yoga">Yoga / pilates</option>
                    </Select>
                  </Field>
                </>
              )}
            </div>
            {err('minutes')}
            {b.activity.workoutsPerWeek > 0 && (
              <fieldset>
                <legend className="text-sm font-medium">How hard are most sessions?</legend>
                <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
                  {([['light', 'Light: can chat easily'], ['moderate', 'Moderate: a bit breathless'], ['vigorous', 'Vigorous: hard to talk']] as const).map(([v, l]) => (
                    <Chip key={v} role="radio" selected={b.activity.intensity === v} onClick={() => set((x) => ((x.activity.intensity = v), x))}>
                      {l}
                    </Chip>
                  ))}
                </div>
                {err('intensity')}
              </fieldset>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <fieldset>
              <legend className="text-sm font-medium">Food pattern</legend>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
                {(Object.keys(DIET_LABELS) as DietPattern[]).map((d) => (
                  <Chip key={d} role="radio" selected={pref.dietPattern === d} onClick={() => set((x) => ((x.preferences.dietPattern = d), x))}>
                    {DIET_LABELS[d]}
                  </Chip>
                ))}
              </div>
              {err('diet')}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Allergies and severe intolerances</legend>
              <p className="mt-1 text-xs text-muted">These are strict: matching recipes and products are removed, never just ranked lower.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(ALLERGEN_LABELS) as Allergen[]).map((a) => (
                  <Chip
                    key={a}
                    selected={pref.allergies.includes(a)}
                    onClick={() =>
                      set((x) => {
                        const has = x.preferences.allergies.includes(a);
                        x.preferences.allergies = has ? x.preferences.allergies.filter((y) => y !== a) : [...x.preferences.allergies, a];
                        x.preferences.allergiesConfirmed = x.preferences.allergies.length > 0;
                        return x;
                      })
                    }
                  >
                    {ALLERGEN_LABELS[a]}
                  </Chip>
                ))}
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-forest" checked={pref.allergiesConfirmed && pref.allergies.length === 0} onChange={(e) => set((x) => ((x.preferences.allergies = []), (x.preferences.allergiesConfirmed = e.target.checked), x))} />
                No allergies or severe intolerances
              </label>
              {err('allergies')}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Foods to never include (optional)</legend>
              <p className="mt-1 text-xs text-muted">Strict exclusions, for example a food you cannot stand or do not eat for any reason.</p>
              <Input aria-label="Search foods" className="mt-3" placeholder="Search, e.g. okra" value={exclusionQuery} onChange={(e) => setExclusionQuery(e.target.value)} />
              <div className="mt-3 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {filteredIngredients.slice(0, exclusionQuery ? 30 : 14).map((i) => (
                  <Chip key={i.id} selected={pref.hardExclusions.includes(i.id)} onClick={() => set((x) => ((x.preferences.hardExclusions = x.preferences.hardExclusions.includes(i.id) ? x.preferences.hardExclusions.filter((y) => y !== i.id) : [...x.preferences.hardExclusions, i.id]), x))}>
                    {i.name}
                  </Chip>
                ))}
              </div>
              {pref.hardExclusions.length > 0 && <p className="mt-2 text-xs text-muted">Excluding: {pref.hardExclusions.map((id) => INGREDIENTS.find((i) => i.id === id)?.name).join(', ')}</p>}
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Cuisines you enjoy (optional)</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {CUISINES.map(([v, l]) => (
                  <Chip key={v} selected={pref.cuisines.includes(v)} onClick={() => set((x) => ((x.preferences.cuisines = x.preferences.cuisines.includes(v) ? x.preferences.cuisines.filter((y) => y !== v) : [...x.preferences.cuisines, v]), x))}>
                    {l}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Meals per day" htmlFor="meals">
                <Select id="meals" value={pref.mealsPerDay} onChange={(e) => set((x) => ((x.preferences.mealsPerDay = Number(e.target.value) === 3 ? 3 : 4), x))}>
                  <option value={3}>3 meals</option>
                  <option value={4}>3 meals + a snack</option>
                </Select>
              </Field>
              <Field label="Cooking time you usually have per meal" htmlFor="cook">
                <Select id="cook" value={pref.maxCookMinutes} onChange={(e) => set((x) => ((x.preferences.maxCookMinutes = Number(e.target.value)), x))}>
                  <option value={20}>Up to 20 minutes</option>
                  <option value={30}>Up to 30 minutes</option>
                  <option value={40}>Up to 40 minutes</option>
                  <option value={60}>An hour is fine</option>
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <fieldset>
              <legend className="text-sm font-medium">Main goal</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup">
                {(
                  [
                    ['general', 'Eat balanced, everyday meals', 'More variety and regular meals.'],
                    ['muscle_fitness', 'Support training and muscle', 'Leans on affordable protein-rich foods.'],
                    ['weight_management', 'Manage weight', 'Stays near your estimated needs, with more fibre.'],
                    ['budget_first', 'Spend as little as possible', 'Keeps nutrition checks, cuts grocery cost.'],
                  ] as [Goal, string, string][]
                ).map(([v, t, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={b.goals.goal === v} onClick={() => set((x) => ((x.goals.goal = v), x))} className="chip h-auto flex-col items-start rounded-ctl px-4 py-3 text-left">
                    <span className="font-medium">{t}</span>
                    <span className="text-xs font-normal text-muted">{d}</span>
                  </button>
                ))}
              </div>
              {err('goal')}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Grocery budget for this person" htmlFor="budget" hint="Only for this profile. Household baskets never merge budgets silently.">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
                  <Input id="budget" type="number" inputMode="numeric" className="pl-7" value={b.budget.amountInr ?? ''} onChange={(e) => set((x) => ((x.budget.amountInr = e.target.value === '' ? null : Number(e.target.value)), x))} invalid={!!errors.budget} />
                </div>
              </Field>
              <Field label="Per" htmlFor="period">
                <Select id="period" value={b.budget.period} onChange={(e) => set((x) => ((x.budget.period = e.target.value as 'weekly' | 'monthly'), x))}>
                  <option value="weekly">week</option>
                  <option value="monthly">month</option>
                </Select>
              </Field>
            </div>
            {err('budget')}
            <fieldset>
              <legend className="text-sm font-medium">How strict is this budget?</legend>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
                <Chip role="radio" selected={b.budget.mode === 'hard'} onClick={() => set((x) => ((x.budget.mode = 'hard'), x))}>Hard limit, never go over</Chip>
                <Chip role="radio" selected={b.budget.mode === 'flexible'} onClick={() => set((x) => ((x.budget.mode = 'flexible'), x))}>Flexible, warn me if over</Chip>
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-medium">Usual brands and pack choice</legend>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
                {(['value', 'standard', 'premium'] as const).map((t) => (
                  <Chip key={t} role="radio" selected={pref.groceryTier === t} onClick={() => set((x) => ((x.preferences.groceryTier = t), x))}>
                    {t === 'value' ? 'Value packs' : t === 'standard' ? 'Regular brands' : 'Premium / organic'}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 5 && (
          <>
            <p className="text-muted">NourishCart builds plans for healthy adults. If any of these apply, we will not calculate a personal plan, and we suggest working with a doctor or registered dietitian instead.</p>
            <div className="space-y-2">
              {CLINICAL.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-ctl border border-line px-4 py-3 hover:bg-canvas">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-forest"
                    checked={pref.clinicalFlags.includes(c.id)}
                    onChange={() => set((x) => ((x.preferences.clinicalFlags = x.preferences.clinicalFlags.includes(c.id) ? x.preferences.clinicalFlags.filter((y) => y !== c.id) : [...x.preferences.clinicalFlags, c.id]), (x.preferences.noClinicalFlagsConfirmed = false), x))}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-ctl bg-mint px-4 py-3">
              <input type="checkbox" className="h-5 w-5 accent-forest" checked={pref.noClinicalFlagsConfirmed} onChange={(e) => set((x) => ((x.preferences.noClinicalFlagsConfirmed = e.target.checked), (x.preferences.clinicalFlags = e.target.checked ? [] : x.preferences.clinicalFlags), x))} />
              <span className="font-medium text-forest">None of these apply</span>
            </label>
            {err('clinical')}
            <p className="text-xs text-muted">We only store whether a personal plan is in scope, never which item you ticked.</p>
          </>
        )}

        {step === 6 && (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {[
              ['Age', b.profile.dateOfBirth ? `${ageInYears(b.profile.dateOfBirth)} years` : '—'],
              ['Height / weight', `${b.profile.heightCm} cm, ${b.profile.weightKg} kg`],
              ['Daily work', OCCUPATION.find((o) => o[0] === b.activity.occupation)?.[1] ?? '—'],
              ['Workouts', b.activity.workoutsPerWeek ? `${b.activity.workoutsPerWeek} × ${b.activity.workoutMinutes} min, ${b.activity.intensity}` : 'None'],
              ['Food pattern', pref.dietPattern ? DIET_LABELS[pref.dietPattern] : '—'],
              ['Allergies', pref.allergies.length ? pref.allergies.map((a) => ALLERGEN_LABELS[a]).join(', ') : 'None'],
              ['Never include', pref.hardExclusions.length ? pref.hardExclusions.map((id) => INGREDIENTS.find((i) => i.id === id)?.name).join(', ') : 'Nothing'],
              ['Budget', b.budget.amountInr ? `₹${b.budget.amountInr.toLocaleString('en-IN')} per ${b.budget.period === 'weekly' ? 'week' : 'month'} (${b.budget.mode})` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-muted">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <Notice>Next we estimate energy and protein from these answers. You will see the method, the range and every assumption before choosing a plan.</Notice>
            </div>
          </dl>
        )}
      </div>

      <div className="sticky bottom-[72px] mt-6 flex justify-end gap-2 bg-canvas/90 py-3 backdrop-blur lg:bottom-0">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Button onClick={next} loading={save.isPending} disabled={!online}>
          {step === STEPS.length - 1 ? 'Calculate my estimates' : 'Save and continue'}
        </Button>
      </div>
      {save.error && <ErrorState error={save.error} />}
    </div>
  );
}
