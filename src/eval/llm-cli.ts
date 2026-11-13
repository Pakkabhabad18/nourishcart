// Evaluates an LLM extractor on the same 40 labelled descriptions as the rule parser.
// Works with any OpenAI-compatible chat endpoint (a local Ollama/LM Studio server keeps
// data on your machine). Nothing is sent unless these are set:
//   LLM_BASE_URL=http://localhost:11434/v1  LLM_MODEL=llama3.1:8b  [LLM_API_KEY=...]
// Run: npm run eval:llm   -> writes eval-results/llm-extraction.json and prints a comparison.
// Only synthetic test sentences are sent; never real user data.
import { writeFileSync, mkdirSync } from 'node:fs';
import { UTTERANCES } from './datasets/utterances.ts';
import { buildMessages, mergeWithRules, sanitiseLlmOutput, LLM_PROMPT_VERSION } from '../domain/intake/llm.ts';
import { extractProfile, type Extraction } from '../domain/intake/extract.ts';
import { runExtractionEval } from './extraction.ts';

const base = process.env.LLM_BASE_URL;
const model = process.env.LLM_MODEL;
if (!base || !model) {
  console.log('Set LLM_BASE_URL and LLM_MODEL to run the LLM evaluation. Nothing was sent.');
  process.exit(0);
}
const today = new Date('2026-11-13T00:00:00Z');
const raw: Record<string, Extraction> = {};
const merged: Record<string, Extraction> = {};
const dropped: Record<string, unknown> = {};
for (const c of UTTERANCES) {
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}) },
    body: JSON.stringify({ model, temperature: 0, messages: buildMessages(c.text), response_format: { type: 'json_object' } }),
  });
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const s = sanitiseLlmOutput(j.choices?.[0]?.message?.content ?? '', c.text);
  raw[c.id] = s.extraction;
  dropped[c.id] = s.dropped;
  merged[c.id] = mergeWithRules(extractProfile(c.text, today), s.extraction);
  process.stdout.write('.');
}
const rules = runExtractionEval(today);
const llm = runExtractionEval(today, (_t, id) => raw[id]);
const combined = runExtractionEval(today, (_t, id) => merged[id]);
mkdirSync('eval-results', { recursive: true });
writeFileSync('eval-results/llm-extraction.json', JSON.stringify({ model, promptVersion: LLM_PROMPT_VERSION, rules, llm, combined, dropped }, null, 2));
const row = (n: string, r: ReturnType<typeof runExtractionEval>) => console.log(`${n.padEnd(14)} precision ${(r.overall.precision * 100).toFixed(1)}%  recall ${(r.overall.recall * 100).toFixed(1)}%  critical ${r.criticalErrors}`);
console.log(`\nModel ${model}, prompt ${LLM_PROMPT_VERSION}`);
row('rules', rules);
row('llm only', llm);
row('llm + rules', combined);
console.log('Switch the app to an LLM only if "llm + rules" has 0 critical errors and beats "rules".');
