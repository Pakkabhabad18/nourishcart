# Database

Migration: `supabase/migrations/20261111000001_core_schema.sql`. Seed (reference data only): `supabase/seed.sql`, generated from `src/data/*` by `npm run db:seed-sql`.

Conventions: UUID keys, `timestamptz`, `numeric` for money and quantities, check constraints for enums and ranges, `updated_at` triggers, cascading deletes from `auth.users`.

## Tables

### Owned by a user

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | owner_user_id, display_name, date_of_birth, sex, height_cm, weight_kg, onboarding_step, onboarding_complete, archived_at | One account, many adult profiles. DB check rejects a date of birth less than 18 years ago. Archive is a soft state with a recovery reason (restore). |
| `profile_preferences` | profile_id (PK), diet_pattern, goal, cuisines[], likes[], dislikes[], hard_exclusions[], allergies[], allergies_confirmed, meals_per_day, max_cook_minutes, grocery_tier, clinical_scope | `clinical_scope` is only `none_confirmed` / `out_of_scope`. The condition itself is never stored. |
| `activity_assessments` | profile_id (PK), questionnaire_version, occupation, movement, workouts_per_week, workout_type, workout_minutes, intensity | Latest answers; each calculation keeps its own input snapshot for audit. |
| `profile_budgets` | profile_id (PK), amount_inr, period, mode | Personal budget per profile. |
| `calculation_runs` | profile_id, calculator_id, method_version, method_status, input_snapshot, output, confidence | Immutable; server-only insert. |
| `meal_plans` | profile_id, calculation_run_id, option_key, generation_id, week_start, status, draft (jsonb), patch (jsonb), targets (jsonb), version, planner_version, data_version | One `selected` plan per profile (partial unique index). |
| `baskets` | profile_id, plan_id, provider (= SIMULATED), status, version, lines (jsonb), total_inr, budget_inr, budget_mode, approved_at, approved_version | Status per PRD 9.5. |
| `orders` | owner_user_id, profile_id, basket_id, basket_version, idempotency_key (unique), status, is_simulated (must be true), total_inr, receipt (jsonb) | Server-only insert. |
| `pantry_items` | profile_id, ingredient_id (unique per profile), quantity ≥ 0, unit, counted_at, purchased_at, expiry_at, source, confidence, snoozed_until, buffer_days | |
| `scheduled_rules` | profile_id (unique), enabled, weekday, max_spend_inr, consent_at, last_prepared_at | Prepares a draft only. |
| `consent_records` | user_id, purpose, notice_version, accepted, accepted_at, withdrawn_at | |
| `deletion_requests` | user_id, scope, status, completed_at | Evidence of completed deletion; no personal data beyond the user id. |

### Reference (read-only to signed-in users)

`data_sources`, `foods` (nutrients per 100 g as jsonb, nulls = unknown), `recipes`, `recipe_ingredients`, `catalogue_products` (provider must be SIMULATED, simulated must be true).

## Why a leaner schema than the PRD list

- `planned_meals` is stored inside `meal_plans.draft` (jsonb). A plan version is then one atomic row, which keeps the recipe/servings snapshot consistent with its targets and patch.
- `basket_items` is `baskets.lines` (jsonb) for the same reason: approval locks one exact version.
- `replenishment_estimates` are computed on read from pantry + selected plan, not stored, so they can never go stale.
- `accounts` is `auth.users`; there is no separate table.
- Recorded in `DECISIONS.md` (D-17).

## RLS

RLS is enabled on every table.

- `profiles`: owner only, for select/insert/update/delete.
- Child tables: `owner_user_id = auth.uid() AND owns_profile(profile_id)`. `owns_profile` is `SECURITY DEFINER` so policies do not recurse; it only answers whether the caller owns the profile.
- `calculation_runs`, `orders`: owner may read; no insert/update policy, so only the service role (Edge Functions) writes.
- Reference tables: authenticated read only.
- `anon` has no table grants.

Tested in `tests/integration/supabase.int.test.ts`: another account cannot read, update, attach rows to, or spoof ownership of a profile; clients cannot write orders or calculation runs; the anonymous key reads nothing; under-18 dates are rejected.

## Deletion

`delete-account-data` deletes the auth user; every owned table cascades. A `deletion_requests` row records completion. Profile-level removal in the MVP is archive/restore; hard profile deletion follows the same cascade from `profiles`.

## Indexes

Owner and profile ids, `(profile_id, created_at desc)` on runs and baskets, `(profile_id, week_start)` on plans, unique idempotency key, unique `(provider, external_product_id)` on catalogue.
