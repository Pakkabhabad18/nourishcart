-- Personal nutrition targets: body goal, optional typed-in numbers, and nutrients the
-- person wants more of. NULL target = use the suggested value. Ranges here are wide
-- sanity limits; the app applies its own safety limits before planning.
alter table public.profile_preferences
  add column body_goal text check (body_goal in ('lose', 'maintain', 'gain')),
  add column target_kcal smallint check (target_kcal between 1000 and 5000),
  add column target_protein_g smallint check (target_protein_g between 20 and 300),
  add column target_carbs_g smallint check (target_carbs_g between 20 and 800),
  add column target_fat_g smallint check (target_fat_g between 10 and 250),
  add column target_fibre_g smallint check (target_fibre_g between 5 and 80),
  -- Stored as a preference ("more iron please"), not a diagnosis.
  add column focus_nutrients text[] not null default '{}'
    check (focus_nutrients <@ array['iron', 'calcium', 'b12', 'vitamin_d', 'folate', 'zinc']::text[]);
