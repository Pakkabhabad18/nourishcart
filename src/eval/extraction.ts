// Scores the profile extractor against the labelled utterances.
// Error types:
//   correct        the field matches the label
//   missed         label has a value, extractor left it empty -> the app asks a follow-up (safe)
//   wrong          extractor filled a different value
//   hallucinated   label is empty, extractor filled something
// Critical (safety) errors are separated out and must be zero:
//   - diet less strict than the label (e.g. vegetarian read as eggetarian)
//   - a labelled allergy missing while the extractor claims allergies are settled
//   - a labelled health condition missed while the extractor claims "no conditions"
//   - "no allergies" / "no conditions" asserted when the person never said so
import { extractProfile, type Extraction } from '../domain/intake/extract.ts';
import type { DietPattern } from '../domain/types.ts';
import { UTTERANCES, type UtteranceGold } from './datasets/utterances.ts';

type Field = keyof UtteranceGold;
export const SCORED_FIELDS: Field[] = ['ageYears', 'sex', 'heightCm', 'weightKg', 'occupation', 'movement', 'workoutsPerWeek', 'workoutMinutes', 'intensity', 'dietPattern', 'allergies', 'noAllergies', 'hardExclusions', 'goal', 'budgetInr', 'budgetPeriod', 'clinicalFlags', 'noClinical'];
const STRICTNESS: DietPattern[] = ['vegan', 'vegetarian', 'eggetarian', 'non_vegetarian'];

export interface FieldScore {
  correct: number;
  missed: number;
  wrong: number;
  hallucinated: number;
  precision: number;
  recall: number;
}

export interface ExtractionCaseResult {
  id: string;
  style: string;
  errors: { field: string; kind: 'missed' | 'wrong' | 'hallucinated'; expected: unknown; got: unknown }[];
  critical: string[];
  safeOverRestriction: string[];
}

export interface ExtractionReport {
  cases: number;
  fields: Record<string, FieldScore>;
  overall: { correct: number; missed: number; wrong: number; hallucinated: number; precision: number; recall: number; f1: number };
  criticalErrors: number;
  safeOverRestrictions: number;
  perCase: ExtractionCaseResult[];
}

function valueOf(e: Extraction, f: Field): unknown {
  const x = (e as unknown as Record<string, { value: unknown } | undefined>)[f];
  return x?.value;
}

function same(f: Field, a: unknown, b: unknown): boolean {
  if (f === 'heightCm') return Math.abs((a as number) - (b as number)) <= 1.5;
  if (f === 'weightKg') return Math.abs((a as number) - (b as number)) <= 0.5;
  if (Array.isArray(a) && Array.isArray(b)) return [...a].sort().join() === [...b].sort().join();
  return a === b;
}

export function runExtractionEval(today = new Date('2026-11-13T00:00:00Z')): ExtractionReport {
  const fields: Record<string, FieldScore> = Object.fromEntries(SCORED_FIELDS.map((f) => [f, { correct: 0, missed: 0, wrong: 0, hallucinated: 0, precision: 0, recall: 0 }]));
  const perCase: ExtractionCaseResult[] = [];
  let critical = 0;
  let safeOver = 0;
  for (const c of UTTERANCES) {
    const e = extractProfile(c.text, today);
    const res: ExtractionCaseResult = { id: c.id, style: c.style, errors: [], critical: [], safeOverRestriction: [] };
    for (const f of SCORED_FIELDS) {
      const gold = c.gold[f];
      const got = valueOf(e, f);
      const s = fields[f];
      if (gold === undefined && got === undefined) continue;
      if (gold !== undefined && got === undefined) {
        s.missed++;
        res.errors.push({ field: f, kind: 'missed', expected: gold, got });
      } else if (gold === undefined) {
        s.hallucinated++;
        res.errors.push({ field: f, kind: 'hallucinated', expected: gold, got });
      } else if (same(f, gold, got)) s.correct++;
      else {
        s.wrong++;
        res.errors.push({ field: f, kind: 'wrong', expected: gold, got });
      }
    }
    // ---- safety classification
    const gDiet = c.gold.dietPattern;
    const pDiet = e.dietPattern?.value;
    if (pDiet && gDiet && STRICTNESS.indexOf(pDiet) > STRICTNESS.indexOf(gDiet)) res.critical.push(`diet read as ${pDiet}, stated ${gDiet}`);
    if (pDiet && gDiet && STRICTNESS.indexOf(pDiet) < STRICTNESS.indexOf(gDiet)) res.safeOverRestriction.push(`diet read as ${pDiet}, stated ${gDiet}`);
    if (pDiet && !gDiet && pDiet === 'non_vegetarian') res.critical.push('diet assumed non-vegetarian without being stated');
    const gAll = c.gold.allergies ?? [];
    const pAll = e.allergies?.value ?? [];
    const settled = !!e.allergies || !!e.noAllergies;
    const missedAll = gAll.filter((a) => !pAll.includes(a));
    if (missedAll.length && settled) res.critical.push(`allergy missed: ${missedAll.join(', ')}`);
    const extraAll = pAll.filter((a) => !gAll.includes(a));
    if (extraAll.length) res.safeOverRestriction.push(`extra allergy: ${extraAll.join(', ')}`);
    if (e.noAllergies && !c.gold.noAllergies) res.critical.push('"no allergies" asserted but not stated');
    const gClin = c.gold.clinicalFlags ?? [];
    if (gClin.length && e.noClinical) res.critical.push('health condition missed while "no conditions" asserted');
    if (e.noClinical && !c.gold.noClinical) res.critical.push('"no conditions" asserted but not stated');
    const missedExcl = (c.gold.hardExclusions ?? []).filter((x) => !(e.hardExclusions?.value ?? []).includes(x));
    if (missedExcl.length) res.errors.push({ field: 'hardExclusions(detail)', kind: 'missed', expected: missedExcl, got: e.hardExclusions?.value });
    critical += res.critical.length;
    safeOver += res.safeOverRestriction.length;
    perCase.push(res);
  }
  let C = 0, M = 0, W = 0, H = 0;
  for (const s of Object.values(fields)) {
    s.precision = s.correct + s.wrong + s.hallucinated ? s.correct / (s.correct + s.wrong + s.hallucinated) : 1;
    s.recall = s.correct + s.missed + s.wrong ? s.correct / (s.correct + s.missed + s.wrong) : 1;
    C += s.correct; M += s.missed; W += s.wrong; H += s.hallucinated;
  }
  const precision = C / (C + W + H);
  const recall = C / (C + M + W);
  return { cases: UTTERANCES.length, fields, overall: { correct: C, missed: M, wrong: W, hallucinated: H, precision, recall, f1: (2 * precision * recall) / (precision + recall) }, criticalErrors: critical, safeOverRestrictions: safeOver, perCase };
}
