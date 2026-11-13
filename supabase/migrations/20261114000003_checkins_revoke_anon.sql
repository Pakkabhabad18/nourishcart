-- Signed-out visitors must not touch meal check-ins at all.
-- RLS already returns no rows to anon, but every other personal table also
-- revokes anon outright, so this one does too (defence in depth).
revoke all on public.meal_checkins from anon;
