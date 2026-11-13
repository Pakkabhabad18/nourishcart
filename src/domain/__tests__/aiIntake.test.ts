// AI reader: the Vercel function's guards, prompt drift, and the browser-side checks.
import { readFileSync } from 'node:fs';
import { LLM_PROMPT_VERSION, SYSTEM_PROMPT } from '../intake/llm.ts';
import { aiAddedFields, readWithAi } from '../../lib/aiIntake.ts';
import { NOW } from '../../test/fixtures.ts';

// Loaded by path so TypeScript doesn't need types for the plain-JS function.
const FN_PATH = '../../../api/intake.js';

function fakeRes() {
  const r = { code: 0, body: undefined as unknown, status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; return r; } };
  return r;
}

describe('api/intake (Vercel function)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
  });

  it('uses exactly the prompt the evaluation tests', () => {
    const js = readFileSync('api/_intake-prompt.js', 'utf8');
    expect(js).toContain(JSON.stringify(SYSTEM_PROMPT));
    expect(js).toContain(JSON.stringify(LLM_PROMPT_VERSION));
  });

  it('refuses other websites, wrong methods, a missing key and oversized text', async () => {
    const { default: handler } = await import(/* @vite-ignore */ FN_PATH);
    let res = fakeRes();
    await handler({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { text: 'hi' } }, res);
    expect(res.code).toBe(403);
    res = fakeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.code).toBe(405);
    res = fakeRes();
    await handler({ method: 'POST', headers: {}, body: { text: 'hi' } }, res);
    expect(res.code).toBe(503);
    process.env.GROQ_API_KEY = 'test';
    res = fakeRes();
    await handler({ method: 'POST', headers: { origin: 'https://nourishcart.vercel.app' }, body: { text: 'x'.repeat(2001) } }, res);
    expect(res.code).toBe(413);
  });

  it('forwards the text with the system prompt and returns the raw answer', async () => {
    process.env.GROQ_API_KEY = 'test';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ageYears":{"value":30,"evidence":"30"}}' } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const { default: handler } = await import(/* @vite-ignore */ FN_PATH);
    const res = fakeRes();
    await handler({ method: 'POST', headers: { origin: 'http://localhost:5173' }, body: { text: 'I am 30' } }, res);
    expect(res.code).toBe(200);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(sent.messages[1].content).toBe('I am 30');
    expect(sent.temperature).toBe(0);
  });
});

describe('readWithAi (browser)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const said = "i'm 33, desk job, i can't have gluten, it makes me sick. vegetarian";

  it('keeps checked AI fields, rejects invented ones, and never loosens the diet', async () => {
    const answer = {
      ageYears: { value: 33, evidence: "i'm 33" },
      allergies: { value: ['gluten'], evidence: "can't have gluten" },
      dietPattern: { value: 'eggetarian', evidence: 'vegetarian' }, // looser than the rules' reading
      weightKg: { value: 70, evidence: 'weighs 70 kg' }, // not in the text: must be rejected
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: JSON.stringify(answer), model: 'm', promptVersion: 'p' }))));
    const r = (await readWithAi(said, NOW))!;
    expect(r.merged.ageYears?.value).toBe(33);
    expect(r.merged.allergies?.value).toEqual(['gluten']);
    expect(r.merged.dietPattern?.value).toBe('vegetarian');
    expect(r.merged.weightKg).toBeUndefined();
    expect(r.rejected.map((x) => x.field)).toContain('weightKg');
    expect(aiAddedFields(r)).toContain('allergies');
  });

  it('falls back to null (rules only) when the AI is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    expect(await readWithAi(said, NOW)).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await readWithAi(said, NOW)).toBeNull();
  });
});
