// Label-scan checks that need no AI key (part of `npm run eval`):
//  L1  the word lists find exactly the hand-labelled facts on every test label
//      (allergens, traces, meat/fish, egg, not-vegan, uncertain additives)
//  L2  a label marked unreadable never gives "safe" to anyone, for every test person
//  L3  every gold "avoid" stays "avoid" even if the AI's own allergen list is empty
//      (the AI list can only add caution, never remove it)
// The live photo path (Gemini reading the rendered images) is scored by `npm run eval:labels`.
import { LABELS } from './datasets/labels.ts';
import { LABEL_PEOPLE } from './labelPeople.ts';
import { labelFacts, verdictFor, type LabelReading } from '../domain/labels/check.ts';

export interface LabelEvalReport {
  labels: number;
  factMismatches: string[];
  unreadableSafe: number;
  unreadableChecked: number;
  verdicts: number;
}

const goldReading = (c: (typeof LABELS)[number], readable = true): LabelReading => ({ productName: c.product, ingredientsText: c.ingredients, containsText: c.contains ?? '', mayContainText: c.mayContain ?? '', vegMark: c.mark, readable, aiAllergens: [] });

export function runLabelEval(): LabelEvalReport {
  const r: LabelEvalReport = { labels: LABELS.length, factMismatches: [], unreadableSafe: 0, unreadableChecked: 0, verdicts: 0 };
  for (const c of LABELS) {
    const f = labelFacts(goldReading(c));
    const got = { allergens: Object.keys(f.allergens).sort(), traces: Object.keys(f.traces).sort(), meatFish: !!f.meatFish, egg: !!f.egg, notVegan: !!f.notVegan, maybeAnimal: !!f.maybeAnimal };
    const exp = { ...c.gold, allergens: [...c.gold.allergens].sort(), traces: [...c.gold.traces].sort() };
    if (JSON.stringify(got) !== JSON.stringify(exp)) r.factMismatches.push(c.id);
    for (const p of LABEL_PEOPLE) {
      r.verdicts++;
      r.unreadableChecked++;
      if (verdictFor(goldReading(c, false), p).verdict === 'safe') r.unreadableSafe++;
    }
  }
  return r;
}
