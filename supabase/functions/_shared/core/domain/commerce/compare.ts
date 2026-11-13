// Price comparison across stores, from listings already read off each store's search page.
// Pure, deterministic code: no AI here. For every basket line and every store it
//   1. keeps only products that are the same ingredient and pass the person's diet,
//      allergy and exclusion rules (the same checks used for the Instamart cart),
//   2. works out how many packs cover the quantity the plan needs,
//   3. picks the cheapest way per store, and
//   4. totals three options: everything from store A, everything from store B, or the
//      cheapest store for each item (a split order, which means two deliveries).
// Delivery and handling fees are NOT included: they depend on the cart and the person's
// membership, and the store shows them at checkout. The screen says so.
import type { Ingredient } from '../types.ts';
import type { Restrictions } from '../diet.ts';
import { matchProductTitle } from './match.ts';
import { variantRejection } from './instamart.ts';
import type { Listing } from './listings.ts';

export type StoreId = 'zepto' | 'instamart';
export const STORE_NAMES: Record<StoreId, string> = { zepto: 'Zepto', instamart: 'Swiggy Instamart' };

export interface CompareLine {
  ingredientId: string;
  name: string;
  demandQty: number; // in the ingredient's unit basis (g, ml or piece)
  unit: string;
}

export interface Pick {
  store: StoreId;
  title: string;
  pack: string;
  packQty: number;
  priceInr: number;
  mrpInr: number | null;
  packs: number;
  costInr: number; // packs x price
  unitPriceInr: number; // per kg, per litre or per piece, for display
  leftover: number;
  sponsored: boolean;
  confidence: 'high' | 'medium';
}

export interface LineResult {
  line: CompareLine;
  best: Partial<Record<StoreId, Pick>>;
  /** Why products on each store were left out, for the "why not this one?" view. */
  refused: Partial<Record<StoreId, { title: string; reason: string }[]>>;
  cheapest: StoreId | null;
}

export interface Comparison {
  lines: LineResult[];
  stores: StoreId[];
  totals: Record<StoreId, { costInr: number; found: number }>;
  split: { costInr: number; found: number; byStore: Record<StoreId, number> };
  missingEverywhere: string[];
}

/** Display price per kg / litre / piece. */
function unitPrice(price: number, packQty: number, unit: string): number {
  return unit === 'piece' ? price / packQty : (price / packQty) * 1000;
}

/** The best pick for one line on one store, or null with the reasons each product was refused. */
export function bestPick(line: CompareLine, store: StoreId, listings: Listing[], ingredients: Map<string, Ingredient>, r: Restrictions): { pick: Pick | null; refused: { title: string; reason: string }[] } {
  const refused: { title: string; reason: string }[] = [];
  let pick: Pick | null = null;
  for (const l of listings) {
    const m = matchProductTitle(`${l.title} ${l.pack}`, ingredients);
    const why = variantRejection(m, line.ingredientId, ingredients, r) ?? (l.soldOut ? 'sold out' : null);
    if (why) {
      refused.push({ title: l.title, reason: why });
      continue;
    }
    const packQty = m.pack!.qty;
    const packs = Math.max(1, Math.ceil(line.demandQty / packQty - 1e-9));
    const cost = packs * l.priceInr;
    const leftover = packs * packQty - line.demandQty;
    const better = !pick || cost < pick.costInr - 0.01 || (Math.abs(cost - pick.costInr) <= 0.01 && leftover < pick.leftover);
    if (better) {
      pick = { store, title: l.title, pack: l.pack, packQty, priceInr: l.priceInr, mrpInr: l.mrpInr, packs, costInr: cost, unitPriceInr: unitPrice(l.priceInr, packQty, line.unit), leftover, sponsored: l.sponsored, confidence: m.confidence === 'high' ? 'high' : 'medium' };
    }
  }
  return { pick, refused };
}

export function compareStores(lines: CompareLine[], listings: Record<StoreId, Record<string, Listing[] | undefined>>, ingredients: Map<string, Ingredient>, r: Restrictions): Comparison {
  const stores = Object.keys(listings) as StoreId[];
  const totals = Object.fromEntries(stores.map((s) => [s, { costInr: 0, found: 0 }])) as Comparison['totals'];
  const split = { costInr: 0, found: 0, byStore: Object.fromEntries(stores.map((s) => [s, 0])) as Record<StoreId, number> };
  const out: LineResult[] = [];
  const missingEverywhere: string[] = [];
  for (const line of lines.filter((l) => l.demandQty > 0)) {
    const res: LineResult = { line, best: {}, refused: {}, cheapest: null };
    for (const s of stores) {
      const { pick, refused } = bestPick(line, s, listings[s][line.ingredientId] ?? [], ingredients, r);
      res.refused[s] = refused;
      if (pick) {
        res.best[s] = pick;
        totals[s].costInr += pick.costInr;
        totals[s].found++;
        if (!res.cheapest || pick.costInr < res.best[res.cheapest]!.costInr) res.cheapest = s;
      }
    }
    if (res.cheapest) {
      split.costInr += res.best[res.cheapest]!.costInr;
      split.found++;
      split.byStore[res.cheapest]++;
    } else missingEverywhere.push(line.name);
    out.push(res);
  }
  return { lines: out, stores, totals, split, missingEverywhere };
}
