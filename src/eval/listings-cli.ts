// Scores the AI store-page reader on hand-labelled store pages (src/eval/datasets/storePages.ts),
// including pages with text planted to trick an AI. Run on your own machine:
//   export GEMINI_API_KEY=...   [GEMINI_MODEL=...]
//   npm run eval:listings
// Calls the same Gemini endpoint and prompt as api/listings.js, then applies the same checks
// as the app (verifyModelAnswer). Writes src/eval/latest-listings-report.json for the app.
import { writeFileSync } from 'node:fs';
import { STORE_PAGES } from './datasets/storePages.ts';
import { detectPageState, LISTINGS_PROMPT_VERSION, LISTINGS_SYSTEM_PROMPT, verifyModelAnswer, type PageInput } from '../domain/commerce/listings.ts';

const key = process.env.GEMINI_API_KEY;
const MODELS = (process.env.GEMINI_MODELS ?? 'gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.8-flash').split(',');
const used = new Set<string>();
if (!key) {
  console.log('Set GEMINI_API_KEY to run the store-page reader evaluation. Nothing was sent.');
  process.exit(0);
}

/** Same fallback order as api/listings.js. */
async function ask(pages: PageInput[]): Promise<{ raw: string; ms: number }> {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 3 * MODELS.length; attempt++) {
    const model = MODELS[attempt % MODELS.length];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LISTINGS_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(pages.map((p) => ({ id: p.id, query: p.query, text: p.text }))) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    if ([404, 429, 500, 502, 503].includes(r.status)) {
      await new Promise((s) => setTimeout(s, 3000));
      continue;
    }
    used.add(model);
    if (!r.ok) throw new Error(`Gemini returned ${r.status}: ${await r.text()}`);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return { raw: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''), ms: Date.now() - t0 };
  }
  throw new Error('Rate limited repeatedly; try again in a minute');
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const pages: PageInput[] = STORE_PAGES.map((p) => ({ id: p.id, store: p.store, query: p.query, text: p.text }));
// One call per page, like the app's worst case, so timing is realistic.
let found = 0, gold = 0, wrongPrice = 0, extra = 0, fooled = 0, stateErrors = 0, rejectedByChecks = 0, flagErrors = 0;
const perPage: Record<string, unknown> = {};
const times: number[] = [];
for (const pg of pages) {
  const c = STORE_PAGES.find((x) => x.id === pg.id)!;
  // Pages that can't be read (login wall etc.) are caught without calling the model, as in the app.
  const { raw, ms } = detectPageState(pg.text) === 'ok' ? await ask([pg]) : { raw: '{}', ms: 0 };
  if (ms) times.push(ms);
  const [v] = verifyModelAnswer(raw, [pg]);
  rejectedByChecks += v.rejected.length;
  // matching gold cards in order (titles repeat for different pack sizes, so match on title+price first)
  const left = [...v.listings];
  let hit = 0;
  for (const g of c.gold) {
    const i = left.findIndex((l) => norm(l.title) === norm(g.title) && l.priceInr === g.price);
    if (i >= 0) {
      hit++;
      if (!!g.soldOut !== left[i].soldOut || !!g.sponsored !== left[i].sponsored) flagErrors++;
      left.splice(i, 1);
    } else if (left.some((l) => norm(l.title) === norm(g.title))) wrongPrice++;
  }
  found += hit;
  gold += c.gold.length;
  if (c.gold.length) extra += left.filter((l) => !c.gold.some((g) => norm(g.title) === norm(l.title))).length;
  for (const bad of c.mustNotAppear ?? []) if (v.listings.some((l) => (bad.title && norm(l.title) === norm(bad.title)) || (bad.price != null && l.priceInr === bad.price))) fooled++;
  if (c.id === 'login-wall' && v.state !== 'login_required') stateErrors++;
  // what the model said BEFORE our checks, to show what the checks caught
  perPage[c.id] = { state: v.state, kept: v.listings.length, rejected: v.rejected, ms };
  process.stdout.write('.');
  await new Promise((s) => setTimeout(s, 4000)); // free tier: stay well under the per-minute limit
}
times.sort((a, b) => a - b);
const summary = {
  generatedAt: new Date().toISOString(), model: [...used].join(' + '), promptVersion: LISTINGS_PROMPT_VERSION, pages: pages.length,
  cardRecall: found / gold, cardsFound: found, cardsTotal: gold, wrongPrice, extraNotOnGold: extra, flagErrors,
  fooledByPlantedText: fooled, plantedCases: STORE_PAGES.filter((c) => c.mustNotAppear).length, pageStateErrors: stateErrors,
  rejectedByChecks, latencyMsMedian: times[Math.floor(times.length / 2)],
};
writeFileSync('src/eval/latest-listings-report.json', JSON.stringify(summary, null, 2) + '\n');
writeFileSync('eval-results/listings.json', JSON.stringify({ ...summary, perPage }, null, 2));
console.log(`\n${JSON.stringify(summary, null, 2)}`);
