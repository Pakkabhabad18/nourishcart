-- 1) Which meals a person eats (1-5 a day), so intermittent fasting and extra snacks work.
alter table public.profile_preferences drop constraint if exists profile_preferences_meals_per_day_check;
alter table public.profile_preferences
  add constraint profile_preferences_meals_per_day_check check (meals_per_day between 1 and 5),
  add column meal_slots text[] not null default '{}'
    check (meal_slots <@ array['breakfast', 'snack_am', 'lunch', 'snack', 'dinner']::text[]);

-- 2) Personal touches on a profile: a small photo and who the person is to the account holder.
alter table public.profiles
  add column avatar text check (avatar is null or (avatar like 'data:image/jpeg;base64,%' and length(avatar) <= 60000)),
  add column relation text check (relation in ('me', 'partner', 'parent', 'sibling', 'child_adult', 'flatmate', 'other'));

-- 3) Meal check-ins: "I ate this", "skipped", "ate something else". Powers streaks and rings.
create table public.meal_checkins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  slot text not null check (slot in ('breakfast', 'snack_am', 'lunch', 'snack', 'dinner')),
  status text not null check (status in ('ate', 'skipped', 'other')),
  recipe_id text,
  servings numeric(4, 2),
  kcal integer check (kcal between 0 and 5000),
  protein_g numeric(5, 1) check (protein_g between 0 and 400),
  created_at timestamptz not null default now(),
  unique (profile_id, day, slot)
);
alter table public.meal_checkins enable row level security;
-- Same pattern as the other per-profile tables: the caller owns the row and the profile.
create policy meal_checkins_select on public.meal_checkins for select to authenticated using (owner_user_id = auth.uid() and public.owns_profile(profile_id));
create policy meal_checkins_insert on public.meal_checkins for insert to authenticated with check (owner_user_id = auth.uid() and public.owns_profile(profile_id));
create policy meal_checkins_update on public.meal_checkins for update to authenticated using (owner_user_id = auth.uid() and public.owns_profile(profile_id)) with check (owner_user_id = auth.uid() and public.owns_profile(profile_id));
create policy meal_checkins_delete on public.meal_checkins for delete to authenticated using (owner_user_id = auth.uid() and public.owns_profile(profile_id));
create index meal_checkins_profile_day on public.meal_checkins (profile_id, day);
