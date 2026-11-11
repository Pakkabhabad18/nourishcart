// Shared HTTP helpers for NourishCart Edge Functions.
// Every function: CORS, JWT check, JSON body limit, consistent envelope, no sensitive logs.
import { createClient } from './vendor/supabase-js.mjs';
type SupabaseClient = ReturnType<typeof createClient>;
type User = { id: string; email?: string };

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type ErrorCode = 'PROFILE_NOT_OWNED' | 'INPUT_INVALID' | 'INELIGIBLE_PROFILE' | 'DATA_NOT_VERIFIED' | 'BUDGET_EXCEEDED' | 'CATALOGUE_STALE' | 'RATE_LIMITED' | 'UNAUTHENTICATED' | 'CONFLICT' | 'INTERNAL_ERROR';

export function ok(data: unknown, requestId: string, methodVersion?: string): Response {
  return new Response(JSON.stringify({ data, error: null, meta: { requestId, methodVersion: methodVersion ?? null } }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function fail(status: number, code: ErrorCode, message: string, requestId: string, fieldErrors: unknown[] = []): Response {
  return new Response(JSON.stringify({ data: null, error: { code, message, requestId, fieldErrors }, meta: { requestId } }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export interface Ctx {
  requestId: string;
  user: User;
  /** Client acting as the caller: every query goes through RLS. */
  userDb: SupabaseClient;
  /** Service-role client for server-only writes (orders, calculation runs). Never returned to callers. */
  adminDb: SupabaseClient;
  body: Record<string, unknown>;
}

const MAX_BODY_BYTES = 16 * 1024;

export async function withAuth(req: Request, handler: (ctx: Ctx) => Promise<Response>): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'INPUT_INVALID', 'Use POST', requestId);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return fail(401, 'UNAUTHENTICATED', 'Sign in required', requestId);
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await userDb.auth.getUser(auth.slice(7));
  if (error || !data.user) return fail(401, 'UNAUTHENTICATED', 'Sign in required', requestId);
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return fail(413, 'INPUT_INVALID', 'Request too large', requestId);
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return fail(400, 'INPUT_INVALID', 'Body must be JSON', requestId);
  }
  const adminDb = createClient(url, service, { auth: { persistSession: false } });
  try {
    return await handler({ requestId, user: data.user, userDb, adminDb, body });
  } catch (e) {
    // Log only the request id and error class; never profile data, tokens or OTPs.
    console.error(JSON.stringify({ requestId, error: e instanceof Error ? e.name : 'unknown' }));
    return fail(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.', requestId);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** Loads a profile bundle through the caller's RLS client: unowned ids simply return null. */
export async function loadBundle(userDb: SupabaseClient, profileId: string) {
  const { bundleFromRows } = await import('./core/domain/persistence/mappers.ts');
  const [p, pref, act, bud] = await Promise.all([
    userDb.from('profiles').select('*').eq('id', profileId).maybeSingle(),
    userDb.from('profile_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
    userDb.from('activity_assessments').select('*').eq('profile_id', profileId).maybeSingle(),
    userDb.from('profile_budgets').select('*').eq('profile_id', profileId).maybeSingle(),
  ]);
  if (!p.data) return null;
  return bundleFromRows(p.data, pref.data, act.data, bud.data);
}
