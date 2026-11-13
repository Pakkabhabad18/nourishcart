// Vercel serverless function: POST /api/intake  { text }  ->  { content, model, promptVersion }
//
// Sends what the person said to an LLM on Groq and returns the model's raw JSON answer.
// The browser then checks that answer with sanitiseLlmOutput() and mergeWithRules()
// (src/domain/intake/llm.ts) before anything touches the profile. This function does no
// trusting of the model itself: it only hides the API key and limits abuse.
//
// Config (Vercel > Settings > Environment Variables, never with a VITE_ prefix):
//   GROQ_API_KEY   required
//   GROQ_MODEL     optional, default below
// Privacy: Groq does not train on API data; turn on Zero Data Retention in the Groq console.
// Only the description text is sent: no name, email or account id.
import { PROMPT_VERSION, SYSTEM_PROMPT } from './_intake-prompt.js';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAX_CHARS = 2000; // a long spoken description is ~800 characters
const ALLOWED_ORIGINS = [/^https:\/\/nourishcart(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export default async function handler(req, res) {
  // Only our own pages may call this, so the key can't be used as a free LLM by others.
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.some((r) => r.test(origin))) return res.status(403).json({ error: 'origin not allowed' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'AI reader not configured' });

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text required' });
  if (text.length > MAX_CHARS) return res.status(413).json({ error: `text longer than ${MAX_CHARS} characters` });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0, // same input, same answer, as far as the provider allows
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(502).json({ error: `model provider returned ${r.status}` });
    const j = await r.json();
    return res.status(200).json({ content: j.choices?.[0]?.message?.content ?? '', model: MODEL, promptVersion: PROMPT_VERSION });
  } catch (e) {
    return res.status(504).json({ error: e?.name === 'TimeoutError' ? 'model timed out' : 'model call failed' });
  }
}
