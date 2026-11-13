// Vercel serverless function: POST /api/cook  { text, language: 'te' | 'hi' }  ->  { content, model, promptVersion }
// Rewrites the English menu note for the cook in Telugu or Hindi (Groq). The browser then
// checks every quantity survived (src/domain/cook/note.ts) before showing or reading it out.
// Only the menu is sent: dish names and amounts, nothing about the person.
import { PROMPT_VERSION, SYSTEM_PROMPT } from './_cook-prompt.js';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const LANGS = { te: 'Telugu', hi: 'Hindi' };
const ALLOWED_ORIGINS = [/^https:\/\/nourishcart(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.some((r) => r.test(origin))) return res.status(403).json({ error: 'origin not allowed' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'translator not configured' });
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const language = LANGS[req.body?.language];
  if (!text || !language) return res.status(400).json({ error: 'send text and language te or hi' });
  if (text.length > 3000) return res.status(413).json({ error: 'menu too long' });
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: 'system', content: SYSTEM_PROMPT.replace('{LANGUAGE}', language) }, { role: 'user', content: text }] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return res.status(502).json({ error: `model provider returned ${r.status}` });
    const j = await r.json();
    return res.status(200).json({ content: j.choices?.[0]?.message?.content ?? '', model: MODEL, promptVersion: PROMPT_VERSION });
  } catch (e) {
    return res.status(504).json({ error: e?.name === 'TimeoutError' ? 'model timed out' : 'model call failed' });
  }
}
