-- NourishCart core schema (v1). See DATABASE.md for the design notes.
-- Rules: UUID keys, timestamptz, numeric for money/quantities, RLS on every table,
-- owner checks through auth.uid() and a tested ownership helper.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ------------------------------------------------------------------ profiles
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  date_of_birth date,
  sex text check (sex in ('male', 'female', 'prefer_not_to_say')),
  height_cm numeric(5,1) check (height_cm > 0 and height_cm < 300),
  weight_kg numeric(5,1) check (weight_kg > 0 and weight_kg < 400),
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 20),
  onboarding_complete boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Adults only (PRD 7.1). Age is re-validated in the nutrition engine and Edge Functions.
  constraint profiles_adult_dob check (date_of_birth is null or date_of_birth <= (current_date - interval '18 years'))
);
create index profiles_owner_idx on public.profiles(owner_user_id);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- Ownership helper. SECURITY DEFINER so policies on child tables do not recurse into
-- profiles' own RLS; it only ever answers "does the caller own this profile?".
create or replace function public.owns_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = pid and p.owner_user_id = auth.uid());
$$;
revoke all on function public.owns_profile(uuid) from public;
grant execute on function public.owns_profile(uuid) to authenticated;

-- ------------------------------------------------------------------ per-profile settings
create table public.profile_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  diet_pattern text check (diet_pattern in ('vegan', 'vegetarian', 'eggetarian', 'non_vegetarian')),
  goal text check (goal in ('general', 'muscle_fitness', 'weight_management', 'budget_first')),
  cuisines text[] not null default '{}',
  likes text[] not null default '{}',
  dislikes text[] not null default '{}',
  hard_exclusions text[] not null default '{}',
  allergies text[] not null default '{}',
  allergies_confirmed boolean not null default false,
  meals_per_day smallint not null default 4 check (meals_per_day in (3, 4)),
  max_cook_minutes smallint not null default 40 check (max_cook_minutes between 5 and 180),
  grocery_tier text not null default 'standard' check (grocery_tier in ('value', 'standard', 'premium')),
  -- Data minimisation: we store only whether the person is inside the MVP scope, never
  -- which condition they selected (PRD 7.1 / 15.2).
  clinical_scope text check (clinical_scope in ('none_confirmed', 'out_of_scope')),
  updated_at timestamptz not null default now()
);
create trigger profile_preferences_updated before update on public.profile_preferences for each row execute function public.set_updated_at();

create table public.activity_assessments (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  questionnaire_version text not null default 'aq-1',
  occupation text check (occupation in ('sedentary', 'light', 'moderate', 'heavy')),
  movement text check (movement in ('low', 'medium', 'high')),
  workouts_per_week smallint not null default 0 check (workouts_per_week between 0 and 14),
  workout_type text not null default 'none' check (workout_type in ('none', 'strength', 'cardio', 'mixed', 'sport', 'yoga')),
  workout_minutes smallint not null default 0 check (workout_minutes between 0 and 240),
  intensity text check (intensity in ('light', 'moderate', 'vigorous')),
  updated_at timestamptz not null default now()
);
create trigger activity_updated before update on public.activity_assessments for each row execute function public.set_updated_at();

create table public.profile_budgets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount_inr numeric(10,2) check (amount_inr >= 0),
  period text not null default 'weekly' check (period in ('weekly', 'monthly')),
  mode text not null default 'hard' check (mode in ('hard', 'flexible')),
  updated_at timestamptz not null default now()
);
create trigger budgets_updated before update on public.profile_budgets for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ calculations and plans
-- Immutable: inserted only by the calculate-targets Edge Function (service role).
create table public.calculation_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  calculator_id text not null,
  method_version text not null,
  method_status text not null,
  input_snapshot jsonb not null,
  output jsonb not null,
  confidence text not null,
  created_at timestamptz not null default now()
);
create index calculation_runs_profile_idx on public.calculation_runs(profile_id, created_at desc);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  calculation_run_id uuid references public.calculation_runs(id) on delete set null,
  option_key text not null check (option_key in ('budget', 'balanced', 'goal')),
  generation_id uuid not null,
  week_start date not null,
  status text not null default 'proposed' check (status in ('proposed', 'selected', 'archived')),
  draft jsonb not null,             -- meals + ingredient swaps (recipe ids, servings)
  patch jsonb not null default '{}'::jsonb, -- accepted budget alternatives
  targets jsonb not null,           -- planning targets snapshot used for validation
  version integer not null default 1 check (version > 0),
  planner_version text not null,
  data_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meal_plans_profile_idx on public.meal_plans(profile_id, week_start);
create unique index meal_plans_one_selected on public.meal_plans(profile_id) where status = 'selected';
create trigger meal_plans_updated before update on public.meal_plans for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ baskets, orders, pantry
create table public.baskets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid references public.meal_plans(id) on delete set null,
  provider text not null default 'SIMULATED' check (provider = 'SIMULATED'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'REVIEW', 'OVER_BUDGET', 'APPROVED', 'SIMULATED_ORDER', 'EXPIRED')),
  version integer not null default 1 check (version > 0),
  lines jsonb not null default '[]'::jsonb,
  total_inr numeric(10,2) not null default 0 check (total_inr >= 0),
  budget_inr numeric(10,2) check (budget_inr >= 0),
  budget_mode text not null default 'hard' check (budget_mode in ('hard', 'flexible')),
  approved_at timestamptz,
  approved_version integer,
  catalogue_snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index baskets_profile_idx on public.baskets(profile_id, created_at desc);
create trigger baskets_updated before update on public.baskets for each row execute function public.set_updated_at();

-- Orders are written only by the simulate-checkout Edge Function.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  basket_id uuid not null references public.baskets(id) on delete cascade,
  basket_version integer not null,
  idempotency_key text not null unique,
  status text not null check (status in ('DRAFT', 'OPTIMISED', 'REVIEW_REQUIRED', 'APPROVED', 'CHECKOUT_PROCESSING', 'CONFIRMED', 'FAILED', 'CANCELLED')),
  is_simulated boolean not null default true check (is_simulated),
  total_inr numeric(10,2) not null check (total_inr >= 0),
  receipt jsonb not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index orders_owner_idx on public.orders(owner_user_id, created_at desc);
create index orders_profile_idx on public.orders(profile_id);

create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ingredient_id text not null,
  name text not null,
  quantity numeric(10,1) not null check (quantity >= 0),
  unit text not null check (unit in ('g', 'ml', 'piece')),
  counted_at timestamptz not null default now(),
  purchased_at timestamptz,
  expiry_at date,
  source text not null default 'manual' check (source in ('manual', 'simulated_order')),
  confidence text not null default 'confirmed' check (confidence in ('confirmed', 'estimated')),
  snoozed_until timestamptz,
  buffer_days smallint not null default 2 check (buffer_days between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, ingredient_id)
);
create trigger pantry_updated before update on public.pantry_items for each row execute function public.set_updated_at();

create table public.scheduled_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade unique,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  weekday smallint not null default 0 check (weekday between 0 and 6),
  max_spend_inr numeric(10,2) check (max_spend_inr >= 0),
  consent_at timestamptz,
  last_prepared_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger scheduled_rules_updated before update on public.scheduled_rules for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ consent and deletion
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('profile_processing', 'analytics', 'retailer_linking')),
  notice_version text not null,
  accepted boolean not null,
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index consent_user_idx on public.consent_records(user_id, purpose);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scope text not null check (scope in ('account', 'profile')),
  profile_id uuid,
  requested_at timestamptz not null default now(),
  status text not null default 'requested' check (status in ('requested', 'completed', 'failed')),
  completed_at timestamptz
);

-- ------------------------------------------------------------------ reference data (read-only)
create table public.data_sources (
  id text primary key,
  title text not null,
  publisher text not null,
  version text not null,
  url text,
  license text not null,
  attribution text not null,
  permission_status text not null check (permission_status in ('not_required', 'permitted', 'pending', 'not_permitted')),
  is_sample boolean not null,
  notes text not null default ''
);

create table public.foods (
  id text primary key,
  name text not null,
  food_group text not null,
  unit_basis text not null check (unit_basis in ('g', 'ml', 'piece')),
  grams_per_piece numeric(8,2),
  state text not null,
  diet_class text not null,
  allergens text[] not null default '{}',
  nutrients_per_100 jsonb not null, -- null values mean unknown, never zero
  source_id text not null references public.data_sources(id),
  confidence text not null,
  verified boolean not null default false
);

create table public.recipes (
  id text primary key,
  version integer not null,
  name text not null,
  cuisine text not null,
  slots text[] not null,
  serving_grams numeric(8,1) not null,
  prep_minutes smallint not null,
  steps jsonb not null,
  source_id text not null references public.data_sources(id),
  confidence text not null
);

create table public.recipe_ingredients (
  recipe_id text not null references public.recipes(id) on delete cascade,
  food_id text not null references public.foods(id),
  amount numeric(10,2) not null check (amount > 0),
  optional boolean not null default false,
  retention_factor numeric(4,3),
  primary key (recipe_id, food_id)
);

create table public.catalogue_products (
  id text primary key,
  provider text not null check (provider = 'SIMULATED'),
  external_product_id text not null,
  food_id text not null references public.foods(id),
  brand text not null,
  title text not null,
  pack_qty numeric(10,2) not null check (pack_qty > 0),
  pack_unit text not null,
  price_inr numeric(10,2) not null check (price_inr >= 0),
  tier text not null,
  available boolean not null,
  allergens text[] not null default '{}',
  last_checked_at timestamptz not null,
  simulated boolean not null default true check (simulated),
  unique (provider, external_product_id)
);

-- ------------------------------------------------------------------ RLS
alter table public.profiles enable row level security;
alter table public.profile_preferences enable row level security;
alter table public.activity_assessments enable row level security;
alter table public.profile_budgets enable row level security;
alter table public.calculation_runs enable row level security;
alter table public.meal_plans enable row level security;
alter table public.baskets enable row level security;
alter table public.orders enable row level security;
alter table public.pantry_items enable row level security;
alter table public.scheduled_rules enable row level security;
alter table public.consent_records enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.data_sources enable row level security;
alter table public.foods enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.catalogue_products enable row level security;

-- Profiles: only the owner.
create policy profiles_select on public.profiles for select to authenticated using (owner_user_id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated with check (owner_user_id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy profiles_delete on public.profiles for delete to authenticated using (owner_user_id = auth.uid());

-- Child tables: owner column must be the caller AND the profile must belong to the caller.
do $$
declare t text;
begin
  foreach t in array array['profile_preferences', 'activity_assessments', 'profile_budgets', 'meal_plans', 'baskets', 'pantry_items', 'scheduled_rules'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (owner_user_id = auth.uid() and public.owns_profile(profile_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (owner_user_id = auth.uid() and public.owns_profile(profile_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (owner_user_id = auth.uid() and public.owns_profile(profile_id)) with check (owner_user_id = auth.uid() and public.owns_profile(profile_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (owner_user_id = auth.uid() and public.owns_profile(profile_id))', t);
  end loop;
end $$;

-- Server-written tables: the owner may read; there are no insert/update policies for
-- authenticated users, so only Edge Functions (service role) can write them.
create policy calculation_runs_select on public.calculation_runs for select to authenticated using (owner_user_id = auth.uid() and public.owns_profile(profile_id));
create policy orders_select on public.orders for select to authenticated using (owner_user_id = auth.uid());

create policy consent_select on public.consent_records for select to authenticated using (user_id = auth.uid());
create policy consent_insert on public.consent_records for insert to authenticated with check (user_id = auth.uid());
create policy consent_update on public.consent_records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy deletion_select on public.deletion_requests for select to authenticated using (user_id = auth.uid());

-- Reference data: read-only for signed-in users (sample/licensed data only).
create policy data_sources_read on public.data_sources for select to authenticated using (true);
create policy foods_read on public.foods for select to authenticated using (true);
create policy recipes_read on public.recipes for select to authenticated using (true);
create policy recipe_ingredients_read on public.recipe_ingredients for select to authenticated using (true);
create policy catalogue_read on public.catalogue_products for select to authenticated using (true);

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;
