// Conversation setup engine. Pure functions, no browser APIs, so it can be unit-tested and
// evaluated like the rest of the domain.
//
// How a turn works:
//   1. nextQuestion(state) picks the first question that is still unanswered
//   2. the person answers in their own words (spoken or typed)
//   3. answer(state, key, text) reads it twice:
//        - the full rule reader (extractProfile) on the whole answer, so "I'm 26, 58 kg and
//          vegetarian" fills three questions at once and those are skipped
//        - a small reader for the question just asked, for bare answers like "26", "no"
//          or "1,500 a week" that only make sense next to the question
//   4. it returns a short "got it" line to say back, or null when nothing usable was heard
//
// Safety rules carried over from the form: allergies and "no health conditions" are only
// recorded from an answer to that exact question (or explicit words like "no allergies"),
// never assumed from silence.
import type { BodyGoal, ClinicalFlag, FocusNutrient, ProfileBundle } from '../types.ts';
import { extractProfile, normalise, type Extraction } from './extract.ts';
import { applyExtraction } from './apply.ts';
import { ALLERGEN_LABELS, DIET_LABELS } from '../diet.ts';
import { BODY_GOAL_LABEL, FOCUS_LABEL } from '../nutrition/personal.ts';

export const CONVERSATION_VERSION = 'conversation-1.0.0';

export type QKey =
  | 'age' | 'sex' | 'height' | 'weight' | 'occupation' | 'movement' | 'workouts' | 'workoutDetails'
  | 'diet' | 'allergies' | 'exclusions' | 'goal' | 'focus' | 'budget' | 'budgetPeriod' | 'clinical';

export interface ConvState {
  e: Extraction; // everything heard so far, merged
  bodyGoal: BodyGoal | null;
  budgetFirst: boolean;
  focus: FocusNutrient[] | null; // null = not asked yet; [] = "none"
  exclusionsDone: boolean;
  misses: Partial<Record<QKey, number>>; // how many times a question wasn't understood
}

export const emptyConversation = (): ConvState => ({ e: { warnings: [], unknownFoods: [] }, bodyGoal: null, budgetFirst: false, focus: null, exclusionsDone: false, misses: {} });

export interface Question {
  key: QKey;
  /** What the app says. Kept short so it sounds natural when read aloud. */
  ask: string;
  /** Said when the answer wasn't understood. Gives an example. */
  retry: string;
  /** Tap-to-answer options. The `say` text is fed through the same reader as speech. */
  choices?: { label: string; say: string }[];
}

export const QUESTIONS: Record<QKey, Question> = {
  age: { key: 'age', ask: 'How old are you?', retry: 'Just your age in years, like 26.' },
  sex: {
    key: 'sex', ask: 'Are you male or female?', retry: 'Male, female, or you can say prefer not to say.',
    choices: [{ label: 'Female', say: 'female' }, { label: 'Male', say: 'male' }, { label: 'Prefer not to say', say: 'prefer not to say' }],
  },
  height: { key: 'height', ask: 'How tall are you?', retry: 'In centimetres or feet, like 165 centimetres or 5 feet 6.' },
  weight: { key: 'weight', ask: 'And your weight?', retry: 'In kilos, like 60 kg.' },
  occupation: {
    key: 'occupation', ask: 'What does a normal day look like? Desk job, on your feet, or physical work?', retry: 'For example: desk job, student, teacher, or construction work.',
    choices: [{ label: 'Mostly sitting', say: 'desk job' }, { label: 'Some walking', say: 'some standing and walking' }, { label: 'On my feet', say: 'on my feet all day' }, { label: 'Physical work', say: 'heavy physical work' }],
  },
  movement: {
    key: 'movement', ask: 'Roughly how much do you walk in a day?', retry: 'Not much, a fair bit, or a lot. Or a step count, like 6,000 steps.',
    choices: [{ label: 'Not much', say: 'not much' }, { label: '5,000–10,000 steps', say: '7000 steps' }, { label: 'Over 10,000', say: '12000 steps' }],
  },
  workouts: {
    key: 'workouts', ask: 'Do you work out? If yes, how many times a week?', retry: 'Say no, or a number like 3 times a week.',
    choices: [{ label: 'No', say: 'no' }, { label: '2 a week', say: '2 times a week' }, { label: '3–4 a week', say: '4 times a week' }, { label: '5+ a week', say: '5 times a week' }],
  },
  workoutDetails: {
    key: 'workoutDetails', ask: 'How long is a session, and how hard? Light, moderate or intense?', retry: 'Like 45 minutes, moderate.',
    choices: [{ label: '30 min, light', say: '30 minutes light' }, { label: '45 min, moderate', say: '45 minutes moderate' }, { label: '60 min, intense', say: '60 minutes intense' }],
  },
  diet: {
    key: 'diet', ask: 'What do you eat? Vegetarian, eggs, non-veg or vegan?', retry: 'Vegetarian, eggetarian, non-vegetarian or vegan.',
    choices: [{ label: 'Vegetarian', say: 'vegetarian' }, { label: 'Veg + eggs', say: 'eggetarian' }, { label: 'Non-veg', say: 'non vegetarian' }, { label: 'Vegan', say: 'vegan' }],
  },
  allergies: {
    key: 'allergies', ask: 'Any food allergies?', retry: 'Say no, or name them, like peanuts or milk.',
    choices: [{ label: 'No allergies', say: 'no' }, { label: 'Peanuts', say: 'peanut allergy' }, { label: 'Milk', say: 'dairy allergy' }, { label: 'Gluten', say: 'gluten allergy' }],
  },
  exclusions: {
    key: 'exclusions', ask: 'Any food you never want in your meals?', retry: 'Say nothing, or name a food, like bhindi or mushroom.',
    choices: [{ label: 'Nothing', say: 'nothing' }],
  },
  goal: {
    key: 'goal', ask: 'What is your goal? Lose fat, stay as you are, or build muscle?', retry: 'Lose fat, stay the same, or build muscle.',
    choices: [{ label: 'Lose fat', say: 'lose fat' }, { label: 'Stay as I am', say: 'stay the same' }, { label: 'Build muscle', say: 'build muscle' }],
  },
  focus: {
    key: 'focus', ask: 'Has a doctor or blood test said you are low in anything, like iron, B12 or vitamin D?', retry: 'Say no, or name it, like iron or calcium.',
    choices: [{ label: 'No', say: 'no' }, { label: 'Iron', say: 'iron' }, { label: 'B12', say: 'b12' }, { label: 'Vitamin D', say: 'vitamin d' }, { label: 'Calcium', say: 'calcium' }],
  },
  budget: { key: 'budget', ask: 'How much can you spend on groceries for yourself?', retry: 'An amount, like 1,500 a week or 6,000 a month.' },
  budgetPeriod: {
    key: 'budgetPeriod', ask: 'Is that a week or a month?', retry: 'Week or month?',
    choices: [{ label: 'A week', say: 'a week' }, { label: 'A month', say: 'a month' }],
  },
  clinical: {
    key: 'clinical', ask: 'Last one. Are you pregnant, breastfeeding, or on a diet a doctor manages, like for kidney disease or diabetes?', retry: 'Say no, or tell me which.',
    choices: [{ label: 'No', say: 'no' }, { label: 'Pregnant', say: 'pregnant' }, { label: 'Breastfeeding', say: 'breastfeeding' }, { label: 'Doctor-managed diet', say: 'doctor managed diet' }],
  },
};

const ORDER: QKey[] = ['age', 'sex', 'height', 'weight', 'occupation', 'movement', 'workouts', 'workoutDetails', 'diet', 'allergies', 'exclusions', 'goal', 'focus', 'budget', 'budgetPeriod', 'clinical'];

/** Is this question answered? */
export function isAnswered(s: ConvState, k: QKey): boolean {
  const e = s.e;
  switch (k) {
    case 'age': return !!e.ageYears;
    case 'sex': return !!e.sex;
    case 'height': return !!e.heightCm;
    case 'weight': return !!e.weightKg;
    case 'occupation': return !!e.occupation;
    case 'movement': return !!e.movement;
    case 'workouts': return !!e.workoutsPerWeek;
    case 'workoutDetails': return !e.workoutsPerWeek || e.workoutsPerWeek.value === 0 || (!!e.workoutMinutes && !!e.intensity);
    case 'diet': return !!e.dietPattern;
    case 'allergies': return !!e.allergies || !!e.noAllergies;
    case 'exclusions': return s.exclusionsDone || !!e.hardExclusions;
    case 'goal': return s.bodyGoal != null;
    case 'focus': return s.focus != null;
    case 'budget': return !!e.budgetInr;
    case 'budgetPeriod': return !e.budgetInr || !!e.budgetPeriod;
    case 'clinical': return !!e.clinicalFlags || !!e.noClinical;
  }
}

export function nextQuestion(s: ConvState): QKey | null {
  return ORDER.find((k) => !isAnswered(s, k)) ?? null;
}

/** Progress for the bar at the top: answered questions out of those that apply. */
export function progress(s: ConvState): { done: number; total: number } {
  const applies = ORDER.filter((k) => !(k === 'workoutDetails' && (!s.e.workoutsPerWeek || s.e.workoutsPerWeek.value === 0)) && k !== 'budgetPeriod');
  return { done: applies.filter((k) => isAnswered(s, k)).length, total: applies.length };
}

// ------------------------------------------------------------------ per-question readers

const NO = /^\s*(no+|nope|nah|none|nothing|not really|na|nahi|nahin|no thanks?|no,? nothing|nothing like that|i don'?t|not at all|never)\b/;
const has = (t: string, re: RegExp) => re.test(t);
const found = <T,>(value: T, evidence: string) => ({ value, evidence: evidence.trim().slice(0, 80) });

/** Small reader for the question just asked. Returns only what it is sure about. */
function readFor(k: QKey, raw: string): Partial<Extraction> & { bodyGoal?: BodyGoal; budgetFirst?: boolean; focus?: FocusNutrient[]; exclusionsDone?: boolean } {
  const t = normalise(raw);
  const n = /\b(\d+(?:\.\d+)?)\b/.exec(t);
  const num = n ? Number(n[1]) : null;
  switch (k) {
    case 'age':
      return num != null && num >= 10 && num <= 120 ? { ageYears: found(Math.round(num), raw) } : {};
    case 'sex':
      if (has(t, /\b(prefer not|rather not|don'?t want to say|skip)\b/)) return { sex: found('prefer_not_to_say' as const, raw) };
      if (has(t, /\b(female|woman|girl|lady)\b/)) return { sex: found('female' as const, raw) };
      if (has(t, /\b(male|man|boy|guy)\b/)) return { sex: found('male' as const, raw) };
      return {};
    case 'height': {
      const e = extractProfile(`my height is ${raw}`);
      if (e.heightCm) return { heightCm: e.heightCm };
      if (num != null && num >= 4 && num < 8) return { heightCm: found(Math.round(num * 30.48 * 10) / 10, raw) }; // "5.5" feet
      return {};
    }
    case 'weight': {
      const e = extractProfile(`I weigh ${raw}${num != null && !/kg|kilo|pound|lb/.test(t) ? ' kg' : ''}`);
      return e.weightKg ? { weightKg: e.weightKg } : {};
    }
    case 'occupation': {
      // "Retired teacher" describes today's day as retired, not as a teacher.
      if (has(t, /\b(retired|not working|unemployed|between jobs)\b/)) return { occupation: found('sedentary' as const, raw) };
      const e = extractProfile(raw);
      if (e.occupation) return { occupation: e.occupation };
      if (has(t, /\b(sit|sitting|computer|laptop|office|desk|study|studying|it job|software|remote|work from home|wfh|at home|designer|engineer|developer|programmer|accountant|bank|banker|manager|analyst|writer|consultant|clerk|receptionist|call cent(?:re|er)|driver|drive a cab|cab|auto|lawyer|teacher online|admin)\b/)) return { occupation: found('sedentary' as const, raw) };
      if (has(t, /\b(homemaker|housewife|house work|housework|teacher|shop|retail|some (?:standing|walking))\b/)) return { occupation: found('light' as const, raw) };
      if (has(t, /\b(on my feet|standing all day|nurse|waiter|delivery|sales|walk(?:ing)? a lot at work)\b/)) return { occupation: found('moderate' as const, raw) };
      if (has(t, /\b(labou?r|construction|farm|loading|lifting|heavy|physical work|manual)\b/)) return { occupation: found('heavy' as const, raw) };
      return {};
    }
    case 'movement': {
      // A step count is read directly ("more than 10,000" counts as over 10,000).
      const e = extractProfile(num != null && num >= 500 ? '' : raw);
      if (e.movement) return { movement: e.movement };
      if (num != null && num >= 500) {
        const above = has(t, /\b(more than|over|above|at least)\b/);
        return { movement: found(num < 5000 ? ('low' as const) : num < 10000 || (num === 10000 && !above) ? ('medium' as const) : ('high' as const), raw) };
      }
      if (has(t, /\b(not much|very little|little|hardly|barely|rarely|don'?t walk|no walking|less|very less|zero|none)\b/) || NO.test(t)) return { movement: found('low' as const, raw) };
      if (has(t, /\b(a lot|lots|loads|plenty|very active|all day|too much|very much|so much|a ton)\b/)) return { movement: found('high' as const, raw) };
      if (has(t, /\b(some|a bit|fair|moderate|average|normal|okay|ok)\b/)) return { movement: found('medium' as const, raw) };
      return {};
    }
    case 'workouts': {
      const e = extractProfile(raw);
      const out: Partial<Extraction> = {};
      if (e.workoutsPerWeek) Object.assign(out, { workoutsPerWeek: e.workoutsPerWeek });
      else if (NO.test(t) || has(t, /\b(don'?t|do not|never) (work ?out|exercise|go to (?:the )?gym)\b/)) return { workoutsPerWeek: found(0, raw), workoutType: found('none' as const, raw) };
      else if (num != null && num >= 1 && num <= 14) out.workoutsPerWeek = found(Math.round(num), raw);
      else if (num === 0 || has(t, /\b(no time|nil|zero)\b/)) return { workoutsPerWeek: found(0, raw), workoutType: found('none' as const, raw) };
      else if (has(t, /\b(weekends?)\b/)) out.workoutsPerWeek = found(2, raw);
      else if (has(t, /\b(sundays?|saturdays?|once a week)\b/)) out.workoutsPerWeek = found(1, raw);
      else if (has(t, /\b(once|twice|thrice)\b/)) out.workoutsPerWeek = found(/once/.test(t) ? 1 : /twice/.test(t) ? 2 : 3, raw);
      else if (has(t, /\b(daily|every day|everyday)\b/)) out.workoutsPerWeek = found(6, raw);
      if (e.workoutMinutes) out.workoutMinutes = e.workoutMinutes;
      if (e.intensity) out.intensity = e.intensity;
      if (e.workoutType) out.workoutType = e.workoutType;
      return out;
    }
    case 'workoutDetails': {
      const e = extractProfile(`I work out for ${raw}`);
      const out: Partial<Extraction> = {};
      if (e.workoutMinutes) out.workoutMinutes = e.workoutMinutes;
      else if (num != null && num >= 10 && num <= 240) out.workoutMinutes = found(Math.round(num), raw);
      else if (num != null && num >= 1 && num <= 3 && /hour|hr/.test(t)) out.workoutMinutes = found(Math.round(num * 60), raw);
      if (e.intensity) out.intensity = e.intensity;
      else if (has(t, /\b(light|easy|slow|gentle|yoga|walk)\b/)) out.intensity = found('light' as const, raw);
      else if (has(t, /\b(moderate|medium|normal|average|okay)\b/)) out.intensity = found('moderate' as const, raw);
      else if (has(t, /\b(intense|hard|heavy|vigorous|high|tough)\b/)) out.intensity = found('vigorous' as const, raw);
      return out;
    }
    case 'diet': {
      // Which food groups are said without "no / not / don't" just before them.
      const eats = (re: RegExp) => {
        const m = re.exec(t);
        return !!m && !/\b(no|not|never|without|don'?t|except)\s+(?:\w+\s+)?$/.test(t.slice(Math.max(0, m.index - 16), m.index));
      };
      const meat = eats(/\b(chicken|mutton|meat|fish|prawns?|beef|pork|non[ -]?veg)/);
      const egg = eats(/\beggs?\b/);
      if (has(t, /\bvegan\b/)) return { dietPattern: found('vegan' as const, raw) };
      if (meat) return { dietPattern: found('non_vegetarian' as const, raw) };
      if (egg && has(t, /\b(no meat|no non[ -]?veg|veg|vegetarian|ok|okay|fine)\b/)) return { dietPattern: found('eggetarian' as const, raw) };
      const e = extractProfile(raw);
      if (e.dietPattern) return { dietPattern: e.dietPattern };
      if (has(t, /\begg/)) return { dietPattern: found('eggetarian' as const, raw) };
      if (has(t, /\b(veg|veggie|pure veg|jain)\b/)) return { dietPattern: found('vegetarian' as const, raw) };
      if (has(t, /\b(everything|anything|chicken|mutton|fish|meat|non)\b/)) return { dietPattern: found('non_vegetarian' as const, raw) };
      return {};
    }
    case 'allergies': {
      const e = extractProfile(raw);
      if (e.allergies) return { allergies: e.allergies };
      // An explicit "no" to the allergy question is an answer, not silence.
      if (e.noAllergies || NO.test(t)) return { noAllergies: found(true as const, raw) };
      const named = extractProfile(`I am allergic to ${raw}`);
      return named.allergies ? { allergies: named.allergies } : {};
    }
    case 'exclusions': {
      if (NO.test(t) || has(t, /\b(i eat everything|anything is fine|all good)\b/)) return { exclusionsDone: true };
      const e = extractProfile(`I never eat ${raw}`);
      if (e.hardExclusions) return { hardExclusions: e.hardExclusions, exclusionsDone: true };
      // A food we don't use in any recipe can't appear anyway: accept the answer and move on,
      // unless it is clearly an answer to something else (a goal, or an amount of money).
      if (readFor('goal', raw).bodyGoal || /\d/.test(t)) return {};
      return t.trim().length >= 3 ? { exclusionsDone: true } : {};
    }
    case 'goal': {
      if (has(t, /\b(lose|loss|cut|cutting|fat|slim|reduce|lighter|weight down|drop|belly|tummy|trim)\b/)) return { bodyGoal: 'lose' };
      if (has(t, /\b(muscle|gain|bulk|build|bigger|stronger|bodybuilding|tone|toned|put on)\b/)) return { bodyGoal: 'gain' };
      if (has(t, /\b(save money|cheap|budget|spend less)\b/)) return { bodyGoal: 'maintain', budgetFirst: true };
      if (has(t, /\b(same|maintain|stay|keep|healthy|balanced|fit|as i am|nothing special|just eat well)\b/)) return { bodyGoal: 'maintain' };
      return {};
    }
    case 'focus': {
      const picked: FocusNutrient[] = [];
      if (has(t, /\b(iron|anaemi[ac]|anemi[ac]|ha?emoglobin|hb)\b/)) picked.push('iron');
      if (has(t, /\bcalcium\b/)) picked.push('calcium');
      if (has(t, /\b(b ?12|b twelve|cobalamin)\b/)) picked.push('b12');
      if (has(t, /\b(vitamin d|vit d|d ?3|vitamin d3)\b/)) picked.push('vitamin_d');
      if (has(t, /\b(folate|folic)\b/)) picked.push('folate');
      if (has(t, /\bzinc\b/)) picked.push('zinc');
      if (picked.length) return { focus: picked };
      return NO.test(t) || has(t, /\b(don'?t know|not sure|never tested|no idea)\b/) ? { focus: [] } : {};
    }
    case 'budget': {
      const e = extractProfile(`my budget is ${raw}`);
      const out: Partial<Extraction> = {};
      if (e.budgetInr) out.budgetInr = e.budgetInr;
      else if (num != null && num >= 100 && num <= 100000) out.budgetInr = found(Math.round(num), raw);
      if (e.budgetPeriod) out.budgetPeriod = e.budgetPeriod;
      else if (has(t, /\b(week|weekly)\b/)) out.budgetPeriod = found('weekly' as const, raw);
      else if (has(t, /\b(month|monthly)\b/)) out.budgetPeriod = found('monthly' as const, raw);
      return out;
    }
    case 'budgetPeriod':
      if (has(t, /\b(week|weekly)\b/)) return { budgetPeriod: found('weekly' as const, raw) };
      if (has(t, /\b(month|monthly)\b/)) return { budgetPeriod: found('monthly' as const, raw) };
      return {};
    case 'clinical': {
      const e = extractProfile(raw);
      if (e.clinicalFlags) return { clinicalFlags: e.clinicalFlags };
      if (e.noClinical || NO.test(t)) return { noClinical: found(true as const, raw) };
      if (has(t, /\b(doctor|medical|diet chart|dietician|dietitian|yes|kidney|diabet|sugar)\b/)) return { clinicalFlags: found(['other_medical_condition'] as ClinicalFlag[], raw) };
      return {};
    }
  }
}

/** Fields the full reader may fill from any answer. Safety fields are left to their own question. */
const FREE_FIELDS: (keyof Extraction)[] = ['ageYears', 'sex', 'heightCm', 'weightKg', 'occupation', 'movement', 'workoutsPerWeek', 'workoutMinutes', 'workoutType', 'intensity', 'dietPattern', 'allergies', 'noAllergies', 'hardExclusions', 'dislikes', 'budgetInr', 'budgetPeriod', 'clinicalFlags', 'noClinical'];

export interface TurnResult {
  state: ConvState;
  /** Short line to say back, e.g. "26, got it." null = not understood. */
  understood: string | null;
  /** Other questions this answer also filled, e.g. ['weight', 'diet']. */
  alsoFilled: QKey[];
}

export function answer(s: ConvState, k: QKey, text: string, extra?: Extraction): TurnResult {
  const before = ORDER.filter((q) => isAnswered(s, q));
  const next: ConvState = { ...s, e: { ...s.e }, misses: { ...s.misses } };
  // 1. Full reader on the whole answer (plus an optional AI reading that already passed its checks).
  for (const src of [extractProfile(text), ...(extra ? [extra] : [])]) {
    for (const f of FREE_FIELDS) if (src[f] !== undefined) (next.e as unknown as Record<string, unknown>)[f] = src[f];
    if (src.goal && next.bodyGoal == null) next.bodyGoal = src.goal.value === 'weight_management' ? 'lose' : src.goal.value === 'muscle_fitness' ? 'gain' : 'maintain';
  }
  // 1b. Walking said in passing inside a longer answer ("...not much walking, gym 3 times...").
  if (k !== 'movement' && !next.e.movement) {
    const clause = text.split(/[,.;]| and /i).find((c) => /\b(walk|walking|steps)\b/i.test(c));
    if (clause) {
      const m = readFor('movement', clause);
      if (m.movement) next.e.movement = m.movement;
    }
  }
  // 2. Small reader for this question.
  const scoped = readFor(k, text);
  const { bodyGoal, budgetFirst, focus, exclusionsDone, ...fields } = scoped;
  Object.assign(next.e, fields);
  if (bodyGoal) next.bodyGoal = bodyGoal;
  if (budgetFirst) next.budgetFirst = true;
  if (focus) next.focus = focus;
  if (exclusionsDone) next.exclusionsDone = true;
  // A clear "no" overrides an earlier "yes" for the same question, and the other way round.
  if (k === 'allergies' && fields.noAllergies && !fields.allergies) delete next.e.allergies;
  if (k === 'clinical' && fields.noClinical && !fields.clinicalFlags) delete next.e.clinicalFlags;
  if (k === 'clinical' && fields.clinicalFlags) delete next.e.noClinical;

  if (!isAnswered(next, k)) {
    // The answer may belong to another question ("build muscle" while asked about foods).
    // Only goal and budget are tried: a bare "no" must never answer allergies or health.
    if (k !== 'goal' && next.bodyGoal == null) {
      const g = readFor('goal', text);
      if (g.bodyGoal) {
        next.bodyGoal = g.bodyGoal;
        if (g.budgetFirst) next.budgetFirst = true;
      }
    }
    if (k !== 'budget' && !next.e.budgetInr && /\b(rs|rupees?|budget|week|month)\b|₹/i.test(text)) {
      const bg = readFor('budget', text);
      if (bg.budgetInr) Object.assign(next.e, bg);
    }
    next.misses[k] = (next.misses[k] ?? 0) + 1;
    return { state: next, understood: null, alsoFilled: ORDER.filter((q) => q !== k && !before.includes(q) && isAnswered(next, q)) };
  }
  const alsoFilled = ORDER.filter((q) => q !== k && !before.includes(q) && isAnswered(next, q));
  return { state: next, understood: echo(next, k), alsoFilled };
}

/** "Clear" an answer so the question is asked again (used by "change" in the summary). */
export function reopen(s: ConvState, k: QKey): ConvState {
  const e = { ...s.e };
  const n: ConvState = { ...s, e, misses: { ...s.misses, [k]: 0 } };
  const drop = (...f: (keyof Extraction)[]) => f.forEach((x) => delete (e as unknown as Record<string, unknown>)[x]);
  switch (k) {
    case 'age': drop('ageYears'); break;
    case 'sex': drop('sex'); break;
    case 'height': drop('heightCm'); break;
    case 'weight': drop('weightKg'); break;
    case 'occupation': drop('occupation'); break;
    case 'movement': drop('movement'); break;
    case 'workouts': case 'workoutDetails': drop('workoutsPerWeek', 'workoutMinutes', 'intensity', 'workoutType'); break;
    case 'diet': drop('dietPattern'); break;
    case 'allergies': drop('allergies', 'noAllergies'); break;
    case 'exclusions': drop('hardExclusions'); n.exclusionsDone = false; break;
    case 'goal': n.bodyGoal = null; n.budgetFirst = false; break;
    case 'focus': n.focus = null; break;
    case 'budget': case 'budgetPeriod': drop('budgetInr', 'budgetPeriod'); break;
    case 'clinical': drop('clinicalFlags', 'noClinical'); break;
  }
  return n;
}

const WORK = { sedentary: 'mostly sitting', light: 'some walking', moderate: 'on your feet', heavy: 'physical work' } as const;
const WALK = { low: 'not much walking', medium: 'a fair bit of walking', high: 'lots of walking' } as const;

/** One-line value for a question, used both for the spoken echo and the summary list. */
export function valueOf(s: ConvState, k: QKey, names: { food: (id: string) => string }): string | null {
  const e = s.e;
  switch (k) {
    case 'age': return e.ageYears ? `${e.ageYears.value} years` : null;
    case 'sex': return e.sex ? (e.sex.value === 'prefer_not_to_say' ? 'Prefer not to say' : e.sex.value === 'male' ? 'Male' : 'Female') : null;
    case 'height': return e.heightCm ? `${Math.round(e.heightCm.value)} cm` : null;
    case 'weight': return e.weightKg ? `${e.weightKg.value} kg` : null;
    case 'occupation': return e.occupation ? cap(WORK[e.occupation.value]) : null;
    case 'movement': return e.movement ? cap(WALK[e.movement.value]) : null;
    case 'workouts': return e.workoutsPerWeek ? (e.workoutsPerWeek.value === 0 ? 'No workouts' : `${e.workoutsPerWeek.value} a week`) : null;
    case 'workoutDetails': return e.workoutMinutes && e.intensity ? `${e.workoutMinutes.value} min, ${e.intensity.value === 'vigorous' ? 'intense' : e.intensity.value}` : null;
    case 'diet': return e.dietPattern ? DIET_LABELS[e.dietPattern.value] : null;
    case 'allergies': return e.allergies ? e.allergies.value.map((a) => ALLERGEN_LABELS[a]).join(', ') : e.noAllergies ? 'None' : null;
    case 'exclusions': return e.hardExclusions ? e.hardExclusions.value.map(names.food).join(', ') : s.exclusionsDone ? 'Nothing' : null;
    case 'goal': return s.bodyGoal ? BODY_GOAL_LABEL[s.bodyGoal] + (s.budgetFirst ? ', on a tight budget' : '') : null;
    case 'focus': return s.focus ? (s.focus.length ? s.focus.map((f) => FOCUS_LABEL[f]).join(', ') : 'Nothing') : null;
    case 'budget': return e.budgetInr ? `₹${e.budgetInr.value.toLocaleString('en-IN')}${e.budgetPeriod ? (e.budgetPeriod.value === 'weekly' ? ' a week' : ' a month') : ''}` : null;
    case 'budgetPeriod': return e.budgetPeriod ? (e.budgetPeriod.value === 'weekly' ? 'A week' : 'A month') : null;
    case 'clinical': return e.clinicalFlags ? 'Needs a doctor-managed diet' : e.noClinical ? 'None' : null;
  }
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

function echo(s: ConvState, k: QKey): string {
  const v = valueOf(s, k, { food: (id) => id.replace(/_/g, ' ') });
  if (k === 'clinical' && s.e.clinicalFlags) return 'Thanks for telling me.';
  if (k === 'allergies' && s.e.noAllergies && !s.e.allergies) return 'No allergies, noted.';
  if (k === 'focus' && s.focus?.length === 0) return 'Okay.';
  if (k === 'exclusions' && !s.e.hardExclusions) return "Okay, that won't be in your meals.";
  return v ? `${v}, got it.` : 'Got it.';
}

/** Rows for the summary, in question order, skipping ones that don't apply. */
export function summaryRows(s: ConvState, names: { food: (id: string) => string }): { key: QKey; label: string; value: string }[] {
  const LABEL: Record<QKey, string> = {
    age: 'Age', sex: 'Sex', height: 'Height', weight: 'Weight', occupation: 'Your day', movement: 'Walking', workouts: 'Workouts', workoutDetails: 'Sessions',
    diet: 'Food', allergies: 'Allergies', exclusions: 'Never include', goal: 'Goal', focus: 'More of', budget: 'Budget', budgetPeriod: 'Budget', clinical: 'Health',
  };
  const rows: { key: QKey; label: string; value: string }[] = [];
  for (const k of ORDER) {
    const value = k === 'budgetPeriod' ? null : valueOf(s, k, names);
    if (value != null) rows.push({ key: k, label: LABEL[k], value });
  }
  return rows;
}

/** Final profile: everything heard, applied to the saved profile. */
export function toBundle(s: ConvState, b: ProfileBundle, now: Date = new Date()): ProfileBundle {
  const n = applyExtraction(b, s.e, now);
  if (s.bodyGoal) {
    n.goals.bodyGoal = s.bodyGoal;
    n.goals.goal = s.budgetFirst ? 'budget_first' : s.bodyGoal === 'lose' ? 'weight_management' : s.bodyGoal === 'gain' ? 'muscle_fitness' : 'general';
  }
  if (s.focus) n.goals.focusNutrients = s.focus;
  return n;
}
