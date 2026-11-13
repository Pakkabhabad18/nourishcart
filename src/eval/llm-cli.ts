// Evaluates the AI reader against the built-in rule reader on two labelled sets:
//   development set (40 cases, used while writing the rules: flatters the rules)
//   held-out set    (19 cases, written afterwards and never used for tuning)
// For each set it scores three readers: rules alone, AI alone (after the safety checks),
// and AI + rules merged (what the app uses).
//
// Run on your own machine (the key never goes into the repo):
//   export GROQ_API_KEY=...            # or LLM_API_KEY with LLM_BASE_URL for another provider
//   npm run eval:llm
// Writes eval-results/llm-extraction.json (full detail) and src/eval/latest-llm-report.json
// (summary shown on the app's Evaluation page). Only the fictional test sentences are sent.
import { writeFileSync, mkdirSync } from 'node:fs';
import { UTTERANCES, type UtteranceCase } from './datasets/utterances.ts';
import { HELDOUT } from './datasets/heldout.ts';
import { buildMessages, mergeWithRules, sanitiseLlmOutput, LLM_PROMPT_VERSION } from '../domain/intake/llm.ts';
import { extractProfile, type Extraction } from '../domain/intake/extract.ts';
import { runExtractionEval, type ExtractionReport } from './extraction.ts';

const base = process.env.LLM_BASE_URL ?? 'https://api.groq.com/openai/v1';
const model = process.env.LLM_MODEL ?? 'openai/gpt-oss-120b';
const key = process.env.LLM_API_KEY ?? process.env.GROQ_API_KEY;
if (!key && !process.env.LLM_BASE_URL) {
  console.log('Set GROQ_API_KEY (or LLM_BASE_URL/LLM_MODEL/LLM_API_KEY) to run the AI evaluation. Nothing was sent.');
  process.exit(0);
}
const today = new Date('2026-11-13T00:00:00Z');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One model call, with a few retries on rate limits (free tiers allow ~30 requests/min). */
async function ask(text: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model, temperature: 0, messages: buildMessages(text), response_format: { type: 'json_object' } }),
    });
    if (res.status === 429) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Model provider returned ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content ?? '';
  }
  throw new Error('Rate limited 5 times in a row; try again in a minute');
}

interface SetResult {
  rules: ExtractionReport;
  ai: ExtractionReport;
  combined: ExtractionReport;
  rejected: Record<string, { field: string; reason: string }[]>;
  latencyMsMedian: number;
}

async function runSet(name: string, cases: UtteranceCase[]): Promise<SetResult> {
  const ai: Record<string, Extraction> = {};
  const merged: Record<string, Extraction> = {};
  const rejected: SetResult['rejected'] = {};
  const times: number[] = [];
  for (const c of cases) {
    const t0 = Date.now();
    const raw = await ask(c.text);
    times.push(Date.now() - t0);
    const s = sanitiseLlmOutput(raw, c.text);
    ai[c.id] = s.extraction;
    rejected[c.id] = s.dropped;
    merged[c.id] = mergeWithRules(extractProfile(c.text, today), s.extraction);
    process.stdout.write('.');
    await sleep(Number(process.env.LLM_DELAY_MS ?? 2100)); // stay under ~30 requests a minute
  }
  console.log(` ${name} done`);
  times.sort((a, b) => a - b);
  return {
    rules: runExtractionEval(today, undefined, cases),
    ai: runExtractionEval(today, (_t, id) => ai[id], cases),
    combined: runExtractionEval(today, (_t, id) => merged[id], cases),
    rejected,
    latencyMsMedian: times[Math.floor(times.length / 2)],
  };
}

const dev = await runSet('development set', UTTERANCES);
const held = await runSet('held-out set', HELDOUT);
const generatedAt = new Date().toISOString();
mkdirSync('eval-results', { recursive: true });
writeFileSync('eval-results/llm-extraction.json', JSON.stringify({ generatedAt, model, promptVersion: LLM_PROMPT_VERSION, dev, held }, null, 2));

// Small summary for the app (no per-case detail).
const sum = (r: ExtractionReport) => ({ precision: r.overall.precision, recall: r.overall.recall, f1: r.overall.f1, critical: r.criticalErrors, safeOver: r.safeOverRestrictions });
const rejectedCount = (s: SetResult) => Object.values(s.rejected).reduce((n, x) => n + x.length, 0);
writeFileSync(
  'src/eval/latest-llm-report.json',
  JSON.stringify({
    generatedAt, model, provider: base.includes('groq') ? 'Groq' : base, promptVersion: LLM_PROMPT_VERSION,
    dev: { cases: UTTERANCES.length, rules: sum(dev.rules), ai: sum(dev.ai), combined: sum(dev.combined), rejected: rejectedCount(dev), latencyMsMedian: dev.latencyMsMedian },
    held: { cases: HELDOUT.length, rules: sum(held.rules), ai: sum(held.ai), combined: sum(held.combined), rejected: rejectedCount(held), latencyMsMedian: held.latencyMsMedian },
  }, null, 2) + '\n',
);

const row = (n: string, r: ExtractionReport) => console.log(`  ${n.padEnd(12)} precision ${(r.overall.precision * 100).toFixed(1)}%  recall ${(r.overall.recall * 100).toFixed(1)}%  F1 ${(r.overall.f1 * 100).toFixed(1)}%  critical ${r.criticalErrors}`);
for (const [label, s] of [['Development set (40)', dev], [`Held-out set (${HELDOUT.length})`, held]] as const) {
  console.log(`\n${label}`);
  row('rules', s.rules);
  row('AI only', s.ai);
  row('AI + rules', s.combined);
  console.log(`  AI suggestions rejected by the checks: ${rejectedCount(s)}; median model time ${s.latencyMsMedian} ms`);
}
console.log(`\nModel ${model}, prompt ${LLM_PROMPT_VERSION}. Ship "AI + rules" only if its critical errors are 0 on both sets.`);
