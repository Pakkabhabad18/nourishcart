// Price comparison: the listing checks (what an AI reads off a store page is verified
// against the page) and the comparison engine (deterministic, checked against brute force).
import { detectPageState, verifyListings, verifyModelAnswer, type Listing } from '../commerce/listings.ts';
import { bestPick, compareStores, type CompareLine } from '../commerce/compare.ts';
import { STORE_PAGES } from '../../eval/datasets/storePages.ts';
import { CAT } from '../../lib/catalog.ts';

const page = (id: string) => STORE_PAGES.find((p) => p.id === id)!;
// A "perfect reader": returns exactly the hand-labelled cards.
const perfect = (id: string) => page(id).gold.map((g) => ({ title: g.title, pack: '', price: g.price, mrp: null, soldOut: !!g.soldOut, sponsored: !!g.sponsored }));

describe('listing checks', () => {
  it('accepts every real product card on the real pages', () => {
    for (const id of ['zepto-toor', 'instamart-toor', 'zepto-paneer']) {
      const v = verifyListings(perfect(id), page(id).text);
      expect(v.rejected).toEqual([]);
      expect(v.listings).toHaveLength(page(id).gold.length);
    }
  });

  it('rejects invented products and planted prices, even if the AI repeats them', () => {
    const inj = page('inject-cheap-price');
    const fooled = [
      { title: 'Tata Sampann Unpolished Toor Dal | Arhar Dal', price: 1 }, // real product, planted price
      { title: 'Super Saver Toor Dal 5 kg', price: 10 }, // product that only exists in the planted note
      { title: 'BestValue Toor Dal', price: 154 }, // genuine
    ];
    const v = verifyListings(fooled, inj.text);
    expect(v.listings.map((l) => l.title)).toEqual(['BestValue Toor Dal']);
    expect(v.rejected.map((r) => r.reason)).toEqual([expect.stringMatching(/not shown on this product's card/), expect.stringMatching(/not found on the page/)]);

    const hidden = page('inject-hidden-product');
    expect(verifyListings([{ title: 'Mega Paneer Value Pack 2 kg', price: 49 }], hidden.text).listings).toEqual([]);
  });

  it('tells "needs login" apart from "not sold here"', () => {
    expect(detectPageState(page('login-wall').text)).toBe('login_required');
    expect(detectPageState(page('zepto-toor').text)).toBe('ok');
    expect(verifyModelAnswer('{}', [{ id: 'x', store: 'instamart', query: 'paneer', text: page('login-wall').text }])[0].state).toBe('login_required');
  });
});

describe('comparison engine', () => {
  const veg = { dietPattern: 'vegetarian' as const, allergies: [], hardExclusions: [] };
  const toor: CompareLine = { ingredientId: 'toor_dal', name: 'Toor dal', demandQty: 700, unit: 'g' };

  it('never picks the sponsored green moong, the sold-out pack or the chana dal for toor dal', () => {
    const { pick, refused } = bestPick(toor, 'instamart', withPacks('instamart-toor'), CAT.ingredients, veg);
    expect(pick).not.toBeNull();
    expect(pick!.title).not.toMatch(/moong|chana/i);
    expect(refused.map((r) => r.title)).toEqual(expect.arrayContaining(['RASOI TATTVA Green Moong Whole Pesticide Free Natural', 'RASOI TATTVA Chana Dal']));
  });

  it('matches a brute-force search over every product and pack count', () => {
    for (const store of ['zepto-toor', 'instamart-toor'] as const) {
      const ls = withPacks(store);
      for (const need of [150, 500, 700, 1000, 1600, 2500]) {
        const line = { ...toor, demandQty: need };
        const { pick } = bestPick(line, store.startsWith('zepto') ? 'zepto' : 'instamart', ls, CAT.ingredients, veg);
        // brute force: for every acceptable product, the cheapest pack count that covers the need
        let best = Infinity;
        for (const l of ls) {
          const r = bestPick(line, 'zepto', [l], CAT.ingredients, veg).pick;
          if (r) for (let n = 1; n <= 20; n++) if (n * r.packQty >= need) { best = Math.min(best, n * l.priceInr); break; }
        }
        expect(pick?.costInr ?? Infinity).toBe(best);
      }
    }
  });

  it('shows what it chose (printed for the report)', () => {
    const paneer: CompareLine = { ingredientId: 'paneer', name: 'Paneer', demandQty: 400, unit: 'g' };
    const c = compareStores([toor, paneer], { zepto: { toor_dal: withPacks('zepto-toor'), paneer: withPacks('zepto-paneer') }, instamart: { toor_dal: withPacks('instamart-toor') } }, CAT.ingredients, veg);
    for (const l of c.lines) for (const s of c.stores) if (l.best[s]) console.log(s, l.line.name, '->', l.best[s]!.title, l.best[s]!.pack, 'x', l.best[s]!.packs, '=', l.best[s]!.costInr, `(₹${Math.round(l.best[s]!.unitPriceInr)}/kg)`, 'refused', l.refused[s]!.length);
    console.log('totals', JSON.stringify(c.totals), 'split', JSON.stringify(c.split));
    expect(c.lines[1].best.zepto).toBeDefined();
  });

  it('totals single-store and split options', () => {
    const c = compareStores([toor], { zepto: { toor_dal: withPacks('zepto-toor') }, instamart: { toor_dal: withPacks('instamart-toor') } }, CAT.ingredients, veg);
    const l = c.lines[0];
    expect(c.split.costInr).toBe(Math.min(l.best.zepto!.costInr, l.best.instamart!.costInr));
    expect(c.totals.zepto.found + c.totals.instamart.found).toBe(2);
  });
});

/** Attach each card's pack text from the page (the line after the title holds it on both stores). */
function withPacks(id: string): Listing[] {
  const p = page(id);
  const lines = p.text.split('\n');
  return verifyListings(perfect(id), p.text).listings.map((l, i) => {
    // find the i-th occurrence order: walk titles in order
    const idx = lines.findIndex((x, k) => x === l.title && lines.slice(0, k).filter((y) => y === l.title).length === p.gold.slice(0, i).filter((g) => g.title === l.title).length);
    const pack = lines.slice(idx + 1, idx + 4).find((x) => /\d+(\.\d+)?\s?(kg|g|ml|l)\b/i.test(x)) ?? '';
    return { ...l, pack };
  });
}

describe('api/listings (Vercel function)', () => {
  const FN = '../../../api/listings.js';
  const res = () => {
    const r = { code: 0, body: undefined as unknown, status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; return r; } };
    return r;
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });
  it('refuses other sites and bad input, and falls back to the next model when one is busy', async () => {
    const { default: handler } = await import(/* @vite-ignore */ FN);
    let r = res();
    await handler({ method: 'POST', headers: { origin: 'https://evil.example' }, body: {} }, r);
    expect(r.code).toBe(403);
    process.env.GEMINI_API_KEY = 'test';
    r = res();
    await handler({ method: 'POST', headers: {}, body: { pages: [] } }, r);
    expect(r.code).toBe(400);
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      return calls.length === 1 ? new Response('busy', { status: 503 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"pages":[]}' }] } }] }));
    }));
    r = res();
    await handler({ method: 'POST', headers: { origin: 'https://nourishcart.vercel.app' }, body: { pages: [{ id: 'a', query: 'q', text: 't' }] } }, r);
    expect(r.code).toBe(200);
    expect(calls).toHaveLength(2);
    expect((r.body as { model: string }).model).not.toBe(calls[0]);
  });
});
