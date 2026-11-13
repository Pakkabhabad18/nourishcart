// Browser side of the AI reader. Calls /api/intake (Vercel function -> Groq), then runs the
// model's answer through the two safety layers before the app uses any of it:
//   sanitiseLlmOutput: drops fields with invented evidence or values outside the allowed lists
//   mergeWithRules:    the result can never be less safe than the rule reader alone
// If the call fails for any reason (offline, demo preview, no key, timeout) we return null
// and the app carries on with the rule reader. The AI is an upgrade, never a dependency.
import { extractProfile, type Extraction } from '../domain/intake/extract.ts';
import { mergeWithRules, sanitiseLlmOutput } from '../domain/intake/llm.ts';

export interface AiReading {
  text: string; // the exact text that was read, so a stale result is never applied
  merged: Extraction;
  rules: Extraction;
  ai: Extraction; // what survived the checks
  rejected: { field: string; reason: string }[];
  model: string;
  promptVersion: string;
}

export const AI_CONSENT_KEY = 'nourishcart.aiIntakeConsent';

export async function readWithAi(text: string, now: Date, endpoint = '/api/intake'): Promise<AiReading | null> {
  try {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: string; model?: string; promptVersion?: string };
    if (typeof j.content !== 'string') return null;
    const checked = sanitiseLlmOutput(j.content, text);
    const rules = extractProfile(text, now);
    return { text, merged: mergeWithRules(rules, checked.extraction), rules, ai: checked.extraction, rejected: checked.dropped, model: j.model ?? 'unknown', promptVersion: j.promptVersion ?? 'unknown' };
  } catch {
    return null;
  }
}

/** Fields the AI filled that the rule reader missed: shown to the person as "added by AI". */
export function aiAddedFields(r: AiReading): string[] {
  const skip = new Set(['warnings', 'unknownFoods']);
  return Object.keys(r.merged).filter((k) => !skip.has(k) && (r.rules as unknown as Record<string, unknown>)[k] === undefined && (r.merged as unknown as Record<string, unknown>)[k] !== undefined);
}
