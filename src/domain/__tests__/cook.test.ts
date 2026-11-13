// Cook note: the menu comes from the plan, and a translation is only used if every quantity survived.
import { buildMenu, checkTranslation, englishNote } from '../cook/note.ts';
import { generatePlanOptions } from '../planning/plan.ts';
import { calculateTargets } from '../nutrition/targets.ts';
import { CAT } from '../../lib/catalog.ts';
import { goldenBundle } from '../../test/fixtures.ts';

describe('cook note', () => {
  it('lists every dish of the day with amounts', () => {
    const b = goldenBundle();
    const t = calculateTargets(b);
    if (!t.ok) throw new Error('not eligible');
    const p = generatePlanOptions(b, { energyKcal: t.record.planningEnergyKcal, proteinEarG: t.record.protein.earG, proteinRdaG: t.record.protein.rdaG }, CAT);
    const menu = buildMenu(p.plans[0], 0, CAT);
    expect(menu.length).toBe(p.plans[0].meals.filter((m) => m.day === 0).length);
    const note = englishNote(menu, 'Monday');
    expect(note).toMatch(/^Menu for Monday\./);
    for (const d of menu) for (const i of d.items) expect(note).toContain(`${i.amount} ${i.name}`);
    expect(note).not.toMatch(/\(\w[^)]*\(\w[^)]*$/m); // no unbalanced brackets
  });

  it('accepts a translation only if every number is kept, in any digit script', () => {
    const en = 'Breakfast: Poha, 1.5 servings. Use 75 g poha, 30 g onion.';
    expect(checkTranslation(en, 'అల్పాహారం: పోహా 1.5 సర్వింగ్స్. 75 g అటుకులు, 30 g ఉల్లిపాయ.').ok).toBe(true);
    expect(checkTranslation(en, 'नाश्ता: पोहा १.५ सर्विंग। ७५ g पोहा, ३० g प्याज़।').ok).toBe(true);
    const dropped = checkTranslation(en, 'పోహా 75 g, ఉల్లిపాయ');
    expect(dropped.ok).toBe(false);
    expect(dropped.missing).toEqual(['1.5', '30']);
    expect(checkTranslation(en, 'Poha 1.5, 75 g, 30 g, 2 spoons oil').extra).toEqual(['2']);
  });
});
