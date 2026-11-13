// Shopping-agent evaluation that runs without any AI key (part of `npm run eval` and CI).
//  1. Planted-text defence: for every saved store page, a "fooled" AI answer is simulated
//     (it repeats planted prices, invents products, copies prices from other cards) and we
//     count how many of those survive verifyListings(). Must be 0.
//  2. Genuine products kept: a correct AI answer must survive the checks untouched.
//  3. Choice safety: for every diet x allergy combination, no product chosen by the comparison
//     breaks the person's rules, judged by HAND LABELS of the saved pages (not the matcher).
//  4. Cheapest choice: the comparison's pick equals a brute-force search over every product
//     and pack count, for a range of quantities.
// The live AI reader itself (Gemini) is scored separately by `npm run eval:listings`.
import type { Ingredient } from '../domain/types.ts';
import { verifyListings, type Listing } from '../domain/commerce/listings.ts';
import { bestPick } from '../domain/commerce/compare.ts';
import { checkIngredient } from './oracle.ts';
import { STORE_PAGES } from './datasets/storePages.ts';
import { ALLERGY_SETS, DIETS } from './recommendations.ts';

export interface ShoppingReport {
  fakeAnswers: number;
  fakeSurvived: number;
  genuine: number;
  genuineRejected: number;
  picksChecked: number;
  unsafePicks: number;
  cheapestChecks: number;
  cheapestMismatches: number;
}

// Hand labels for the saved pages: which ingredient each product is (null = not a plain ingredient).
const LABEL: Record<string, { ingredient: string | null; egg?: boolean }> = {
  'RASOI TATTVA Green Moong Whole Pesticide Free Natural': { ingredient: 'moong_whole' },
  'RASOI TATTVA Chana Dal': { ingredient: 'chana_dal' },
};
const labelFor = (title: string, query: string) => LABEL[title] ?? { ingredient: query.includes('toor') ? 'toor_dal' : query.includes('paneer') ? 'paneer' : null };

function packFrom(text: string, title: string, nth: number): string {
  const lines = text.split('\n');
  const at = lines.map((l, i) => (l === title ? i : -1)).filter((i) => i >= 0)[nth] ?? -1;
  return lines.slice(at + 1, at + 4).find((l) => /\d+(\.\d+)?\s?(kg|g|ml|l)\b/i.test(l)) ?? '';
}

export function runShoppingEval(ingredients: Map<string, Ingredient>): ShoppingReport {
  const r: ShoppingReport = { fakeAnswers: 0, fakeSurvived: 0, genuine: 0, genuineRejected: 0, picksChecked: 0, unsafePicks: 0, cheapestChecks: 0, cheapestMismatches: 0 };
  const real = STORE_PAGES.filter((p) => p.gold.length);

  for (const p of STORE_PAGES) {
    // genuine answer
    const genuine = p.gold.map((g) => ({ title: g.title, price: g.price, soldOut: !!g.soldOut, sponsored: !!g.sponsored }));
    const g = verifyListings(genuine, p.text);
    r.genuine += genuine.length;
    r.genuineRejected += genuine.length - g.listings.length;
    // fooled answers: planted values, invented products, and every card with a neighbour's price
    const fakes: { title: string; price: number }[] = [...(p.mustNotAppear ?? []).map((m) => ({ title: m.title ?? p.gold[0]?.title ?? STORE_PAGES[0].gold[0].title, price: m.price ?? 10 }))];
    fakes.push({ title: 'Premium Organic Toor Dal 5 kg', price: 99 }, { title: 'Amul Fresh Malai Paneer 1 kg', price: 20 });
    p.gold.forEach((card, i) => {
      // the next card's price put on this card (only when it differs and this title has no
      // other card at that price, e.g. two pack sizes of the same product)
      const next = p.gold[i + 1];
      if (next && next.price !== card.price && !p.gold.some((g) => g.title === card.title && g.price === next.price)) fakes.push({ title: card.title, price: next.price });
    });
    // Each fake is slipped into an otherwise genuine answer, as a fooled model would produce it.
    for (const f of fakes) {
      r.fakeAnswers++;
      const answer = [...genuine.filter((x) => !(x.title === f.title && p.gold.filter((y) => y.title === f.title).length === 1)), f];
      const kept = verifyListings(answer, p.text).listings;
      if (kept.some((l) => l.title === f.title && l.priceInr === f.price)) r.fakeSurvived++;
    }
  }

  // choice safety and cheapest, on the real pages
  for (const p of real) {
    const seen: Record<string, number> = {};
    const listings: Listing[] = verifyListings(p.gold.map((g) => ({ title: g.title, price: g.price, soldOut: !!g.soldOut, sponsored: !!g.sponsored })), p.text).listings.map((l) => {
      const n = (seen[l.title] = (seen[l.title] ?? -1) + 1);
      return { ...l, pack: packFrom(p.text, l.title, n) };
    });
    const target = p.query.includes('toor') ? 'toor_dal' : 'paneer';
    for (const diet of DIETS)
      for (const allergies of ALLERGY_SETS) {
        const rules = { dietPattern: diet, allergies, hardExclusions: [] as string[] };
        for (const need of [150, 400, 700, 1000, 2200]) {
          const line = { ingredientId: target, name: target, demandQty: need, unit: 'g' };
          const { pick } = bestPick(line, p.store, listings, ingredients, rules);
          if (pick) {
            r.picksChecked++;
            const label = labelFor(pick.title, p.query);
            const ing = label.ingredient ? ingredients.get(label.ingredient) : undefined;
            const wrong = !ing || label.ingredient !== target || checkIngredient(ing, { diet, allergies, exclusions: [] }, pick.title).length > 0;
            if (wrong) r.unsafePicks++;
          }
          // brute force cheapest
          r.cheapestChecks++;
          let best = Infinity;
          for (const l of listings) {
            const one = bestPick(line, p.store, [l], ingredients, rules).pick;
            if (one) best = Math.min(best, Math.ceil(need / one.packQty - 1e-9) * l.priceInr);
          }
          if ((pick?.costInr ?? Infinity) !== best) r.cheapestMismatches++;
        }
      }
  }
  return r;
}
