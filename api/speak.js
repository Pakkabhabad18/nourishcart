// Vercel serverless function: POST /api/speak  { text, language: 'en' | 'hi' | 'te' }  ->  { audios: [base64 mp3, ...] }
// Turns text into natural Indian-language speech with Sarvam AI's Bulbul v4 Flash
// (model "bulbul:v4-flash"; v3 is deliberately not used). Used for Nutrion's voice in the
// setup conversation and for reading the cook's menu aloud.
// Only the text to be spoken is sent. If SARVAM_API_KEY isn't set, it answers 503 and the
// app falls back to the browser's built-in voice.

const MODEL = 'bulbul:v4-flash';
const MAX_CHARS = 2400; // Sarvam REST limit is 2,500 characters per request
// v4 Flash speaker IDs from Sarvam's voice catalogue (lowercase, case-sensitive).
const VOICES = {
  en: { code: 'en-IN', speaker: 'simran_en_customer' },
  hi: { code: 'hi-IN', speaker: 'simran_hi_assistant' },
  te: { code: 'te-IN', speaker: 'kavitha_te_conversation' },
};
const ALLOWED_ORIGINS = [/^https:\/\/nourishcart(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

/** Splits long text at sentence ends so each request stays under the limit. */
function chunks(text) {
  const out = [];
  let cur = '';
  for (const part of text.split(/(?<=[.!?।\n])\s+/)) {
    if ((cur + ' ' + part).length > MAX_CHARS && cur) {
      out.push(cur.trim());
      cur = part;
    } else cur = cur ? `${cur} ${part}` : part;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > MAX_CHARS ? c.match(new RegExp(`.{1,${MAX_CHARS}}`, 'gs')) : [c]));
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.some((r) => r.test(origin))) return res.status(403).json({ error: 'origin not allowed' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.SARVAM_API_KEY) return res.status(503).json({ error: 'voice not configured' });
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const voice = VOICES[req.body?.language] ?? VOICES.en;
  if (!text) return res.status(400).json({ error: 'send text' });
  if (text.length > 8000) return res.status(413).json({ error: 'text too long' });
  try {
    const audios = [];
    for (const part of chunks(text)) {
      const r = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': process.env.SARVAM_API_KEY },
        body: JSON.stringify({ text: part, language_code: voice.code, speaker: voice.speaker, model: MODEL, pace: 1, output_audio_codec: 'mp3' }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return res.status(502).json({ error: `voice provider returned ${r.status}`, detail: (await r.text()).slice(0, 300) });
      const j = await r.json();
      if (!Array.isArray(j.audios) || !j.audios.length) return res.status(502).json({ error: 'voice provider sent no audio' });
      audios.push(...j.audios);
    }
    return res.status(200).json({ audios, model: MODEL, format: 'mp3' });
  } catch (e) {
    return res.status(504).json({ error: e?.name === 'TimeoutError' ? 'voice timed out' : 'voice call failed' });
  }
}
