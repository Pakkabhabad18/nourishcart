// The single data-access interface the UI talks to. Two implementations:
//  - DemoStore: browser storage + simulated email inbox (no backend; used for review previews)
//  - SupabaseStore: Supabase Auth (email OTP), PostgREST + RLS, Edge Functions
import type { Profile, ProfileBundle } from '../../domain/types.ts';
import type { StoredCalculation, StoredPlan } from '../../domain/persistence/mappers.ts';
import type { EligibilityResult } from '../../domain/nutrition/eligibility.ts';
import type { StoredBasket, SimulatedOrder } from '../../domain/orders/checkout.ts';
import type { PantryItem } from '../../domain/inventory/pantry.ts';

export interface Session {
  userId: string;
  email: string;
}

export type OtpRequestResult = { ok: true } | { ok: false; code: 'rate_limited' | 'invalid_email' | 'network' | 'unknown'; message: string; retryAfterSec?: number };
export type OtpVerifyResult = { ok: true; session: Session } | { ok: false; code: 'invalid_or_expired' | 'rate_limited' | 'network' | 'unknown'; message: string };

export interface ConsentRecord {
  id: string;
  purpose: 'profile_processing' | 'analytics' | 'retailer_linking';
  noticeVersion: string;
  accepted: boolean;
  acceptedAt: string;
  withdrawnAt: string | null;
}

export interface ScheduleRule {
  profileId: string;
  enabled: boolean;
  weekday: number; // 0 = Monday
  maxSpendInr: number | null;
  consentAt: string | null;
  lastPreparedAt: string | null;
}

export type CheckoutOutcome =
  | { ok: true; order: SimulatedOrder; duplicate: boolean }
  | { ok: false; code: string; message: string };

export const NOTICE_VERSION = 'privacy-notice-2026-11-v1';

export interface NourishStore {
  mode: 'demo' | 'supabase';
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  requestOtp(email: string): Promise<OtpRequestResult>;
  verifyOtp(email: string, token: string): Promise<OtpVerifyResult>;
  signOut(): Promise<void>;

  listProfiles(): Promise<Profile[]>;
  getBundle(profileId: string): Promise<ProfileBundle | null>;
  createProfile(displayName: string): Promise<Profile>;
  saveBundle(bundle: ProfileBundle): Promise<ProfileBundle>;
  setArchived(profileId: string, archived: boolean): Promise<void>;

  listConsents(): Promise<ConsentRecord[]>;
  setConsent(purpose: ConsentRecord['purpose'], accepted: boolean): Promise<void>;

  calculate(profileId: string): Promise<{ ok: true; calculation: StoredCalculation } | { ok: false; eligibility: EligibilityResult }>;
  latestCalculation(profileId: string): Promise<StoredCalculation | null>;
  generatePlans(profileId: string): Promise<{ ok: true; plans: StoredPlan[] } | { ok: false; reasons: string[] }>;
  listPlans(profileId: string): Promise<StoredPlan[]>;
  selectPlan(planId: string): Promise<StoredPlan>;
  savePlan(plan: StoredPlan): Promise<StoredPlan>;

  getActiveBasket(profileId: string): Promise<StoredBasket | null>;
  saveBasket(basket: StoredBasket): Promise<StoredBasket>;
  checkout(basketId: string, version: number, opts: { simulateFailure?: boolean }): Promise<CheckoutOutcome>;
  listOrders(): Promise<SimulatedOrder[]>;

  listPantry(profileId: string): Promise<PantryItem[]>;
  savePantryItem(item: PantryItem): Promise<PantryItem>;
  deletePantryItem(id: string): Promise<void>;

  getScheduleRule(profileId: string): Promise<ScheduleRule | null>;
  saveScheduleRule(rule: ScheduleRule): Promise<void>;

  exportData(): Promise<unknown>;
  deleteAccount(): Promise<void>;
}

export function emptyBundle(profile: Profile): ProfileBundle {
  return {
    profile,
    preferences: {
      profileId: profile.id, dietPattern: null, cuisines: [], likes: [], dislikes: [], hardExclusions: [], allergies: [], allergiesConfirmed: false,
      mealsPerDay: 4, maxCookMinutes: 40, groceryTier: 'standard', clinicalFlags: [], noClinicalFlagsConfirmed: false,
    },
    activity: { profileId: profile.id, questionnaireVersion: 'aq-1', occupation: null, movement: null, workoutsPerWeek: 0, workoutType: 'none', workoutMinutes: 0, intensity: null },
    budget: { profileId: profile.id, amountInr: null, period: 'weekly', mode: 'hard' },
    goals: { profileId: profile.id, goal: null },
  };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
