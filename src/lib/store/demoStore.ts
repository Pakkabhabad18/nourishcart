// DEMO MODE store. Runs the same domain engines as the Edge Functions, but keeps data in
// this browser's localStorage and delivers OTP codes to an on-screen "demo inbox" instead
// of sending email. It exists so reviewers can use the full product without a backend.
// It is clearly labelled in the UI and is not a security boundary.
import type { Profile, ProfileBundle } from '../../domain/types.ts';
import type { StoredCalculation, StoredPlan } from '../../domain/persistence/mappers.ts';
import { DATA_VERSION, weekStartOf } from '../../domain/persistence/mappers.ts';
import { calculateTargets } from '../../domain/nutrition/targets.ts';
import { generatePlanOptions, PLANNER_VERSION } from '../../domain/planning/plan.ts';
import { simulateCheckout, type SimulatedOrder, type StoredBasket } from '../../domain/orders/checkout.ts';
import { applyOrderToPantry, type PantryItem } from '../../domain/inventory/pantry.ts';
import { CAT } from '../catalog.ts';
import { emptyBundle, EMAIL_RE, type ConsentRecord, type NourishStore, type ScheduleRule, type Session } from './types.ts';

const KEY = 'nourishcart.demo.v1';
export const OTP_COOLDOWN_SEC = 60;
export const OTP_EXPIRY_SEC = 600;
const MAX_ATTEMPTS = 5;

interface UserData {
  profiles: Profile[];
  bundles: Record<string, ProfileBundle>;
  consents: ConsentRecord[];
  calculations: StoredCalculation[];
  plans: StoredPlan[];
  baskets: StoredBasket[];
  orders: SimulatedOrder[];
  pantry: PantryItem[];
  schedules: ScheduleRule[];
}

export interface DemoMail {
  id: string;
  to: string;
  code: string;
  sentAt: string;
  expiresAt: string;
}

interface DB {
  users: Record<string, string>; // email -> userId
  session: Session | null;
  otp: Record<string, { code: string; sentAt: number; expiresAt: number; attempts: number }>;
  inbox: DemoMail[];
  data: Record<string, UserData>;
}

const blank = (): UserData => ({ profiles: [], bundles: {}, consents: [], calculations: [], plans: [], baskets: [], orders: [], pantry: [], schedules: [] });

// In-memory fallback when storage is unavailable (private mode, sandboxed preview).
let memory: DB | null = null;
function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    if (memory) return memory;
  }
  return memory ?? { users: {}, session: null, otp: {}, inbox: [], data: {} };
}
function save(db: DB) {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* memory only */
  }
}

const uuid = () => crypto.randomUUID();
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export function demoInbox(): DemoMail[] {
  return [...load().inbox].reverse();
}
export const DEMO_MAIL_EVENT = 'nourishcart:demo-mail';

export class DemoStore implements NourishStore {
  mode = 'demo' as const;
  private listeners = new Set<(s: Session | null) => void>();

  private user(): { db: DB; d: UserData; s: Session } {
    const db = load();
    if (!db.session) throw new Error('Not signed in');
    db.data[db.session.userId] ??= blank();
    return { db, d: db.data[db.session.userId], s: db.session };
  }
  private ownedBundle(d: UserData, profileId: string): ProfileBundle {
    const b = d.bundles[profileId];
    if (!b) throw new Error('Profile not found');
    return b;
  }

  async getSession() {
    return load().session;
  }
  onAuthChange(cb: (s: Session | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit(s: Session | null) {
    this.listeners.forEach((l) => l(s));
  }

  async requestOtp(email: string) {
    await delay(300);
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return { ok: false as const, code: 'invalid_email' as const, message: 'Enter a valid email address.' };
    const db = load();
    const prev = db.otp[e];
    const now = Date.now();
    if (prev && now - prev.sentAt < OTP_COOLDOWN_SEC * 1000) {
      const wait = Math.ceil((OTP_COOLDOWN_SEC * 1000 - (now - prev.sentAt)) / 1000);
      return { ok: false as const, code: 'rate_limited' as const, message: `For security, you can request a new code in ${wait} seconds.`, retryAfterSec: wait };
    }
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const code = String(n[0] % 1_000_000).padStart(6, '0');
    db.otp[e] = { code, sentAt: now, expiresAt: now + OTP_EXPIRY_SEC * 1000, attempts: 0 };
    db.inbox.push({ id: uuid(), to: e, code, sentAt: new Date(now).toISOString(), expiresAt: new Date(now + OTP_EXPIRY_SEC * 1000).toISOString() });
    db.inbox = db.inbox.slice(-10);
    save(db);
    window.dispatchEvent(new Event(DEMO_MAIL_EVENT));
    return { ok: true as const };
  }

  async verifyOtp(email: string, token: string) {
    await delay(300);
    const e = email.trim().toLowerCase();
    const db = load();
    const o = db.otp[e];
    const generic = { ok: false as const, code: 'invalid_or_expired' as const, message: 'That code is incorrect or has expired. Check the latest email or request a new code.' };
    if (!o || Date.now() > o.expiresAt || o.attempts >= MAX_ATTEMPTS) return generic;
    if (o.code !== token.trim()) {
      o.attempts += 1;
      save(db);
      return generic;
    }
    delete db.otp[e];
    db.users[e] ??= uuid();
    const session = { userId: db.users[e], email: e };
    db.session = session;
    db.data[session.userId] ??= blank();
    save(db);
    this.emit(session);
    return { ok: true as const, session };
  }

  async signOut() {
    const db = load();
    db.session = null;
    save(db);
    this.emit(null);
  }

  async listProfiles() {
    await delay(60);
    return this.user().d.profiles;
  }
  async getBundle(profileId: string) {
    await delay(60);
    return this.user().d.bundles[profileId] ?? null;
  }
  async createProfile(displayName: string) {
    const { db, d, s } = this.user();
    const now = new Date().toISOString();
    const p: Profile = { id: uuid(), ownerUserId: s.userId, displayName: displayName.trim(), dateOfBirth: null, sex: null, heightCm: null, weightKg: null, archived: false, onboardingStep: 0, onboardingComplete: false, createdAt: now, updatedAt: now };
    d.profiles.push(p);
    d.bundles[p.id] = emptyBundle(p);
    save(db);
    return p;
  }
  async saveBundle(bundle: ProfileBundle) {
    const { db, d } = this.user();
    this.ownedBundle(d, bundle.profile.id);
    // Data minimisation mirrors the database: only the scope status is kept, not the condition.
    const stored: ProfileBundle = {
      ...bundle,
      profile: { ...bundle.profile, updatedAt: new Date().toISOString() },
      preferences: { ...bundle.preferences, clinicalFlags: bundle.preferences.clinicalFlags.length ? ['other_medical_condition'] : [] },
    };
    d.bundles[bundle.profile.id] = stored;
    d.profiles = d.profiles.map((p) => (p.id === bundle.profile.id ? stored.profile : p));
    save(db);
    return stored;
  }
  async setArchived(profileId: string, archived: boolean) {
    const { db, d } = this.user();
    const b = this.ownedBundle(d, profileId);
    b.profile = { ...b.profile, archived };
    d.profiles = d.profiles.map((p) => (p.id === profileId ? b.profile : p));
    save(db);
  }

  async listConsents() {
    return this.user().d.consents;
  }
  async setConsent(purpose: ConsentRecord['purpose'], accepted: boolean) {
    const { db, d } = this.user();
    const now = new Date().toISOString();
    d.consents.filter((c) => c.purpose === purpose && !c.withdrawnAt).forEach((c) => (c.withdrawnAt = now));
    if (accepted) d.consents.push({ id: uuid(), purpose, noticeVersion: 'privacy-notice-2026-11-v1', accepted, acceptedAt: now, withdrawnAt: null });
    save(db);
  }

  async calculate(profileId: string) {
    await delay(200);
    const { db, d, s } = this.user();
    const r = calculateTargets(this.ownedBundle(d, profileId));
    if (!r.ok) return { ok: false as const, eligibility: r.eligibility };
    const c: StoredCalculation = { id: uuid(), profileId, ownerUserId: s.userId, record: r.record, createdAt: new Date().toISOString() };
    d.calculations.push(c);
    save(db);
    return { ok: true as const, calculation: c };
  }
  async latestCalculation(profileId: string) {
    const list = this.user().d.calculations.filter((c) => c.profileId === profileId);
    return list[list.length - 1] ?? null;
  }
  async generatePlans(profileId: string) {
    await delay(350);
    const { db, d, s } = this.user();
    const bundle = this.ownedBundle(d, profileId);
    const t = calculateTargets(bundle);
    if (!t.ok) return { ok: false as const, reasons: ['Complete your profile first.'] };
    const now = new Date().toISOString();
    const run: StoredCalculation = { id: uuid(), profileId, ownerUserId: s.userId, record: t.record, createdAt: now };
    d.calculations.push(run);
    const targets = { energyKcal: t.record.planningEnergyKcal, proteinEarG: t.record.protein.earG, proteinRdaG: t.record.protein.rdaG };
    const gen = generatePlanOptions(bundle, targets, CAT);
    if (!gen.ok) {
      save(db);
      return { ok: false as const, reasons: gen.reasons };
    }
    d.plans.forEach((p) => p.profileId === profileId && p.status === 'proposed' && (p.status = 'archived'));
    const generationId = uuid();
    const plans: StoredPlan[] = gen.plans.map((draft) => ({
      id: uuid(), profileId, ownerUserId: s.userId, calculationRunId: run.id, optionKey: draft.optionKey, generationId, weekStart: weekStartOf(new Date()), status: 'proposed',
      draft, patch: {}, targets, version: 1, plannerVersion: PLANNER_VERSION, dataVersion: DATA_VERSION, createdAt: now, updatedAt: now,
    }));
    d.plans.push(...plans);
    save(db);
    return { ok: true as const, plans };
  }
  async listPlans(profileId: string) {
    return this.user().d.plans.filter((p) => p.profileId === profileId && p.status !== 'archived');
  }
  async selectPlan(planId: string) {
    const { db, d } = this.user();
    const plan = d.plans.find((p) => p.id === planId);
    if (!plan) throw new Error('Plan not found');
    d.plans.forEach((p) => {
      if (p.profileId === plan.profileId && p.status === 'selected') p.status = 'archived';
    });
    plan.status = 'selected';
    plan.updatedAt = new Date().toISOString();
    save(db);
    return plan;
  }
  async savePlan(plan: StoredPlan) {
    const { db, d } = this.user();
    const i = d.plans.findIndex((p) => p.id === plan.id && p.ownerUserId === plan.ownerUserId);
    if (i < 0) throw new Error('Plan not found');
    const next = { ...plan, version: d.plans[i].version + 1, updatedAt: new Date().toISOString() };
    d.plans[i] = next;
    save(db);
    return next;
  }

  async getActiveBasket(profileId: string) {
    const list = this.user().d.baskets.filter((b) => b.profileId === profileId && b.status !== 'SIMULATED_ORDER' && b.status !== 'EXPIRED');
    return list[list.length - 1] ?? null;
  }
  async saveBasket(basket: StoredBasket) {
    const { db, d } = this.user();
    this.ownedBundle(d, basket.profileId);
    const i = d.baskets.findIndex((b) => b.id === basket.id);
    const next = { ...basket, updatedAt: new Date().toISOString() };
    if (i < 0) d.baskets.push(next);
    else d.baskets[i] = next;
    save(db);
    return next;
  }
  async checkout(basketId: string, version: number, opts: { simulateFailure?: boolean }) {
    await delay(700);
    const { db, d } = this.user();
    const basket = d.baskets.find((b) => b.id === basketId);
    if (!basket) return { ok: false as const, code: 'NOT_FOUND', message: 'Basket not found' };
    const r = simulateCheckout({ basket, expectedVersion: version, explicitConfirm: true, online: navigator.onLine, products: CAT.products, existingOrders: d.orders, newId: uuid, now: new Date(), simulateFailure: opts.simulateFailure });
    if (!r.ok) {
      if (r.order) d.orders.push({ ...r.order, idempotencyKey: `${r.order.idempotencyKey}:failed:${r.order.id}` });
      save(db);
      return { ok: false as const, code: r.error, message: r.message };
    }
    if (!r.duplicate) {
      d.orders.push(r.order);
      basket.status = 'SIMULATED_ORDER';
      const mine = d.pantry.filter((p) => p.profileId === basket.profileId);
      const others = d.pantry.filter((p) => p.profileId !== basket.profileId);
      d.pantry = [...others, ...applyOrderToPantry(r.order, mine, CAT, uuid)];
      save(db);
    }
    return { ok: true as const, order: r.order, duplicate: r.duplicate };
  }
  async listOrders() {
    return [...this.user().d.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listPantry(profileId: string) {
    return this.user().d.pantry.filter((p) => p.profileId === profileId);
  }
  async savePantryItem(item: PantryItem) {
    const { db, d } = this.user();
    this.ownedBundle(d, item.profileId);
    const i = d.pantry.findIndex((p) => p.id === item.id);
    const dup = d.pantry.findIndex((p) => p.profileId === item.profileId && p.ingredientId === item.ingredientId && p.id !== item.id);
    if (dup >= 0) d.pantry.splice(dup, 1);
    const clean = { ...item, quantity: Math.max(0, item.quantity) };
    if (i < 0) d.pantry.push(clean);
    else d.pantry[d.pantry.findIndex((p) => p.id === item.id)] = clean;
    save(db);
    return clean;
  }
  async deletePantryItem(id: string) {
    const { db, d } = this.user();
    d.pantry = d.pantry.filter((p) => p.id !== id);
    save(db);
  }

  async getScheduleRule(profileId: string) {
    return this.user().d.schedules.find((s) => s.profileId === profileId) ?? null;
  }
  async saveScheduleRule(rule: ScheduleRule) {
    const { db, d } = this.user();
    d.schedules = [...d.schedules.filter((s) => s.profileId !== rule.profileId), rule];
    save(db);
  }

  async exportData() {
    const { d, s } = this.user();
    return { exportedAt: new Date().toISOString(), account: { email: s.email }, ...d };
  }
  async deleteAccount() {
    const db = load();
    if (!db.session) return;
    delete db.data[db.session.userId];
    delete db.users[db.session.email];
    db.session = null;
    save(db);
    this.emit(null);
  }
}
