// Scores the store-product matcher against labelled product titles.
// Critical (must be zero):
//   - a title that mentions egg, meat or fish mapped to an ingredient without it
//   - a labelled allergen / egg / meat / fish marker not detected in the title
//   - "eggless" or a spice mix like "egg curry masala" counted as egg (false alarm is
//     reported separately; it is safe but wrong)
import { matchProductTitle } from '../domain/commerce/match.ts';
import type { Ingredient } from '../domain/types.ts';
import { STORE_TITLES } from './datasets/storeTitles.ts';

export interface MatchingReport {
  cases: number;
  mappingCorrect: number;
  accuracy: number;
  mappedPredictions: number;
  mappedCorrect: number;
  precisionWhenMapped: number;
  shouldNotMap: number;
  correctlyRefused: number;
  refusalRecall: number;
  packCases: number;
  packCorrect: number;
  markerChecks: number;
  markerMisses: number;
  markerFalseAlarms: number;
  criticalErrors: number;
  failures: { id: string; title: string; expected: string | null; got: string | null; note: string }[];
}

export function runMatchingEval(ingredients: Map<string, Ingredient>): MatchingReport {
  const r: MatchingReport = { cases: 0, mappingCorrect: 0, accuracy: 0, mappedPredictions: 0, mappedCorrect: 0, precisionWhenMapped: 0, shouldNotMap: 0, correctlyRefused: 0, refusalRecall: 0, packCases: 0, packCorrect: 0, markerChecks: 0, markerMisses: 0, markerFalseAlarms: 0, criticalErrors: 0, failures: [] };
  for (const c of STORE_TITLES) {
    r.cases++;
    const m = matchProductTitle(c.title, ingredients);
    const ok = m.ingredientId === c.gold.ingredientId || (m.ingredientId != null && (c.gold.acceptable ?? []).includes(m.ingredientId));
    if (ok) r.mappingCorrect++;
    if (m.ingredientId != null) {
      r.mappedPredictions++;
      if (ok) r.mappedCorrect++;
    }
    if (c.gold.ingredientId == null) {
      r.shouldNotMap++;
      if (m.ingredientId == null) r.correctlyRefused++;
    }
    if (!ok) r.failures.push({ id: c.id, title: c.title, expected: c.gold.ingredientId, got: m.ingredientId, note: m.reasons.join('; ') });
    // pack size
    if (ok && c.gold.qty != null) {
      r.packCases++;
      if (m.pack && m.pack.qty === c.gold.qty && m.pack.unit === c.gold.unit) r.packCorrect++;
      else r.failures.push({ id: c.id, title: c.title, expected: `${c.gold.qty} ${c.gold.unit}`, got: m.pack ? `${m.pack.qty} ${m.pack.unit}` : null, note: `pack: ${m.packNote}` });
    }
    // safety markers
    for (const k of ['egg', 'meat', 'fish'] as const) {
      if (c.gold[k] === true) {
        r.markerChecks++;
        if (!m.markers[k]) {
          r.markerMisses++;
          r.criticalErrors++;
          r.failures.push({ id: c.id, title: c.title, expected: `${k} marker`, got: 'not detected', note: 'critical' });
        }
      }
      if (c.gold[k] === false && m.markers[k]) {
        r.markerFalseAlarms++;
        r.failures.push({ id: c.id, title: c.title, expected: `no ${k}`, got: `${k} detected`, note: 'false alarm (safe)' });
      }
    }
    for (const a of c.gold.allergens ?? []) {
      r.markerChecks++;
      const ingAllergens = m.ingredientId ? ingredients.get(m.ingredientId)!.allergens : [];
      if (!m.markers.allergens.includes(a) && !ingAllergens.includes(a)) {
        r.markerMisses++;
        r.criticalErrors++;
        r.failures.push({ id: c.id, title: c.title, expected: `allergen ${a}`, got: 'not detected', note: 'critical' });
      }
    }
    // mapped to a plant/dairy ingredient while the title says egg/meat/fish
    if (m.ingredientId) {
      const ing = ingredients.get(m.ingredientId)!;
      const titleHas = (c.gold.egg && 'egg') || (c.gold.meat && 'meat') || (c.gold.fish && 'fish');
      if (titleHas && ing.dietClass !== titleHas) {
        r.criticalErrors++;
        r.failures.push({ id: c.id, title: c.title, expected: titleHas, got: ing.dietClass, note: 'critical diet mismatch' });
      }
    }
  }
  r.accuracy = r.mappingCorrect / r.cases;
  r.precisionWhenMapped = r.mappedPredictions ? r.mappedCorrect / r.mappedPredictions : 1;
  r.refusalRecall = r.shouldNotMap ? r.correctlyRefused / r.shouldNotMap : 1;
  return r;
}
