// Vercel serverless function: POST /api/listings  { pages: [{ id, query, text }] }
//   -> { content, model, promptVersion }
//
// Sends the visible text of store search pages (captured in the person's own browser by the
// NourishCart Shopper extension) to Gemini, which lists the products on each page. The
// browser then verifies every product against the page text (src/domain/commerce/listings.ts)
// before comparing prices. Only public store page text is sent: nothing about the person.
//
// Config (Vercel > Settings > Environment Variables): GEMINI_API_KEY (required), GEMINI_MODEL (optional)
import { PROMPT_VERSION, SYSTEM_PROMPT } from './_listings-prompt.js';

// Tried in order: free-tier models are sometimes overloaded (503) or rate-limited (429),
// so we fall back to the next one rather than failing the comparison.
const MODELS = (process.env.GEMINI_MODELS || 'gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.8-flash').split(',').map((m) => m.trim()).filter(Boolean);
const MAX_PAGES = 6; // pages per call; the app batches a basket into several calls
const MAX_CHARS = 9000; // per page; search results above the fold fit easily
const ALLOWED_ORIGINS = [/^https:\/\/nourishcart(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.some((r) => r.test(origin))) return res.status(403).json({ error: 'origin not allowed' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'store reader not configured' });

  const pages = Array.isArray(req.body?.pages) ? req.body.pages : [];
  if (!pages.length || pages.length > MAX_PAGES) return res.status(400).json({ error: `send 1 to ${MAX_PAGES} pages` });
  const clean = [];
  for (const p of pages) {
    if (typeof p?.id !== 'string' || typeof p?.text !== 'string') return res.status(400).json({ error: 'each page needs id and text' });
    clean.push({ id: p.id.slice(0, 80), query: String(p.query ?? '').slice(0, 80), text: p.text.slice(0, MAX_CHARS) });
  }

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(clean) }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });
  let last = 'no model tried';
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body,
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) {
        last = `${model} returned ${r.status}`;
        if ([404, 429, 500, 502, 503].includes(r.status)) continue; // try the next model
        return res.status(502).json({ error: last });
      }
      const j = await r.json();
      const content = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      return res.status(200).json({ content, model, promptVersion: PROMPT_VERSION });
    } catch (e) {
      last = `${model} ${e?.name === 'TimeoutError' ? 'timed out' : 'failed'}`;
    }
  }
  return res.status(503).json({ error: `all models busy (${last})` });
}
