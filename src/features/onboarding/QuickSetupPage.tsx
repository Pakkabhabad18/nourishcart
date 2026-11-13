// Speak-or-type setup. The person describes themselves once; a rule-based reader
// (src/domain/intake/extract.ts) fills the profile and quotes the words it relied on.
// Only the details that are still missing are asked afterwards, as short questions.
// Nothing here calls an AI model, and allergies or "no health conditions" are never
// assumed from silence: they must be said or ticked.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Mic, Square } from 'lucide-react';
import { useBundle, useSaveBundle } from '../../app/hooks.ts';
import { useApp } from '../../app/context.tsx';
import { Button, Chip, ErrorState, Field, Input, Notice, Select, Spinner, Tag } from '../../components/ui.tsx';
import type { Allergen, ClinicalFlag, DietPattern, Goal, ProfileBundle } from '../../domain/types.ts';
import { ALLERGEN_LABELS, DIET_LABELS } from '../../domain/diet.ts';
import { extractProfile, type Extraction } from '../../domain/intake/extract.ts';
import { applyExtraction } from '../../domain/intake/apply.ts';
import { currentAge, validateProfileForNutrition, BOUNDS } from '../../domain/nutrition/eligibility.ts';
import { INGREDIENT_MAP } from '../../data/ingredients.ts';
import { useSpeech } from '../../lib/useSpeech.ts';
import { AI_CONSENT_KEY, aiAddedFields, readWithAi, type AiReading } from '../../lib/aiIntake.ts';

const EXAMPLE =
  "I'm 26, female, 162 cm and 58 kg. I have a desk job and walk about 7,000 steps a day. I go to the gym three times a week for 45 minutes, moderate effort. I'm vegetarian but I eat eggs, no allergies, and I never eat bhindi. I want to build muscle on about ₹1,500 a week. No health conditions.";

// What we hope to hear, in the order people usually say it. Shown as a live checklist.
const TOPICS: { key: Topic; label: string }[] = [
  { key: 'age', label: 'Age' },
  { key: 'sex', label: 'Sex' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'occupation', label: 'Work or day' },
  { key: 'movement', label: 'Walking' },
  { key: 'workouts', label: 'Workouts' },
  { key: 'diet', label: 'Food pattern' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'goal', label: 'Goal' },
  { key: 'budget', label: 'Budget' },
  { key: 'clinical', label: 'Health conditions' },
];
type Topic = 'age' | 'sex' | 'height' | 'weight' | 'occupation' | 'movement' | 'workouts' | 'diet' | 'allergies' | 'goal' | 'budget' | 'clinical';

const OCCUPATION = [
  ['sedentary', 'Mostly sitting'],
  ['light', 'Some standing and walking'],
  ['moderate', 'On my feet most of the day'],
  ['heavy', 'Hard physical work'],
] as const;
const MOVEMENT = [
  ['low', 'Under 5,000 steps'],
  ['medium', '5,000–10,000 steps'],
  ['high', 'Over 10,000 steps'],
] as const;
const INTENSITY = [
  ['light', 'Light'],
  ['moderate', 'Moderate'],
  ['vigorous', 'Vigorous'],
] as const;
const GOALS: [Goal, string][] = [
  ['general', 'Eat balanced meals'],
  ['muscle_fitness', 'Support training and muscle'],
  ['weight_management', 'Manage weight'],
  ['budget_first', 'Spend as little as possible'],
];
const CLINICAL: [ClinicalFlag, string][] = [
  ['pregnancy', 'Pregnant'],
  ['lactation', 'Breastfeeding'],
  ['eating_disorder', 'Eating disorder'],
  ['kidney_disease', 'Kidney disease'],
  ['diabetes_clinical_diet', 'Diabetes needing a clinical diet'],
  ['bariatric_surgery', 'Recent bariatric surgery'],
  ['other_medical_condition', 'Another doctor-managed diet'],
];

/** Is this topic answered in the draft profile? Workouts count once said or ticked. */
function answered(t: Topic, b: ProfileBundle, workoutsKnown: boolean, now: Date): boolean {
  const p = b.profile;
  switch (t) {
    case 'age': return !Number.isNaN(currentAge(p, now));
    case 'sex': return p.sex != null;
    case 'height': return p.heightCm != null;
    case 'weight': return p.weightKg != null;
    case 'occupation': return b.activity.occupation != null;
    case 'movement': return b.activity.movement != null;
    case 'workouts': return workoutsKnown && (b.activity.workoutsPerWeek === 0 || (b.activity.intensity != null && b.activity.workoutMinutes > 0));
    case 'diet': return b.preferences.dietPattern != null;
    case 'allergies': return b.preferences.allergiesConfirmed;
    case 'goal': return b.goals.goal != null;
    case 'budget': return b.budget.amountInr != null;
    case 'clinical': return b.preferences.noClinicalFlagsConfirmed || b.preferences.clinicalFlags.length > 0;
  }
}

/** Human-readable lines for what the reader understood, each with the words it used. */
function understood(e: Extraction): { key: string; label: string; value: string; evidence: string }[] {
  const rows: { key: string; label: string; value: string; evidence: string }[] = [];
  const add = (label: string, f: { value: unknown; evidence: string } | undefined, show: (v: never) => string) => {
    const key = (Object.keys(e) as (keyof Extraction)[]).find((k) => e[k] === f) ?? label;
    if (f) rows.push({ key, label, value: show(f.value as never), evidence: f.evidence });
  };
  add('Age', e.ageYears, (v: number) => `${v} years`);
  add('Sex', e.sex, (v: string) => (v === 'prefer_not_to_say' ? 'Prefer not to say' : v === 'male' ? 'Male' : 'Female'));
  add('Height', e.heightCm, (v: number) => `${v} cm`);
  add('Weight', e.weightKg, (v: number) => `${v} kg`);
  add('Work or day', e.occupation, (v: string) => OCCUPATION.find((o) => o[0] === v)?.[1] ?? v);
  add('Walking', e.movement, (v: string) => MOVEMENT.find((o) => o[0] === v)?.[1] ?? v);
  add('Workouts', e.workoutsPerWeek, (v: number) => (v === 0 ? 'None' : `${v} a week`));
  add('Workout length', e.workoutMinutes, (v: number) => `${v} min`);
  add('Workout effort', e.intensity, (v: string) => v[0].toUpperCase() + v.slice(1));
  add('Food pattern', e.dietPattern, (v: DietPattern) => DIET_LABELS[v]);
  add('Allergies', e.allergies, (v: Allergen[]) => v.map((a) => ALLERGEN_LABELS[a]).join(', '));
  add('Allergies', e.noAllergies, () => 'None');
  add('Never include', e.hardExclusions, (v: string[]) => v.map((id) => INGREDIENT_MAP.get(id)?.name ?? id).join(', '));
  add('Prefer less', e.dislikes, (v: string[]) => v.map((id) => INGREDIENT_MAP.get(id)?.name ?? id).join(', '));
  add('Goal', e.goal, (v: Goal) => GOALS.find((g) => g[0] === v)?.[1] ?? v);
  add('Budget', e.budgetInr, (v: number) => `₹${v.toLocaleString('en-IN')}${e.budgetPeriod ? ` ${e.budgetPeriod}` : ''}`);
  add('Health conditions', e.clinicalFlags, (v: ClinicalFlag[]) => v.map((c) => CLINICAL.find((x) => x[0] === c)?.[1] ?? c).join(', '));
  add('Health conditions', e.noClinical, () => 'None');
  return rows;
}

type Patch = (b: ProfileBundle) => void;

export function QuickSetupPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { setActiveProfileId } = useApp();
  const q = useBundle(id);
  const save = useSaveBundle();
  const [now] = useState(() => new Date());
  const [text, setText] = useState('');
  const [stage, setStage] = useState<'describe' | 'review'>('describe');
  // Answers given with the controls below. They are re-applied on top of whatever is
  // read from the text, so typing more never wipes out a tick the person made.
  const [manual, setManual] = useState<Record<string, Patch>>({});
  const [workoutsTicked, setWorkoutsTicked] = useState(false);
  const [asked, setAsked] = useState<Topic[]>([]);
  const [error, setError] = useState<string | null>(null);
  // AI reader: opt-in, remembered in this browser. Off = rule reader only.
  const [aiOn, setAiOn] = useState(() => {
    try {
      return localStorage.getItem(AI_CONSENT_KEY) === 'yes';
    } catch {
      return false;
    }
  });
  const [ai, setAi] = useState<AiReading | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);

  const speech = useSpeech((phrase) => setText((t) => (t ? `${t.trimEnd()} ${phrase}` : phrase)));

  useEffect(() => {
    if (q.data) setActiveProfileId(q.data.profile.id);
  }, [q.data, setActiveProfileId]);

  // The rule reader runs on every keystroke (instant, offline). The AI reading, when there is
  // one for exactly this text, replaces it; editing the text falls back to the rules.
  const rulesExtraction = useMemo(() => extractProfile(text, now), [text, now]);
  const extraction = ai && ai.text === text ? ai.merged : rulesExtraction;
  const draft = useMemo(() => {
    if (!q.data) return null;
    const b = applyExtraction(q.data, extraction, now);
    for (const patch of Object.values(manual)) patch(b);
    return b;
  }, [q.data, extraction, manual, now]);

  if (q.isLoading) return <Spinner label="Loading profile" />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!draft) return <ErrorState error={new Error('Profile not found')} />;

  const b = draft;
  const workoutsKnown = workoutsTicked || !!extraction.workoutsPerWeek || q.data!.profile.onboardingStep > 2;
  const missing = TOPICS.filter((t) => !answered(t.key, b, workoutsKnown, now)).map((t) => t.key);
  // Keep a question on screen once asked, even after it is answered, so it doesn't jump away.
  const shown = TOPICS.map((t) => t.key).filter((k) => missing.includes(k) || asked.includes(k));
  const set = (key: string, patch: Patch) => {
    setError(null);
    setManual((m) => ({ ...m, [key]: patch }));
  };
  const ageRaw = currentAge(b.profile, now);
  const age = Number.isNaN(ageRaw) ? null : ageRaw;
  const rows = understood(extraction);
  const eligibility = validateProfileForNutrition(b, now);

  const aiUsed = ai && ai.text === text ? ai : null;
  const aiAdded = new Set(aiUsed ? aiAddedFields(aiUsed) : []);

  /** Which topics are still unanswered for a given reading of the text. */
  function missingFor(e: Extraction): Topic[] {
    const d = applyExtraction(q.data!, e, now);
    for (const patch of Object.values(manual)) patch(d);
    const known = workoutsTicked || !!e.workoutsPerWeek || q.data!.profile.onboardingStep > 2;
    return TOPICS.filter((t) => !answered(t.key, d, known, now)).map((t) => t.key);
  }

  async function toReview() {
    speech.stop();
    let used: Extraction = rulesExtraction;
    setAiFailed(false);
    if (aiOn) {
      setAiBusy(true);
      const r = await readWithAi(text, now);
      setAiBusy(false);
      setAi(r);
      if (r) used = r.merged;
      else setAiFailed(true);
    }
    setAsked(missingFor(used));
    setStage('review');
    window.scrollTo({ top: 0 });
  }

  function toggleAi(on: boolean) {
    setAiOn(on);
    try {
      localStorage.setItem(AI_CONSENT_KEY, on ? 'yes' : 'no');
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }

  async function finish() {
    setError(null);
    if (missing.length) return setError(`Still needed: ${missing.map((m) => TOPICS.find((t) => t.key === m)!.label.toLowerCase()).join(', ')}.`);
    if (age != null && age < BOUNDS.ageYears.min) return setError('NourishCart currently plans only for adults aged 18 and over.');
    if (eligibility.status === 'incomplete') return setError(eligibility.invalid.map((i) => i.message).join('. ') || 'Some details are out of range.');
    await save.mutateAsync({ ...b, profile: { ...b.profile, onboardingStep: 6, onboardingComplete: true } });
    nav('/nutrition?calculate=1');
  }

  const listening = speech.status === 'listening';

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => (stage === 'review' ? setStage('describe') : nav('/profiles'))} className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {stage === 'review' ? 'Back to describing' : 'Profiles'}
      </button>

      {stage === 'describe' && (
        <>
          <h1 className="text-2xl font-normal">Tell us about {b.profile.displayName || 'yourself'}</h1>
          <p className="mt-1 text-on-surface-variant">Say it in your own words, the way you'd tell a friend. We'll fill in the form and only ask about what's missing.</p>

          <div className="card mt-5 p-5">
            <div className="flex items-center gap-4">
              {speech.supported ? (
                <button
                  type="button"
                  onClick={listening ? speech.stop : speech.start}
                  aria-pressed={listening}
                  aria-label={listening ? 'Stop recording' : 'Start speaking'}
                  className={`grid h-16 w-16 shrink-0 place-items-center rounded-full transition ${listening ? 'mic-live bg-error text-on-error' : 'bg-primary text-on-primary hover:shadow-e2'}`}
                >
                  {listening ? <Square className="h-6 w-6" aria-hidden /> : <Mic className="h-7 w-7" aria-hidden />}
                </button>
              ) : null}
              <div className="text-sm">
                {speech.status === 'listening' && <p className="font-medium">Listening… tap the button when you're done.</p>}
                {speech.status === 'idle' && <p className="font-medium">Tap the microphone and start talking, or type below.</p>}
                {speech.status === 'unsupported' && <p className="font-medium">This browser can't take voice input. Type below, or use Chrome, Edge or Safari to speak.</p>}
                {speech.status === 'denied' && <p className="font-medium text-error">Microphone access was blocked. Allow it in the browser's site settings, or type below.</p>}
                {speech.status === 'error' && <p className="font-medium text-error">Voice input stopped. Try again, or type below.</p>}
                <p className="text-on-surface-variant">Voice is turned into text by your browser. Nothing is sent to an AI model.</p>
              </div>
            </div>

            <label htmlFor="describe" className="sr-only">Describe yourself</label>
            <textarea
              id="describe"
              value={text + (speech.interim ? ` ${speech.interim}` : '')}
              onChange={(e) => setText(e.target.value)}
              readOnly={listening}
              rows={6}
              placeholder="Age, sex, height, weight, your work day, workouts, what you eat and don't, allergies, goal, weekly grocery budget, and any health conditions."
              className="field-input mt-4 min-h-36 w-full resize-y py-3 leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <button type="button" className="text-primary hover:underline" onClick={() => setText(EXAMPLE)}>
                Use an example
              </button>
              {text && (
                <button type="button" className="text-on-surface-variant hover:underline" onClick={() => { setText(''); setManual({}); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-ctl bg-surface-container p-4 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" checked={aiOn} onChange={(e) => toggleAi(e.target.checked)} />
            <span>
              <span className="font-medium">Let AI read my description</span>
              <span className="block text-on-surface-variant">
                Better with long, mixed-language or rambling descriptions. Only these words are sent to an AI model (on Groq), never your name or email. They aren't stored or used for training. NourishCart's own rules check every answer before it's used.
              </span>
            </span>
          </label>

          <div className="mt-5">
            <h2 className="text-sm font-medium text-on-surface-variant">Covered so far</h2>
            <ul className="mt-2 flex flex-wrap gap-2" aria-live="polite">
              {TOPICS.map((t) => {
                const ok = !missing.includes(t.key);
                return (
                  <li key={t.key} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${ok ? 'border-transparent bg-secondary-container text-on-secondary-container' : 'border-outline-variant text-on-surface-variant'}`}>
                    {ok && <Check className="h-4 w-4" aria-hidden />}
                    {t.label}
                    <span className="sr-only">{ok ? ' covered' : ' not yet'}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={toReview} disabled={!text.trim() || aiBusy} loading={aiBusy}>
              {aiBusy ? 'AI is reading…' : aiOn ? 'Continue' : missing.length === 0 ? 'Review' : `Continue (${missing.length} left to ask)`}
            </Button>
            <Link to={`/profiles/${b.profile.id}/setup`} className="inline-flex items-center px-3 text-sm text-primary hover:underline">
              Fill the form step by step instead
            </Link>
          </div>
        </>
      )}

      {stage === 'review' && (
        <>
          <h1 className="text-2xl font-normal">{shown.length ? 'A few more details' : 'Check what we understood'}</h1>
          <p className="mt-1 text-on-surface-variant">
            {shown.length ? `${shown.length <= 3 ? 'We understood most of it. ' : ''}Answer ${shown.length === 1 ? 'one more question' : `${shown.length} short questions`} and you're done.` : 'Everything we need is here. Correct anything that looks wrong.'}
          </p>

          {age != null && age < BOUNDS.ageYears.min && <Notice className="mt-4" tone="danger">NourishCart currently plans only for adults aged 18 and over, so this profile can't be completed.</Notice>}
          {eligibility.status === 'out_of_scope' && age != null && age >= BOUNDS.ageYears.min && (
            <Notice className="mt-4" tone="warn" title="We'll save this, but won't calculate targets">
              {eligibility.scopeReasons.join(' ')} Please plan meals with a doctor or registered dietitian.
            </Notice>
          )}
          {aiUsed && (
            <Notice className="mt-4" tone="success" title="Read by AI, checked by NourishCart">
              {aiAdded.size > 0 ? `The AI picked up ${aiAdded.size} detail${aiAdded.size === 1 ? '' : 's'} our built-in reader missed (marked AI below).` : 'The AI agreed with our built-in reader.'}{' '}
              Model {aiUsed.model}, prompt {aiUsed.promptVersion}.
              {aiUsed.rejected.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer">{aiUsed.rejected.length} AI suggestion{aiUsed.rejected.length === 1 ? ' was' : 's were'} rejected by our checks</summary>
                  <ul className="mt-1 list-disc pl-5">
                    {aiUsed.rejected.map((d) => (
                      <li key={d.field}>
                        {d.field}: {d.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Notice>
          )}
          {aiFailed && <Notice className="mt-4" tone="info">The AI reader isn't available right now, so our built-in reader filled this in.</Notice>}
          {extraction.warnings.map((w) => (
            <Notice key={w} className="mt-4" tone="warn">{w}</Notice>
          ))}

          {shown.length > 0 && (
            <div className="mt-5 space-y-4">
              {shown.includes('age') && (
                <div className="card p-4">
                  <Field label="Age in years" htmlFor="q-age">
                    <Input id="q-age" type="number" inputMode="numeric" min={1} max={120} value={age ?? ''} onChange={(e) => { const v = Number(e.target.value); set('age', (x) => { x.profile.dateOfBirth = null; x.profile.ageAtEntry = v > 0 ? v : null; x.profile.ageEnteredAt = v > 0 ? now.toISOString() : null; }); }} />
                  </Field>
                </div>
              )}
              {shown.includes('sex') && (
                <Question title="Sex used for the energy formula">
                  {([['female', 'Female'], ['male', 'Male'], ['prefer_not_to_say', 'Prefer not to say']] as const).map(([v, l]) => (
                    <Chip key={v} role="radio" selected={b.profile.sex === v} onClick={() => set('sex', (x) => { x.profile.sex = v; })}>{l}</Chip>
                  ))}
                </Question>
              )}
              {(shown.includes('height') || shown.includes('weight')) && (
                <div className="card grid grid-cols-2 gap-4 p-4">
                  {shown.includes('height') && (
                    <Field label="Height (cm)" htmlFor="q-h">
                      <Input id="q-h" type="number" inputMode="decimal" value={b.profile.heightCm ?? ''} onChange={(e) => { const v = Number(e.target.value); set('height', (x) => { x.profile.heightCm = v > 0 ? v : null; }); }} />
                    </Field>
                  )}
                  {shown.includes('weight') && (
                    <Field label="Weight (kg)" htmlFor="q-w">
                      <Input id="q-w" type="number" inputMode="decimal" value={b.profile.weightKg ?? ''} onChange={(e) => { const v = Number(e.target.value); set('weight', (x) => { x.profile.weightKg = v > 0 ? v : null; }); }} />
                    </Field>
                  )}
                </div>
              )}
              {shown.includes('occupation') && (
                <Question title="What is a usual day like?">
                  {OCCUPATION.map(([v, l]) => (
                    <Chip key={v} role="radio" selected={b.activity.occupation === v} onClick={() => set('occupation', (x) => { x.activity.occupation = v; })}>{l}</Chip>
                  ))}
                </Question>
              )}
              {shown.includes('movement') && (
                <Question title="Everyday walking, outside workouts">
                  {MOVEMENT.map(([v, l]) => (
                    <Chip key={v} role="radio" selected={b.activity.movement === v} onClick={() => set('movement', (x) => { x.activity.movement = v; })}>{l}</Chip>
                  ))}
                </Question>
              )}
              {shown.includes('workouts') && (
                <div className="card space-y-3 p-4">
                  <Field label="Workouts per week (0 if none)" htmlFor="q-wpw">
                    <Input id="q-wpw" type="number" inputMode="numeric" min={0} max={14} value={workoutsKnown ? b.activity.workoutsPerWeek : ''} onChange={(e) => { const v = Math.max(0, Math.min(14, Number(e.target.value) || 0)); setWorkoutsTicked(true); set('wpw', (x) => { x.activity.workoutsPerWeek = v; if (v === 0) { x.activity.workoutType = 'none'; x.activity.intensity = null; x.activity.workoutMinutes = 0; } else if (x.activity.workoutType === 'none') x.activity.workoutType = 'mixed'; }); }} />
                  </Field>
                  {b.activity.workoutsPerWeek > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Minutes per session" htmlFor="q-wmin">
                        <Input id="q-wmin" type="number" inputMode="numeric" value={b.activity.workoutMinutes || ''} onChange={(e) => { const v = Math.max(0, Math.min(240, Number(e.target.value) || 0)); set('wmin', (x) => { x.activity.workoutMinutes = v; }); }} />
                      </Field>
                      <Field label="How hard" htmlFor="q-int">
                        <Select id="q-int" value={b.activity.intensity ?? ''} onChange={(e) => { const v = (e.target.value || null) as typeof b.activity.intensity; set('int', (x) => { x.activity.intensity = v; }); }}>
                          <option value="">Choose</option>
                          {INTENSITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </Select>
                      </Field>
                    </div>
                  )}
                </div>
              )}
              {shown.includes('diet') && (
                <Question title="Food pattern">
                  {(Object.keys(DIET_LABELS) as DietPattern[]).map((v) => (
                    <Chip key={v} role="radio" selected={b.preferences.dietPattern === v} onClick={() => set('diet', (x) => { x.preferences.dietPattern = v; })}>{DIET_LABELS[v]}</Chip>
                  ))}
                </Question>
              )}
              {shown.includes('allergies') && (
                <Question title="Food allergies" hint="We never assume none. Tick each allergy, or choose “No food allergies”.">
                  {(Object.keys(ALLERGEN_LABELS) as Allergen[]).map((a) => (
                    <Chip key={a} selected={b.preferences.allergies.includes(a)} onClick={() => set(`allergy-${a}`, (x) => { const has = x.preferences.allergies.includes(a); x.preferences.allergies = has ? x.preferences.allergies.filter((y) => y !== a) : [...x.preferences.allergies, a]; x.preferences.allergiesConfirmed = true; })}>{ALLERGEN_LABELS[a]}</Chip>
                  ))}
                  <Chip selected={b.preferences.allergiesConfirmed && b.preferences.allergies.length === 0} onClick={() => set('allergy-none', (x) => { if (x.preferences.allergies.length === 0) x.preferences.allergiesConfirmed = true; })}>No food allergies</Chip>
                </Question>
              )}
              {shown.includes('goal') && (
                <Question title="Main goal">
                  {GOALS.map(([v, l]) => (
                    <Chip key={v} role="radio" selected={b.goals.goal === v} onClick={() => set('goal', (x) => { x.goals.goal = v; })}>{l}</Chip>
                  ))}
                </Question>
              )}
              {shown.includes('budget') && (
                <div className="card grid grid-cols-[1fr_auto] items-end gap-3 p-4">
                  <Field label="Grocery budget (₹)" htmlFor="q-bud">
                    <Input id="q-bud" type="number" inputMode="numeric" value={b.budget.amountInr ?? ''} onChange={(e) => { const v = Number(e.target.value); set('budget', (x) => { x.budget.amountInr = v > 0 ? v : null; }); }} />
                  </Field>
                  <Select aria-label="Budget period" value={b.budget.period} onChange={(e) => { const v = e.target.value as 'weekly' | 'monthly'; set('period', (x) => { x.budget.period = v; }); }}>
                    <option value="weekly">per week</option>
                    <option value="monthly">per month</option>
                  </Select>
                </div>
              )}
              {shown.includes('clinical') && (
                <Question title="Do any of these apply?" hint="NourishCart is for healthy adults. If one applies, we'll save the profile but won't calculate targets.">
                  {CLINICAL.map(([v, l]) => (
                    <Chip key={v} selected={b.preferences.clinicalFlags.includes(v)} onClick={() => set(`clin-${v}`, (x) => { const has = x.preferences.clinicalFlags.includes(v); x.preferences.clinicalFlags = has ? x.preferences.clinicalFlags.filter((y) => y !== v) : [...x.preferences.clinicalFlags, v]; x.preferences.noClinicalFlagsConfirmed = false; })}>{l}</Chip>
                  ))}
                  <Chip selected={b.preferences.noClinicalFlagsConfirmed} onClick={() => set('clin-none', (x) => { if (x.preferences.clinicalFlags.length === 0) x.preferences.noClinicalFlagsConfirmed = true; })}>None of these</Chip>
                </Question>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <section className="card mt-6 p-5">
              <h2 className="text-lg font-medium">What we understood</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Each line shows the words it came from. If something is wrong, go back and say it differently, or use the step-by-step form.</p>
              <dl className="mt-3 divide-y divide-outline-variant">
                {rows.map((r) => (
                  <div key={`${r.key}-${r.value}`} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-sm text-on-surface-variant">
                      {r.label} {aiAdded.has(r.key) && <Tag tone="good">AI</Tag>}
                    </dt>
                    <dd>
                      <span className="font-medium">{r.value}</span>
                      <span className="block text-xs text-on-surface-variant">from “{r.evidence.replace(/[\s,.;:]+$/, '')}”</span>
                    </dd>
                  </div>
                ))}
              </dl>
              {extraction.unknownFoods.length > 0 && (
                <Notice className="mt-3" tone="info">We don't stock {extraction.unknownFoods.join(', ')} yet, so it won't appear in plans either way.</Notice>
              )}
            </section>
          )}

          {error && <Notice className="mt-4" tone="danger">{error}</Notice>}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={finish} loading={save.isPending} disabled={age != null && age < BOUNDS.ageYears.min}>
              Save and see my targets
            </Button>
            <Link to={`/profiles/${b.profile.id}/setup`} className="inline-flex items-center px-3 text-sm text-primary hover:underline">
              Open the full form
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-4">
      <legend className="sr-only">{title}</legend>
      <p className="font-medium" aria-hidden>{title}</p>
      {hint && <p className="mt-0.5 text-sm text-on-surface-variant">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
