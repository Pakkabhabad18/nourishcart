// OPTIONAL LLM extractor (off by default). The rule-based extractor in extract.ts is what
// the app uses. This adapter exists so an LLM can be evaluated on exactly the same test set
// and only switched on if it beats the rules without any critical error.
//
// Three safety layers sit between the model and the profile:
//  1. A strict system prompt and a fixed JSON schema.
//  2. sanitiseLlmOutput(): drops anything outside the allowed values, and drops any field
//     whose quoted evidence does not appear in what the person actually said (stops
//     invented values).
//  3. mergeWithRules(): the model can never make the profile less safe than the rule
//     parser: stricter diet wins, allergies and health flags are unioned.
// Privacy: never send real profile text to a free/unpaid LLM API (PRD). Use a local model
// or a paid API with a no-retention agreement and the person's consent.
import type { Allergen, ClinicalFlag, DietPattern, Goal, Intensity, MovementBand, OccupationClass, Sex } from '../types.ts';
import { normalise, type Extraction, type Found } from './extract.ts';

export const LLM_PROMPT_VERSION = 'intake-prompt-1.0.0';

export const SYSTEM_PROMPT = `You extract facts for a nutrition-planning profile from what ONE adult says about THEMSELF.

Rules:
- Only extract facts the speaker states about themself. Ignore facts about other people (e.g. "my wife is vegetarian").
- Never guess. If a fact is not stated, omit the field. Silence is not "none": set "noAllergies" or "noClinical" only if the speaker explicitly says they have no allergies / no health conditions.
- For every field you return, include "evidence": the exact words from the input that support it (copied verbatim, lower case is fine).
- If the speaker gives conflicting diet statements, return the STRICTER pattern (vegan > vegetarian > eggetarian > non_vegetarian).
- Treat "not X" / "no X" as negation (e.g. "not diabetic" is NOT a health condition).
- Output JSON only, matching the schema. No commentary.

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
      if (f.value === true) set(k, { value: true, evidence: ev } as never);
    } else dropped.push({ field: k, reason: 'unknown field' });
  }
  return { extraction: out, dropped };
}

const STRICT: DietPattern[] = ['vegan', 'vegetarian', 'eggetarian', 'non_vegetarian'];

/** Layer 3: the model can add information but never make the result less safe than the rules. */
export function mergeWithRules(rules: Extraction, llm: Extraction): Extraction {
  const m: Extraction = { ...llm, ...rules, warnings: [...rules.warnings], unknownFoods: rules.unknownFoods };
  // fill gaps the rules left
  for (const k of Object.keys(llm) as (keyof Extraction)[]) if (m[k] === undefined) (m as unknown as Record<string, unknown>)[k] = llm[k];
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
