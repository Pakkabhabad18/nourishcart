// Integration tests against the LOCAL Supabase stack. They exercise the real Auth
// email-OTP flow through Mailpit, RLS ownership rules and the Edge Functions.
// Prerequisites: `npm run sb:start`, `npx supabase functions serve`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SB_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SB_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'; // local-only default key
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

async function latestCode(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`);
    const j = (await res.json()) as { messages: { ID: string }[] };
    if (j.messages?.length) {
      const m = (await (await fetch(`${MAILPIT}/api/v1/message/${j.messages[0].ID}`)).json()) as { Text: string; HTML: string; Subject: string };
      expect(m.Subject).toBe('Your NourishCart sign-in code');
      const code = /(\d{6})/.exec(m.HTML.replace(/<[^>]+>/g, ' '))?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('No OTP email arrived in Mailpit');
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  expect(error).toBeNull();
  const code = await latestCode(email);
  const v = await c.auth.verifyOtp({ email, token: code, type: 'email' });
  expect(v.error).toBeNull();
  expect(v.data.session?.access_token).toBeTruthy();
  return c;
}

const stamp = Date.now();
let A: SupabaseClient;
let B: SupabaseClient;
let aId: string;
let profileA: string;

async function call(c: SupabaseClient, fn: string, body: unknown) {
  const { data: s } = await c.auth.getSession();
  const res = await fetch(`${URL}/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${s.session!.access_token}` }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as { data: any; error: any; meta: any } };
}

beforeAll(async () => {
  A = await signIn(`int-a-${stamp}@example.com`);
  B = await signIn(`int-b-${stamp}@example.com`);
  aId = (await A.auth.getUser()).data.user!.id;
});

describe('email OTP (Supabase Auth + Mailpit)', () => {
  it('rejects a wrong code with a generic error', async () => {
    const email = `int-c-${stamp}@example.com`;
    const c = createClient(URL, KEY, { auth: { persistSession: false } });
    await c.auth.signInWithOtp({ email });
    await latestCode(email);
    const v = await c.auth.verifyOtp({ email, token: '000000', type: 'email' });
    expect(v.error?.code).toBe('otp_expired');
  });
  it('throttles a second request inside the cooldown', async () => {
    const email = `int-d-${stamp}@example.com`;
    const c = createClient(URL, KEY, { auth: { persistSession: false } });
    await c.auth.signInWithOtp({ email });
    const again = await c.auth.signInWithOtp({ email });
    expect(again.error?.code).toBe('over_email_send_rate_limit');
  });
  it('signs out', async () => {
    const c = await signIn(`int-e-${stamp}@example.com`);
    await c.auth.signOut();
    expect((await c.auth.getSession()).data.session).toBeNull();
  });
});

describe('profiles and RLS', () => {
  it('owner creates a profile with settings', async () => {
    const p = await A.from('profiles').insert({ display_name: 'Demo Asha', date_of_birth: '2000-05-14', sex: 'female', height_cm: 162, weight_kg: 58, onboarding_complete: true }).select().single();
    expect(p.error).toBeNull();
    profileA = p.data.id;
    for (const [t, row] of [
      ['profile_preferences', { profile_id: profileA, diet_pattern: 'eggetarian', goal: 'muscle_fitness', hard_exclusions: ['okra'], allergies_confirmed: true, clinical_scope: 'none_confirmed', meals_per_day: 4 }],
      ['activity_assessments', { profile_id: profileA, occupation: 'sedentary', movement: 'medium', workouts_per_week: 3, workout_type: 'strength', workout_minutes: 45, intensity: 'moderate' }],
      ['profile_budgets', { profile_id: profileA, amount_inr: 1500, period: 'weekly', mode: 'hard' }],
    ] as const) {
      expect((await A.from(t).insert(row)).error).toBeNull();
    }
  });
  it('another account cannot read, update or attach rows to it', async () => {
    expect((await B.from('profiles').select('*').eq('id', profileA)).data).toEqual([]);
    const upd = await B.from('profiles').update({ display_name: 'hacked' }).eq('id', profileA).select();
    expect(upd.data).toEqual([]);
    const attach = await B.from('pantry_items').insert({ profile_id: profileA, ingredient_id: 'rice', name: 'Rice', quantity: 1, unit: 'g' });
    expect(attach.error?.code).toBe('42501');
    const spoof = await B.from('profiles').insert({ display_name: 'x', owner_user_id: aId });
    expect(spoof.error?.code).toBe('42501');
  });
  it('rejects under-18 dates of birth at the database level', async () => {
    const r = await A.from('profiles').insert({ display_name: 'Kid', date_of_birth: '2015-01-01' });
    expect(r.error?.code).toBe('23514');
  });
  it('clients cannot write orders or calculation runs directly', async () => {
    const o = await A.from('orders').insert({ owner_user_id: aId, profile_id: profileA, basket_id: profileA, basket_version: 1, idempotency_key: 'x', status: 'CONFIRMED', total_inr: 1, receipt: {} });
    expect(o.error?.code).toBe('42501');
    const c = await A.from('calculation_runs').insert({ profile_id: profileA, owner_user_id: aId, calculator_id: 'x', method_version: 'x', method_status: 'x', input_snapshot: {}, output: {}, confidence: 'x' });
    expect(c.error?.code).toBe('42501');
  });
  it('anonymous key reads nothing', async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    const r = await anon.from('profiles').select('*');
    expect(r.data ?? []).toEqual([]);
  });
});

describe('edge functions', () => {
  it('reject a missing JWT', async () => {
    const r = await fetch(`${URL}/functions/v1/calculate-targets`, { method: 'POST', body: '{}' });
    expect(r.status).toBe(401);
  });
  it('validate input and ownership', async () => {
    expect((await call(A, 'calculate-targets', { profileId: 'nope' })).json.error.code).toBe('INPUT_INVALID');
    const other = await call(B, 'calculate-targets', { profileId: profileA });
    expect(other.status).toBe(404);
    expect(other.json.error.code).toBe('PROFILE_NOT_OWNED');
  });
  it('calculate-targets persists a provisional record', async () => {
    const r = await call(A, 'calculate-targets', { profileId: profileA });
    expect(r.json.data.ok).toBe(true);
    expect(r.json.data.calculation.record.methodStatus).toBe('provisional_demo');
    expect(r.json.meta.requestId).toBeTruthy();
    const runs = await A.from('calculation_runs').select('id').eq('profile_id', profileA);
    expect(runs.data!.length).toBeGreaterThan(0);
  });

  let basketId = '';
  it('generate-plan-options returns three plans and they persist', async () => {
    const r = await call(A, 'generate-plan-options', { profileId: profileA });
    expect(r.json.data.plans).toHaveLength(3);
    const rows = await A.from('meal_plans').select('id, option_key, status').eq('profile_id', profileA).eq('status', 'proposed');
    expect(rows.data!.map((x) => x.option_key).sort()).toEqual(['balanced', 'budget', 'goal']);
    // Build an approved basket from the budget plan using the shared domain code.
    const { runPipeline } = await import('../../src/domain/pipeline.ts');
    const { bundleFromRows } = await import('../../src/domain/persistence/mappers.ts');
    const { CAT } = await import('../../src/test/fixtures.ts');
    const [p, pref, act, bud] = await Promise.all(['profiles', 'profile_preferences', 'activity_assessments', 'profile_budgets'].map((t) => A.from(t).select('*').eq(t === 'profiles' ? 'id' : 'profile_id', profileA).single()));
    const bundle = bundleFromRows(p.data, pref.data, act.data, bud.data);
    const budget = r.json.data.plans.find((x: any) => x.optionKey === 'budget');
    const res = runPipeline({ bundle, plan: budget.draft, targets: budget.targets, patch: {}, pantry: [], cat: CAT });
    const ins = await A.from('baskets').insert({ profile_id: profileA, plan_id: budget.id, status: 'APPROVED', version: 2, approved_version: 2, approved_at: new Date().toISOString(), lines: res.basket.lines, total_inr: res.basket.totalInr, budget_inr: 1500, budget_mode: 'hard' }).select().single();
    expect(ins.error).toBeNull();
    basketId = ins.data.id;
  });
  it('simulate-checkout requires explicit confirmation and the approved version', async () => {
    expect((await call(A, 'simulate-checkout', { basketId, basketVersion: 2 })).json.error.code).toBe('INPUT_INVALID');
    expect((await call(A, 'simulate-checkout', { basketId, basketVersion: 1, explicitConfirm: true })).json.error.fieldErrors[0].code).toBe('BASKET_VERSION_CHANGED');
    expect((await call(B, 'simulate-checkout', { basketId, basketVersion: 2, explicitConfirm: true })).status).toBe(404);
  });
  it('a failed simulated checkout leaves the pantry untouched', async () => {
    const r = await call(A, 'simulate-checkout', { basketId, basketVersion: 2, explicitConfirm: true, simulateFailure: true });
    expect(r.status).toBe(502);
    expect((await A.from('pantry_items').select('id').eq('profile_id', profileA)).data).toEqual([]);
  });
  it('confirms once, is idempotent, and updates the pantry', async () => {
    const first = await call(A, 'simulate-checkout', { basketId, basketVersion: 2, explicitConfirm: true });
    expect(first.json.data.order.status).toBe('CONFIRMED');
    expect(first.json.data.order.label).toMatch(/NO PAYMENT TAKEN/);
    const second = await call(A, 'simulate-checkout', { basketId, basketVersion: 2, explicitConfirm: true });
    expect(second.json.data.duplicate).toBe(true);
    expect(second.json.data.order.id).toBe(first.json.data.order.id);
    const orders = await A.from('orders').select('id, status').eq('basket_id', basketId).eq('status', 'CONFIRMED');
    expect(orders.data).toHaveLength(1);
    expect((await B.from('orders').select('id')).data).toEqual([]);
    const pantry = await A.from('pantry_items').select('ingredient_id, quantity').eq('profile_id', profileA);
    expect(pantry.data!.length).toBeGreaterThan(5);
  });
  it('delete-account-data removes the account and cascades owned rows', async () => {
    const tmp = await signIn(`int-del-${stamp}@example.com`);
    await tmp.from('profiles').insert({ display_name: 'Temp' });
    expect((await call(tmp, 'delete-account-data', { confirmationPhrase: 'nope' })).json.error.code).toBe('INPUT_INVALID');
    const r = await call(tmp, 'delete-account-data', { confirmationPhrase: 'DELETE' });
    expect(r.json.data.deleted).toBe(true);
  });
});
