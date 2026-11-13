-- Quick setup lets people state their age instead of a date of birth.
-- We store the stated age and when it was stated; current age is derived from both.
alter table public.profiles
  add column age_at_entry smallint check (age_at_entry between 18 and 120),
  add column age_entered_at timestamptz,
  add constraint profiles_age_pair check ((age_at_entry is null) = (age_entered_at is null));
