// Scores the label scan end to end on the rendered test labels (eval-data/labels/*.jpg):
// photo -> Gemini transcription -> our checker -> verdict per test person, compared with the
// verdict our checker gives on the hand-typed (gold) label text.
//   export GEMINI_API_KEY=...   npm run eval:labels
// Critical error: the photo path says "safe" for a person the gold label says is not safe.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { LABELS } from './datasets/labels.ts';
import { LABEL_PEOPLE } from './labelPeople.ts';
import { LABEL_PROMPT_VERSION, LABEL_SYSTEM_PROMPT, parseLabelAnswer, verdictFor, type LabelReading } from '../domain/labels/check.ts';

const key = process.env.GEMINI_API_KEY;
const MODELS = (process.env.GEMINI_MODELS ?? 'gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.8-flash').split(',');
if (!key) {
  console.log('Set GEMINI_API_KEY to run the label evaluation. Nothing was sent.');
  process.exit(0);
}
const used = new Set<string>();

async function read(image: string): Promise<{ raw: string; ms: number }> {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 3 * MODELS.length; attempt++) {
    const model = MODELS[attempt % MODELS.length];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LABEL_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: image } }, { text: 'Transcribe this label.' }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    if ([404, 429, 500, 502, 503].includes(r.status)) {
      await new Promise((s) => setTimeout(s, 3000));
      continue;
    }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
    used.add(model);
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return { raw: (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''), ms: Date.now() - t0 };
  }
  throw new Error('All models busy; try again in a minute');
}

let pairs = 0, agree = 0, critical = 0, overCautious = 0, unreadableCaught = 0, unreadableCases = 0;
const details: unknown[] = [];
const times: number[] = [];
for (const c of LABELS) {
  const gold: LabelReading = { productName: c.product, ingredientsText: c.ingredients, containsText: c.contains ?? '', mayContainText: c.mayContain ?? '', vegMark: c.mark, readable: c.style !== 'cutoff', aiAllergens: [] };
  const { raw, ms } = await read(readFileSync(`eval-data/labels/${c.id}.jpg`).toString('base64'));
  times.push(ms);
  const ai = parseLabelAnswer(raw);
  if (c.style === 'cutoff') {
    unreadableCases++;
    if (!ai.readable) unreadableCaught++;
  }
  const rows = LABEL_PEOPLE.map((p) => {
    const g = verdictFor(gold, p).verdict;
    const a = verdictFor(ai, p).verdict;
    pairs++;
    if (g === a) agree++;
    if (a === 'safe' && g !== 'safe') critical++;
    if (a !== 'safe' && g === 'safe') overCautious++;
    return { person: p.name, gold: g, ai: a };
  });
  details.push({ id: c.id, style: c.style, ms, readable: ai.readable, vegMark: ai.vegMark, aiAllergens: ai.aiAllergens, ingredients: ai.ingredientsText.slice(0, 160), mismatches: rows.filter((r) => r.gold !== r.ai) });
  process.stdout.write('.');
  await new Promise((s) => setTimeout(s, 3000));
}
times.sort((a, b) => a - b);
const summary = {
  generatedAt: new Date().toISOString(), model: [...used].join(' + '), promptVersion: LABEL_PROMPT_VERSION,
  labels: LABELS.length, people: LABEL_PEOPLE.length, verdicts: pairs, agreement: agree / pairs, criticalSafeErrors: critical,
  overCautious, cutoffDetected: `${unreadableCaught}/${unreadableCases}`, latencyMsMedian: times[Math.floor(times.length / 2)],
};
mkdirSync('eval-results', { recursive: true });
writeFileSync('eval-results/labels.json', JSON.stringify({ ...summary, details }, null, 2));
writeFileSync('src/eval/latest-labels-report.json', JSON.stringify(summary, null, 2) + '\n');
console.log('\n' + JSON.stringify(summary, null, 2));
