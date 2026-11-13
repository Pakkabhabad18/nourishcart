// AI (LLM) reader for "describe yourself". Opt-in per person in the quick setup screen; the
// rule reader in extract.ts always runs too and is the fallback. The model is called from the
// Vercel function api/intake.js; this file holds the prompt and the checks applied to the
// model's answer in the browser. Scored by `npm run eval:llm` on the same labelled sets.
//
// Three safety layers sit between the model and the profile:
//  1. A strict system prompt and a fixed JSON schema.
//  2. sanitiseLlmOutput(): drops anything outside the allowed values, and drops any field
//     whose quoted evidence does not appear in what the person actually said (stops
//     invented values).
//  3. mergeWithRules(): the model can never make the profile less safe than the rule
//     parser: stricter diet wins, allergies and health flags are unioned.
// Privacy: only the description text is sent, only after the person ticks the AI option, and
// only to a provider that does not train on API data (Groq, with Zero Data Retention on).
import type { Allergen, ClinicalFlag, DietPattern, Goal, Intensity, MovementBand, OccupationClass, Sex } from '../types.ts';
import { normalise, type Extraction, type Found } from './extract.ts';

export const LLM_PROMPT_VERSION = 'intake-prompt-1.1.0';

export const SYSTEM_PROMPT = `You extract facts for a nutrition-planning profile from what ONE adult says about THEMSELF.

Rules:
- Only extract facts the speaker states about themself. Ignore facts about other people (e.g. "my wife is vegetarian").
- Never guess. If a fact is not stated, omit the field. Silence is not "none": set "noAllergies" or "noClinical" only if the speaker explicitly says they have no allergies / no health conditions.
- For every field you return, include "evidence": the exact words from the input that support it (copied verbatim, lower case is fine).
- If the speaker gives conflicting diet statements, return the STRICTER pattern (vegan > vegetarian > eggetarian > non_vegetarian).
- Treat "not X" / "no X" as negation (e.g. "not diabetic" is NOT a health condition).
- Output JSON only, matching the schema. No commentary.
- The speaker may mix English with Hindi or Telugu, or speak without punctuation. Read number words ("thirty two") as numbers.

How to fill fields:
- heightCm: convert feet and inches (1 ft = 30.48 cm, 1 in = 2.54 cm). "five eleven" or "5'11" means 5 ft 11 in. weightKg: convert pounds (1 lb = 0.4536 kg).
- occupation (their usual working day, not workouts): desk, office, remote/IT work, driving, studying = sedentary; teaching, shop or lab work = light; on their feet most of the day, nursing, heavy housework = moderate; construction, farming, loading, manual labour = heavy.
- movement: ONLY from what they say about daily steps or walking outside workouts: under 5,000 steps = low, 5,000-10,000 or walking daily = medium, over 10,000 = high. Never infer it from workouts or from "I don't exercise".
- workoutsPerWeek: planned exercise sessions per week; "every day" = 7. If they say they don't exercise or work out, set it to 0.
- intensity: easy/light = light; moderate = moderate; hard, intense, heavy lifting = vigorous.
- dietPattern: eats meat, chicken or fish (including pescatarian) = non_vegetarian; eggs but no meat or fish = eggetarian; no meat, fish or eggs = vegetarian; no animal products = vegan.
- allergies: include intolerances (lactose intolerant = dairy; wheat makes them sick = gluten; cashew or almond = tree_nut; prawns or shrimp = shellfish).
- goal: build muscle, strength, bulk, tone, sports training = muscle_fitness; lose or manage weight = weight_management; cheapest possible = budget_first; eat healthier or stay healthy = general.
- budgetPeriod: weekly or monthly as stated (e.g. "a week", "per month", "mahine", "nelaki"). If they correct an amount, use the corrected one.

Allowed values:
sex: male | female | prefer_not_to_say
occupation: sedentary | light | moderate | heavy
movement: low | medium | high
intensity: light | moderate | vigorous
dietPattern: vegan | vegetarian | eggetarian | non_vegetarian
allergies: dairy | egg | peanut | tree_nut | gluten | soy | fish | sesame | shellfish
goal: general | muscle_fitness | weight_management | budget_first
budgetPeriod: weekly | monthly
clinicalFlags: pregnancy | lactation | eating_disorder | kidney_disease | diabetes_clinical_diet | bariatric_surgery | other_medical_condition

Schema (every field optional):
{"ageYears":{"value":number,"evidence":string},"sex":{...},"heightCm":{...},"weightKg":{...},"occupation":{...},"movement":{...},
 "workoutsPerWeek":{...},"workoutMinutes":{...},"intensity":{...},"dietPattern":{...},"allergies":{"value":string[],"evidence":string},
 "noAllergies":{"value":true,"evidence":string},"goal":{...},"budgetInr":{...},"budgetPeriod":{...},"clinicalFlags":{"value":string[],"evidence":string},
 "noClinical":{"value":true,"evidence":string}}`;

export function buildMessages(userText: string) {
  return [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userText },
  ];
}

const ENUMS = {
  sex: ['male', 'female', 'prefer_not_to_say'],
  occupation: ['sedentary', 'light', 'moderate', 'heavy'],
  movement: ['low', 'medium', 'high'],
  intensity: ['light', 'moderate', 'vigorous'],
  dietPattern: ['vegan', 'vegetarian', 'eggetarian', 'non_vegetarian'],
  goal: ['general', 'muscle_fitness', 'weight_management', 'budget_first'],
  budgetPeriod: ['weekly', 'monthly'],
} as const;
const ALLERGENS: Allergen[] = ['dairy', 'egg', 'peanut', 'tree_nut', 'gluten', 'soy', 'fish', 'sesame', 'shellfish'];
const FLAGS: ClinicalFlag[] = ['pregnancy', 'lactation', 'eating_disorder', 'kidney_disease', 'diabetes_clinical_diet', 'bariatric_surgery', 'other_medical_condition'];
const RANGES: Record<string, [number, number]> = { ageYears: [10, 110], heightCm: [100, 250], weightKg: [25, 300], workoutsPerWeek: [0, 14], workoutMinutes: [0, 240], budgetInr: [100, 1_000_000] };

// Wording that counts as a general "none". Negation word plus a general noun, either order
// ("no health problems", "health problems emi levu", "nothing like that", "koi allergy nahi").
const NEG = String.raw`\b(no|none|nothing|not any|don't have any|do not have any|never had any|zero|levu|ledu|nahi|nahin|illa)\b`;
const NO_ALLERGY_WORDS = /allerg|intoleran/;
const NO_CONDITION_WORDS = new RegExp(String.raw`(${NEG}.*\b(health|medical|condition|conditions|issue|issues|problem|problems|illness|illnesses|disease|diseases|like that)\b)|(\b(health|medical|condition|conditions|issue|issues|problem|problems|illness|disease)\b.*${NEG})|\bperfectly healthy\b|\bnothing medical\b`);

export interface SanitiseReport {
  extraction: Extraction;
  dropped: { field: string; reason: string }[];
}

/** Layer 2: keep only well-formed fields whose evidence is really in the input text. */
export function sanitiseLlmOutput(raw: string, userText: string): SanitiseReport {
  const dropped: SanitiseReport['dropped'] = [];
  const out: Extraction = { warnings: [], unknownFoods: [] };
  let obj: Record<string, unknown>;
  try {
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    obj = JSON.parse(json);
  } catch {
    return { extraction: out, dropped: [{ field: '*', reason: 'not valid JSON' }] };
  }
  const text = normalise(userText);
  const hasEvidence = (ev: unknown) => typeof ev === 'string' && ev.trim().length > 0 && text.includes(normalise(ev).trim());
  const set = <K extends keyof Extraction>(k: K, v: Extraction[K]) => ((out as unknown as Record<string, unknown>)[k] = v);
  for (const [k, val] of Object.entries(obj)) {
    const f = val as { value?: unknown; evidence?: unknown } | null;
    if (!f || typeof f !== 'object' || !('value' in f)) {
      dropped.push({ field: k, reason: 'missing value' });
      continue;
    }
    if (!hasEvidence(f.evidence)) {
      dropped.push({ field: k, reason: 'evidence not found in what the person said' });
      continue;
    }
    const ev = String(f.evidence);
    if (k in RANGES) {
      const n = Number(f.value);
      const [lo, hi] = RANGES[k];
      if (Number.isFinite(n) && n >= lo && n <= hi) set(k as keyof Extraction, { value: n, evidence: ev } as never);
      else dropped.push({ field: k, reason: 'out of range' });
    } else if (k in ENUMS) {
      if ((ENUMS as Record<string, readonly string[]>)[k].includes(String(f.value))) set(k as keyof Extraction, { value: f.value, evidence: ev } as never);
      else dropped.push({ field: k, reason: 'value not allowed' });
    } else if (k === 'allergies' || k === 'clinicalFlags') {
      const allowed = (k === 'allergies' ? ALLERGENS : FLAGS) as string[];
      const arr = Array.isArray(f.value) ? f.value.filter((x) => allowed.includes(String(x))) : [];
      if (arr.length) set(k, { value: arr, evidence: ev } as never);
      else dropped.push({ field: k, reason: 'no allowed values' });
    } else if (k === 'noAllergies' || k === 'noClinical') {
      // A "none" claim is only accepted when the quoted words say it in general terms.
      // "not pregnant and not diabetic" denies two conditions; it is not "no conditions".
      const general = k === 'noAllergies' ? NO_ALLERGY_WORDS.test(normalise(ev)) : NO_CONDITION_WORDS.test(normalise(ev));
      if (f.value !== true) dropped.push({ field: k, reason: 'value not allowed' });
      else if (!general) dropped.push({ field: k, reason: 'quoted words deny specific items, not all of them' });
      else set(k, { value: true, evidence: ev } as never);
    } else dropped.push({ field: k, reason: 'unknown field' });
  }
  return { extraction: out, dropped };
}

const STRICT: DietPattern[] = ['vegan', 'vegetarian', 'eggetarian', 'non_vegetarian'];

/** Layer 3: the model can add information but never make the result less safe than the rules. */
export function mergeWithRules(rules: Extraction, llm: Extraction): Extraction {
  // Plain facts (age, height, budget, job...): when both readers found a value, the AI's wins,
  // because it follows corrections ("30... sorry, 33") and context that patterns miss.
  // Safety facts (diet, allergies, conditions, "none" claims) are handled below and can only
  // ever end up stricter than either reader on its own.
  const m: Extraction = { ...rules, ...llm, warnings: [...rules.warnings], unknownFoods: rules.unknownFoods };
  // exclusions and dislikes come from the rules only (the AI doesn't map foods to our list)
  if (rules.hardExclusions) m.hardExclusions = rules.hardExclusions;
  if (rules.dislikes) m.dislikes = rules.dislikes;
  m.dietPattern = rules.dietPattern ?? llm.dietPattern;
  delete m.noAllergies;
  delete m.noClinical;
  // diet: stricter of the two
  if (rules.dietPattern && llm.dietPattern && STRICT.indexOf(llm.dietPattern.value) < STRICT.indexOf(rules.dietPattern.value)) {
    m.dietPattern = llm.dietPattern;
    m.warnings.push('Two readings of your food pattern disagreed; we used the stricter one.');
  }
  // allergies and health flags: union; a stated allergy cancels "no allergies"
  const all = [...new Set([...(rules.allergies?.value ?? []), ...(llm.allergies?.value ?? [])])];
  if (all.length) {
    m.allergies = { value: all, evidence: [rules.allergies?.evidence, llm.allergies?.evidence].filter(Boolean).join('; ') };
    delete m.noAllergies;
  }
  const flags = [...new Set([...(rules.clinicalFlags?.value ?? []), ...(llm.clinicalFlags?.value ?? [])])];
  if (flags.length) {
    m.clinicalFlags = { value: flags, evidence: [rules.clinicalFlags?.evidence, llm.clinicalFlags?.evidence].filter(Boolean).join('; ') };
    delete m.noClinical;
  }
  // "none" assertions stand only when neither reading found something
  if (all.length === 0 && (rules.noAllergies || llm.noAllergies)) m.noAllergies = rules.noAllergies ?? llm.noAllergies;
  if (flags.length === 0 && (rules.noClinical || llm.noClinical)) m.noClinical = rules.noClinical ?? llm.noClinical;
  return m;
}

export type { Found, Sex, OccupationClass, MovementBand, Intensity, Goal };
