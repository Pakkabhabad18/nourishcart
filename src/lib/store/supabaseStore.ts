// SUPABASE MODE store: email OTP through Supabase Auth, data through PostgREST with RLS,
// trusted operations through Edge Functions. Only the publishable/anon key is used here.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfileBundle } from '../../domain/types.ts';
import {
  basketFromRow, basketToRow, bundleFromRows, bundleToRows, calculationFromRow, orderFromRow, pantryFromRow, pantryToRow, planFromRow, planToRow, profileFromRow, profileToRow,
  type StoredCalculation, type StoredPlan,
} from '../../domain/persistence/mappers.ts';
import type { StoredBasket } from '../../domain/orders/checkout.ts';
import type { MealCheckin } from '../../domain/progress/progress.ts';
import type { PantryItem } from '../../domain/inventory/pantry.ts';
import { NOTICE_VERSION, type ConsentRecord, type NourishStore, type OtpRequestResult, type OtpVerifyResult, type ScheduleRule, type Session } from './types.ts';

export class SupabaseStore implements NourishStore {
  mode = 'supabase' as const;
  db: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }

  private async uid(): Promise<string> {
    const { data } = await this.db.auth.getSession();
    if (!data.session) throw new Error('Not signed in');
    return data.session.user.id;
  }

  private async fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.functions.invoke(name, { body });
    if (error) {
      let msg = 'Something went wrong. Please try again.';
      let code = 'INTERNAL_ERROR';
      let detail: string | undefined;
      try {
        const j = await (error as { context?: Response }).context?.json();
        msg = j?.error?.message ?? msg;
        code = j?.error?.code ?? code;
        detail = j?.error?.fieldErrors?.[0]?.code;
      } catch {
        /* network error */
      }
      throw Object.assign(new Error(msg), { code, detail });
    }
    return (data as { data: T }).data;
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.db.auth.getSession();
    return data.session ? { userId: data.session.user.id, email: data.session.user.email ?? '' } : null;
  }
  onAuthChange(cb: (s: Session | null) => void) {
    const { data } = this.db.auth.onAuthStateChange((_e, s) => cb(s ? { userId: s.user.id, email: s.user.email ?? '' } : null));
    return () => data.subscription.unsubscribe();
  }

  async requestOtp(email: string): Promise<OtpRequestResult> {
    try {
      // The email server can stall (a wrong SMTP port made Supabase wait ~60 s and then
      // return 504). Give up after 25 s so the button never spins forever.
      const TIMEOUT = Symbol('timeout');
      const res = await Promise.race([
        this.db.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } }),
        new Promise<typeof TIMEOUT>((ok) => setTimeout(() => ok(TIMEOUT), 25_000)),
      ]);
      if (res === TIMEOUT) {
        return { ok: false, code: 'unknown', message: 'Our email service is slow right now. Wait a minute, then tap "Email me a code" again. A code may still arrive, so check your inbox too.' };
      }
      const { error } = res;
      if (!error) return { ok: true };
      // 5xx = our email sender failed, not the person's fault.
      if (error.status && error.status >= 500) {
        return { ok: false, code: 'unknown', message: 'We could not send the email just now. Please try again in a minute.' };
      }
      if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
        const wait = Number(/(\d+) seconds?/.exec(error.message)?.[1] ?? 60);
        return { ok: false, code: 'rate_limited', message: `For security, you can request a new code in ${wait} seconds.`, retryAfterSec: wait };
      }
      if (error.code === 'email_address_invalid' || error.code === 'validation_failed') return { ok: false, code: 'invalid_email', message: 'Enter a valid email address.' };
      // Generic message: never reveal whether an address is registered.
      return { ok: false, code: 'unknown', message: 'We could not send a code right now. Please try again in a minute.' };
    } catch {
      return { ok: false, code: 'network', message: 'No connection. Check your internet and try again.' };
    }
  }
  async verifyOtp(email: string, token: string): Promise<OtpVerifyResult> {
    try {
      const { data, error } = await this.db.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
      if (error || !data.session) {
        if (error?.status === 429) return { ok: false, code: 'rate_limited', message: 'Too many attempts. Wait a few minutes and try again.' };
        return { ok: false, code: 'invalid_or_expired', message: 'That code is incorrect or has expired. Check the latest email or request a new code.' };
      }
      return { ok: true, session: { userId: data.session.user.id, email: data.session.user.email ?? '' } };
    } catch {
      return { ok: false, code: 'network', message: 'No connection. Check your internet and try again.' };
    }
  }
  async signOut() {
    await this.db.auth.signOut();
  }

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.db.from('profiles').select('*').order('created_at');
    if (error) throw error;
    return data.map(profileFromRow);
  }
  async getBundle(profileId: string) {
    const [p, pref, act, bud] = await Promise.all([
      this.db.from('profiles').select('*').eq('id', profileId).maybeSingle(),
      this.db.from('profile_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
      this.db.from('activity_assessments').select('*').eq('profile_id', profileId).maybeSingle(),
      this.db.from('profile_budgets').select('*').eq('profile_id', profileId).maybeSingle(),
    ]);
    if (p.error) throw p.error;
    return p.data ? bundleFromRows(p.data, pref.data, act.data, bud.data) : null;
  }
  async createProfile(displayName: string) {
    const { data, error } = await this.db.from('profiles').insert({ display_name: displayName.trim() }).select().single();
    if (error) throw error;
    return profileFromRow(data);
  }
  async saveBundle(bundle: ProfileBundle) {
    const row = profileToRow(bundle.profile);
    const { error } = await this.db.from('profiles').update({ ...row, archived_at: bundle.profile.archived ? new Date().toISOString() : null }).eq('id', bundle.profile.id);
    if (error) throw error;
    const rows = bundleToRows(bundle);
    const writes: [string, Record<string, unknown>][] = [['profile_preferences', { ...rows.preferences }], ['activity_assessments', { ...rows.activity }], ['profile_budgets', { ...rows.budget }]];
    for (const [table, r] of writes) {
      const res = await this.db.from(table).upsert(r, { onConflict: 'profile_id' });
      if (res.error) throw res.error;
    }
    return (await this.getBundle(bundle.profile.id))!;
  }
  async setArchived(profileId: string, archived: boolean) {
    const { error } = await this.db.from('profiles').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', profileId);
    if (error) throw error;
  }

  async listConsents(): Promise<ConsentRecord[]> {
    const { data, error } = await this.db.from('consent_records').select('*').order('accepted_at');
    if (error) throw error;
    return data.map((r) => ({ id: r.id, purpose: r.purpose, noticeVersion: r.notice_version, accepted: r.accepted, acceptedAt: r.accepted_at, withdrawnAt: r.withdrawn_at }));
  }
  async setConsent(purpose: ConsentRecord['purpose'], accepted: boolean) {
    await this.db.from('consent_records').update({ withdrawn_at: new Date().toISOString() }).eq('purpose', purpose).is('withdrawn_at', null);
    if (accepted) {
      const { error } = await this.db.from('consent_records').insert({ purpose, notice_version: NOTICE_VERSION, accepted });
      if (error) throw error;
    }
  }

  async calculate(profileId: string) {
    return this.fn<{ ok: true; calculation: StoredCalculation } | { ok: false; eligibility: never }>('calculate-targets', { profileId });
  }
  async latestCalculation(profileId: string) {
    const { data } = await this.db.from('calculation_runs').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data ? calculationFromRow(data) : null;
  }
  async generatePlans(profileId: string) {
    return this.fn<{ ok: true; plans: StoredPlan[] } | { ok: false; reasons: string[] }>('generate-plan-options', { profileId });
  }
  async listPlans(profileId: string) {
    const { data, error } = await this.db.from('meal_plans').select('*').eq('profile_id', profileId).neq('status', 'archived').order('created_at');
    if (error) throw error;
    return data.map(planFromRow);
  }
  async selectPlan(planId: string) {
    const { data: plan } = await this.db.from('meal_plans').select('*').eq('id', planId).single();
    await this.db.from('meal_plans').update({ status: 'archived' }).eq('profile_id', plan.profile_id).eq('status', 'selected');
    const { data, error } = await this.db.from('meal_plans').update({ status: 'selected' }).eq('id', planId).select().single();
    if (error) throw error;
    return planFromRow(data);
  }
  async savePlan(plan: StoredPlan) {
    const { data, error } = await this.db.from('meal_plans').update({ ...planToRow(plan), version: plan.version + 1 }).eq('id', plan.id).select().single();
    if (error) throw error;
    return planFromRow(data);
  }

  async getActiveBasket(profileId: string) {
    const { data } = await this.db.from('baskets').select('*').eq('profile_id', profileId).not('status', 'in', '("SIMULATED_ORDER","EXPIRED")').order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data ? basketFromRow(data) : null;
  }
  async saveBasket(basket: StoredBasket) {
    const { data, error } = await this.db.from('baskets').upsert(basketToRow(basket)).select().single();
    if (error) throw error;
    return basketFromRow(data);
  }
  async checkout(basketId: string, version: number, opts: { simulateFailure?: boolean }) {
    try {
      const r = await this.fn<{ order: never; duplicate: boolean }>('simulate-checkout', { basketId, basketVersion: version, explicitConfirm: true, simulateFailure: opts.simulateFailure === true });
      return { ok: true as const, order: r.order, duplicate: r.duplicate };
    } catch (e) {
      const err = e as Error & { code?: string; detail?: string };
      return { ok: false as const, code: err.detail ?? err.code ?? 'INTERNAL_ERROR', message: err.message };
    }
  }
  async listOrders() {
    const { data, error } = await this.db.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(orderFromRow);
  }

  async listPantry(profileId: string) {
    const { data, error } = await this.db.from('pantry_items').select('*').eq('profile_id', profileId).order('name');
    if (error) throw error;
    return data.map(pantryFromRow);
  }
  async savePantryItem(item: PantryItem) {
    const { data, error } = await this.db.from('pantry_items').upsert(pantryToRow(item), { onConflict: 'profile_id,ingredient_id' }).select().single();
    if (error) throw error;
    return pantryFromRow(data);
  }
  async deletePantryItem(id: string) {
    const { error } = await this.db.from('pantry_items').delete().eq('id', id);
    if (error) throw error;
  }

  async listCheckins(profileId: string, fromDay: string): Promise<MealCheckin[]> {
    const { data, error } = await this.db.from('meal_checkins').select('*').eq('profile_id', profileId).gte('day', fromDay).order('day');
    if (error) throw error;
    return data.map((r) => ({ id: r.id, profileId: r.profile_id, day: r.day, slot: r.slot, status: r.status, recipeId: r.recipe_id, servings: r.servings == null ? null : Number(r.servings), kcal: r.kcal, proteinG: r.protein_g == null ? null : Number(r.protein_g), createdAt: r.created_at }));
  }
  async saveCheckin(c: MealCheckin) {
    const { error } = await this.db
      .from('meal_checkins')
      .upsert({ id: c.id, profile_id: c.profileId, day: c.day, slot: c.slot, status: c.status, recipe_id: c.recipeId, servings: c.servings, kcal: c.kcal == null ? null : Math.round(c.kcal), protein_g: c.proteinG }, { onConflict: 'profile_id,day,slot' });
    if (error) throw error;
    return c;
  }
  async deleteCheckin(id: string) {
    const { error } = await this.db.from('meal_checkins').delete().eq('id', id);
    if (error) throw error;
  }

  async getScheduleRule(profileId: string): Promise<ScheduleRule | null> {
    const { data } = await this.db.from('scheduled_rules').select('*').eq('profile_id', profileId).maybeSingle();
    return data ? { profileId, enabled: data.enabled, weekday: data.weekday, maxSpendInr: data.max_spend_inr == null ? null : Number(data.max_spend_inr), consentAt: data.consent_at, lastPreparedAt: data.last_prepared_at } : null;
  }
  async saveScheduleRule(rule: ScheduleRule) {
    const { error } = await this.db.from('scheduled_rules').upsert({ profile_id: rule.profileId, enabled: rule.enabled, weekday: rule.weekday, max_spend_inr: rule.maxSpendInr, consent_at: rule.consentAt, last_prepared_at: rule.lastPreparedAt }, { onConflict: 'profile_id' });
    if (error) throw error;
  }

  async exportData() {
    const uid = await this.uid();
    const tables = ['profiles', 'meal_checkins', 'profile_preferences', 'activity_assessments', 'profile_budgets', 'calculation_runs', 'meal_plans', 'baskets', 'orders', 'pantry_items', 'scheduled_rules', 'consent_records'];
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), userId: uid };
    for (const t of tables) out[t] = (await this.db.from(t).select('*')).data;
    return out;
  }
  async deleteAccount() {
    await this.fn('delete-account-data', { confirmationPhrase: 'DELETE' });
    await this.db.auth.signOut();
  }
}
