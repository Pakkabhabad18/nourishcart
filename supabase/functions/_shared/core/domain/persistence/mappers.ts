// Row <-> domain mappers for the Supabase tables. Shared by the browser store and the
// Edge Functions so both read and write the same shapes.
import type { ActivityAssessment, Allergen, ClinicalFlag, ProfileBundle, Profile } from '../types.ts';
import type { PantryItem } from '../inventory/pantry.ts';
import type { StoredBasket, SimulatedOrder } from '../orders/checkout.ts';
import type { PlanDraft, PlanTargets, OptionKey } from '../planning/plan.ts';
import type { BasketPatch } from '../grocery/negotiate.ts';
import type { CalculationRecord } from '../nutrition/targets.ts';

export interface ProfileRow {
  id: string;
  owner_user_id: string;
  display_name: string;
  date_of_birth: string | null;
  age_at_entry: number | null;
  age_entered_at: string | null;
  sex: Profile['sex'];
  height_cm: number | string | null;
  weight_kg: number | string | null;
  onboarding_step: number;
  onboarding_complete: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

export function profileFromRow(r: ProfileRow): Profile {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    displayName: r.display_name,
    dateOfBirth: r.date_of_birth,
    ageAtEntry: r.age_at_entry ?? null,
    ageEnteredAt: r.age_entered_at ?? null,
    sex: r.sex,
    heightCm: num(r.height_cm),
    weightKg: num(r.weight_kg),
    archived: r.archived_at != null,
    onboardingStep: r.onboarding_step,
    onboardingComplete: r.onboarding_complete,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function profileToRow(p: Profile): Omit<ProfileRow, 'created_at' | 'updated_at'> {
  return {
    id: p.id,
    owner_user_id: p.ownerUserId,
    display_name: p.displayName,
    date_of_birth: p.dateOfBirth,
    age_at_entry: p.ageAtEntry,
    age_entered_at: p.ageEnteredAt,
    sex: p.sex,
    height_cm: p.heightCm,
    weight_kg: p.weightKg,
    onboarding_step: p.onboardingStep,
    onboarding_complete: p.onboardingComplete,
    archived_at: p.archived ? new Date().toISOString() : null,
  };
}

export interface PreferencesRow {
  profile_id: string;
  owner_user_id: string;
  diet_pattern: ProfileBundle['preferences']['dietPattern'];
  goal: ProfileBundle['goals']['goal'];
  cuisines: string[];
  likes: string[];
  dislikes: string[];
  hard_exclusions: string[];
  allergies: string[];
  allergies_confirmed: boolean;
  meals_per_day: number;
  max_cook_minutes: number;
  grocery_tier: ProfileBundle['preferences']['groceryTier'];
  clinical_scope: 'none_confirmed' | 'out_of_scope' | null;
}

export interface ActivityRow {
  profile_id: string;
  owner_user_id: string;
  questionnaire_version: string;
  occupation: ActivityAssessment['occupation'];
  movement: ActivityAssessment['movement'];
  workouts_per_week: number;
  workout_type: ActivityAssessment['workoutType'];
  workout_minutes: number;
  intensity: ActivityAssessment['intensity'];
}

export interface BudgetRow {
  profile_id: string;
  owner_user_id: string;
  amount_inr: number | string | null;
  period: 'weekly' | 'monthly';
  mode: 'hard' | 'flexible';
}

/** Only scope status is persisted; the specific condition is never stored. */
const OUT_OF_SCOPE_FLAG: ClinicalFlag[] = ['other_medical_condition'];

export function bundleFromRows(p: ProfileRow, pref: PreferencesRow | null, act: ActivityRow | null, bud: BudgetRow | null): ProfileBundle {
  const profile = profileFromRow(p);
  return {
    profile,
    preferences: {
      profileId: p.id,
      dietPattern: pref?.diet_pattern ?? null,
      cuisines: pref?.cuisines ?? [],
      likes: pref?.likes ?? [],
      dislikes: pref?.dislikes ?? [],
      hardExclusions: pref?.hard_exclusions ?? [],
      allergies: (pref?.allergies ?? []) as Allergen[],
      allergiesConfirmed: pref?.allergies_confirmed ?? false,
      mealsPerDay: (pref?.meals_per_day ?? 4) === 3 ? 3 : 4,
      maxCookMinutes: pref?.max_cook_minutes ?? 40,
      groceryTier: pref?.grocery_tier ?? 'standard',
      clinicalFlags: pref?.clinical_scope === 'out_of_scope' ? OUT_OF_SCOPE_FLAG : [],
      noClinicalFlagsConfirmed: pref?.clinical_scope === 'none_confirmed',
    },
    activity: {
      profileId: p.id,
      questionnaireVersion: act?.questionnaire_version ?? 'aq-1',
      occupation: act?.occupation ?? null,
      movement: act?.movement ?? null,
      workoutsPerWeek: act?.workouts_per_week ?? 0,
      workoutType: act?.workout_type ?? 'none',
      workoutMinutes: act?.workout_minutes ?? 0,
      intensity: act?.intensity ?? null,
    },
    budget: { profileId: p.id, amountInr: num(bud?.amount_inr ?? null), period: bud?.period ?? 'weekly', mode: bud?.mode ?? 'hard' },
    goals: { profileId: p.id, goal: pref?.goal ?? null },
  };
}

export function bundleToRows(b: ProfileBundle): { preferences: PreferencesRow; activity: ActivityRow; budget: BudgetRow } {
  const owner = b.profile.ownerUserId;
  const pr = b.preferences;
  return {
    preferences: {
      profile_id: b.profile.id,
      owner_user_id: owner,
      diet_pattern: pr.dietPattern,
      goal: b.goals.goal,
      cuisines: pr.cuisines,
      likes: pr.likes,
      dislikes: pr.dislikes,
      hard_exclusions: pr.hardExclusions,
      allergies: pr.allergies,
      allergies_confirmed: pr.allergiesConfirmed,
      meals_per_day: pr.mealsPerDay,
      max_cook_minutes: pr.maxCookMinutes,
      grocery_tier: pr.groceryTier,
      clinical_scope: pr.clinicalFlags.length > 0 ? 'out_of_scope' : pr.noClinicalFlagsConfirmed ? 'none_confirmed' : null,
    },
    activity: {
      profile_id: b.profile.id,
      owner_user_id: owner,
      questionnaire_version: b.activity.questionnaireVersion,
      occupation: b.activity.occupation,
      movement: b.activity.movement,
      workouts_per_week: b.activity.workoutsPerWeek,
      workout_type: b.activity.workoutType,
      workout_minutes: b.activity.workoutMinutes,
      intensity: b.activity.intensity,
    },
    budget: { profile_id: b.profile.id, owner_user_id: owner, amount_inr: b.budget.amountInr, period: b.budget.period, mode: b.budget.mode },
  };
}

export interface BasketRow {
  id: string;
  profile_id: string;
  owner_user_id: string;
  plan_id: string | null;
  provider: 'SIMULATED';
  status: StoredBasket['status'];
  version: number;
  lines: StoredBasket['lines'];
  total_inr: number | string;
  budget_inr: number | string | null;
  budget_mode: 'hard' | 'flexible';
  approved_at: string | null;
  approved_version: number | null;
  catalogue_snapshot_at: string | null;
  created_at: string;
  updated_at: string;
}

export function basketFromRow(r: BasketRow): StoredBasket {
  return {
    id: r.id,
    profileId: r.profile_id,
    ownerUserId: r.owner_user_id,
    version: r.version,
    status: r.status,
    provider: r.provider,
    lines: r.lines,
    totalInr: Number(r.total_inr),
    budgetInr: num(r.budget_inr),
    budgetMode: r.budget_mode,
    approvedAt: r.approved_at,
    approvedVersion: r.approved_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    catalogueSnapshotAt: r.catalogue_snapshot_at ?? '',
    planId: r.plan_id,
  };
}

export function basketToRow(b: StoredBasket): Omit<BasketRow, 'created_at' | 'updated_at'> {
  return {
    id: b.id,
    profile_id: b.profileId,
    owner_user_id: b.ownerUserId,
    plan_id: b.planId,
    provider: b.provider,
    status: b.status,
    version: b.version,
    lines: b.lines,
    total_inr: b.totalInr,
    budget_inr: b.budgetInr,
    budget_mode: b.budgetMode,
    approved_at: b.approvedAt,
    approved_version: b.approvedVersion,
    catalogue_snapshot_at: b.catalogueSnapshotAt || null,
  };
}

export interface OrderRow {
  id: string;
  owner_user_id: string;
  profile_id: string;
  basket_id: string;
  basket_version: number;
  idempotency_key: string;
  status: SimulatedOrder['status'];
  is_simulated: true;
  total_inr: number | string;
  receipt: Pick<SimulatedOrder, 'label' | 'lines' | 'budgetInr' | 'history' | 'failureReason'>;
  confirmed_at: string | null;
  created_at: string;
}

export function orderFromRow(r: OrderRow): SimulatedOrder {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    profileId: r.profile_id,
    basketId: r.basket_id,
    basketVersion: r.basket_version,
    idempotencyKey: r.idempotency_key,
    status: r.status,
    isSimulated: true,
    label: r.receipt.label,
    totalInr: Number(r.total_inr),
    lines: r.receipt.lines,
    budgetInr: r.receipt.budgetInr,
    createdAt: r.created_at,
    confirmedAt: r.confirmed_at,
    failureReason: r.receipt.failureReason,
    history: r.receipt.history,
  };
}

export function orderToRow(o: SimulatedOrder): OrderRow {
  return {
    id: o.id,
    owner_user_id: o.ownerUserId,
    profile_id: o.profileId,
    basket_id: o.basketId,
    basket_version: o.basketVersion,
    idempotency_key: o.idempotencyKey,
    status: o.status,
    is_simulated: true,
    total_inr: o.totalInr,
    receipt: { label: o.label, lines: o.lines, budgetInr: o.budgetInr, history: o.history, failureReason: o.failureReason },
    confirmed_at: o.confirmedAt,
    created_at: o.createdAt,
  };
}

export interface PantryRow {
  id: string;
  profile_id: string;
  owner_user_id: string;
  ingredient_id: string;
  name: string;
  quantity: number | string;
  unit: PantryItem['unit'];
  counted_at: string;
  purchased_at: string | null;
  expiry_at: string | null;
  source: PantryItem['source'];
  confidence: PantryItem['confidence'];
  snoozed_until: string | null;
  buffer_days: number;
}

export function pantryFromRow(r: PantryRow): PantryItem {
  return {
    id: r.id,
    profileId: r.profile_id,
    ownerUserId: r.owner_user_id,
    ingredientId: r.ingredient_id,
    name: r.name,
    quantity: Number(r.quantity),
    unit: r.unit,
    countedAt: r.counted_at,
    purchasedAt: r.purchased_at,
    expiryAt: r.expiry_at,
    source: r.source,
    confidence: r.confidence,
    snoozedUntil: r.snoozed_until,
    bufferDays: r.buffer_days,
  };
}

export function pantryToRow(p: PantryItem): PantryRow {
  return {
    id: p.id,
    profile_id: p.profileId,
    owner_user_id: p.ownerUserId,
    ingredient_id: p.ingredientId,
    name: p.name,
    quantity: p.quantity,
    unit: p.unit,
    counted_at: p.countedAt,
    purchased_at: p.purchasedAt,
    expiry_at: p.expiryAt,
    source: p.source,
    confidence: p.confidence,
    snoozed_until: p.snoozedUntil,
    buffer_days: p.bufferDays,
  };
}

// ------------------------------------------------------------------ plans and calculations

export interface StoredPlan {
  id: string;
  profileId: string;
  ownerUserId: string;
  calculationRunId: string | null;
  optionKey: OptionKey;
  generationId: string;
  weekStart: string;
  status: 'proposed' | 'selected' | 'archived';
  draft: PlanDraft;
  patch: BasketPatch;
  targets: PlanTargets;
  version: number;
  plannerVersion: string;
  dataVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanRow {
  id: string;
  profile_id: string;
  owner_user_id: string;
  calculation_run_id: string | null;
  option_key: OptionKey;
  generation_id: string;
  week_start: string;
  status: StoredPlan['status'];
  draft: PlanDraft;
  patch: BasketPatch;
  targets: PlanTargets;
  version: number;
  planner_version: string;
  data_version: string;
  created_at: string;
  updated_at: string;
}

export function planFromRow(r: PlanRow): StoredPlan {
  return {
    id: r.id,
    profileId: r.profile_id,
    ownerUserId: r.owner_user_id,
    calculationRunId: r.calculation_run_id,
    optionKey: r.option_key,
    generationId: r.generation_id,
    weekStart: r.week_start,
    status: r.status,
    draft: r.draft,
    patch: r.patch ?? {},
    targets: r.targets,
    version: r.version,
    plannerVersion: r.planner_version,
    dataVersion: r.data_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function planToRow(p: StoredPlan): Omit<PlanRow, 'created_at' | 'updated_at'> {
  return {
    id: p.id,
    profile_id: p.profileId,
    owner_user_id: p.ownerUserId,
    calculation_run_id: p.calculationRunId,
    option_key: p.optionKey,
    generation_id: p.generationId,
    week_start: p.weekStart,
    status: p.status,
    draft: p.draft,
    patch: p.patch,
    targets: p.targets,
    version: p.version,
    planner_version: p.plannerVersion,
    data_version: p.dataVersion,
  };
}

export interface StoredCalculation {
  id: string;
  profileId: string;
  ownerUserId: string;
  record: CalculationRecord;
  createdAt: string;
}

export interface CalculationRow {
  id: string;
  profile_id: string;
  owner_user_id: string;
  calculator_id: string;
  method_version: string;
  method_status: string;
  input_snapshot: CalculationRecord['inputsSnapshot'];
  output: CalculationRecord;
  confidence: string;
  created_at: string;
}

export function calculationFromRow(r: CalculationRow): StoredCalculation {
  return { id: r.id, profileId: r.profile_id, ownerUserId: r.owner_user_id, record: r.output, createdAt: r.created_at };
}

export function calculationToRow(c: StoredCalculation): Omit<CalculationRow, 'created_at'> {
  return {
    id: c.id,
    profile_id: c.profileId,
    owner_user_id: c.ownerUserId,
    calculator_id: c.record.calculatorId,
    method_version: c.record.methodVersion,
    method_status: c.record.methodStatus,
    input_snapshot: c.record.inputsSnapshot,
    output: c.record,
    confidence: c.record.confidence,
  };
}

export const DATA_VERSION = 'sample-foods-1.0.0+recipes-1.0.0+catalogue-2026-11-11';

/** Monday of the week containing `d` (ISO date). */
export function weekStartOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}
