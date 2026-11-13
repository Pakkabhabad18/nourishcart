// Scores the cook-note translation: for every day of a few sample plans, in Telugu and Hindi,
// does the translation keep every quantity (checkTranslation)? Failures fall back to English
// in the app, so this measures how often the cook gets their own language.
//   export GROQ_API_KEY=...   npm run eval:cook
import { writeFileSync } from 'node:fs';
import { CAT } from '../lib/catalog.ts';
import { generatePlanOptions } from '../domain/planning/plan.ts';
import { calculateTargets, planTargetsFrom } from '../domain/nutrition/targets.ts';
import { buildMenu, checkTranslation, COOK_PROMPT_VERSION, COOK_SYSTEM_PROMPT, englishNote, LANGUAGE_NAMES } from '../domain/cook/note.ts';
import { makeProfile, mulberry32 } from './recommendations.ts';

const key = process.env.GROQ_API_KEY;
if (!key) {
  console.log('Set GROQ_API_KEY to run the cook-note evaluation. Nothing was sent.');
  process.exit(0);
}
const model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
const notes: string[] = [];
for (const [i, diet] of (['vegetarian', 'non_vegetarian'] as const).entries()) {
  const b = makeProfile(i + 1, diet, [], [], mulberry32(7 + i));
  const t = calculateTargets(b);
  if (!t.ok) continue;
  const plans = generatePlanOptions(b, planTargetsFrom(t.record), CAT);
  if (!plans.ok) continue;
  for (const day of [0, 3, 6]) notes.push(englishNote(buildMenu(plans.plans[0], day, CAT), ['Monday', 'Thursday', 'Sunday'][[0, 3, 6].indexOf(day)]));
}
let ok = 0, total = 0;
const fails: unknown[] = [];
for (const lang of ['te', 'hi'] as const) {
  for (const note of notes) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: COOK_SYSTEM_PROMPT.replace('{LANGUAGE}', LANGUAGE_NAMES[lang]) }, { role: 'user', content: note }] }),
    });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const c = checkTranslation(note, j.choices?.[0]?.message?.content ?? '');
    total++;
    if (c.ok) ok++;
    else fails.push({ lang, missing: c.missing, extra: c.extra });
    process.stdout.write('.');
    await new Promise((s) => setTimeout(s, 2500));
  }
}
const summary = { generatedAt: new Date().toISOString(), model, promptVersion: COOK_PROMPT_VERSION, notes: total, quantitiesKept: ok, keptRate: ok / total, fails };
writeFileSync('src/eval/latest-cook-report.json', JSON.stringify(summary, null, 2) + '\n');
console.log('\n' + JSON.stringify(summary, null, 2));
