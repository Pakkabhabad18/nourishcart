// Vercel serverless function: POST /api/label  { image: <base64 JPEG/PNG>, mime }  ->  { content, model, promptVersion }
//
// Sends a photo of a packaged-food label to Gemini, which only transcribes it (ingredients,
// allergen statements, veg mark). The browser then decides per person with fixed word lists
// (src/domain/labels/check.ts). The photo is of a product, not a person; nothing about the
// household is sent. Config: GEMINI_API_KEY (required), GEMINI_MODELS (optional fallback list).
import { PROMPT_VERSION, SYSTEM_PROMPT } from './_label-prompt.js';

const MODELS = (process.env.GEMINI_MODELS || 'gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.8-flash').split(',').map((m) => m.trim()).filter(Boolean);
const MAX_BASE64 = 3_500_000; // about 2.6 MB of image; the app resizes photos to well under this
const ALLOWED_ORIGINS = [/^https:\/\/nourishcart(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.some((r) => r.test(origin))) return res.status(403).json({ error: 'origin not allowed' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'label reader not configured' });
  const image = typeof req.body?.image === 'string' ? req.body.image : '';
  const mime = MIMES.includes(req.body?.mime) ? req.body.mime : '';
  if (!image || !mime) return res.status(400).json({ error: 'send image (base64) and mime' });
  if (image.length > MAX_BASE64) return res.status(413).json({ error: 'image too large' });

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: image } }, { text: 'Transcribe this label.' }] }],
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
        if ([404, 429, 500, 502, 503].includes(r.status)) continue;
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
