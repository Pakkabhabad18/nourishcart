// Progress: meal check-ins, streaks, daily rings and badges. Pure functions.
//
// Design choices (see DECISIONS D-51):
//  - A day "counts" when at least one meal is checked in (ate or ate something else).
//    Skipping a meal on purpose is a check-in too: fasting is not failure.
//  - Streaks forgive: one missed day in any 7 does not break the streak. Research on
//    gamified nutrition apps warns that harsh streaks push some people to unhealthy habits.
//  - Badges reward showing up and variety, never eating less.
import type { MealSlot } from '../types.ts';

export interface MealCheckin {
  id: string;
  profileId: string;
  day: string; // YYYY-MM-DD, local date
  slot: MealSlot;
  status: 'ate' | 'skipped' | 'other';
  recipeId: string | null;
  servings: number | null;
  kcal: number | null;
  proteinG: number | null;
  createdAt: string;
}

/** Local calendar date as YYYY-MM-DD (not UTC, so late-night meals land on the right day). */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

const counts = (c: MealCheckin) => c.status === 'ate' || c.status === 'other' || c.status === 'skipped';

/**
 * Current streak in days, ending today (or yesterday if today has no check-in yet).
 * One gap is forgiven per rolling 7 days; the forgiven day doesn't add to the count.
 */
export function streak(checkins: MealCheckin[], today: string): { days: number; forgivenUsed: boolean } {
  const active = new Set(checkins.filter(counts).map((c) => c.day));
  let day = active.has(today) ? today : addDays(today, -1);
  let days = 0;
  let lastForgive: string | null = null;
  for (let i = 0; i < 400; i++) {
    if (active.has(day)) days++;
    else {
      // A gap: forgive it if no gap was forgiven in the last 7 days and the day before was active.
      const recent = lastForgive != null && daysBetween(day, lastForgive) < 7;
      if (days > 0 && !recent && active.has(addDays(day, -1))) lastForgive = day;
      else break;
    }
    day = addDays(day, -1);
  }
  return { days, forgivenUsed: lastForgive != null };
}

function daysBetween(a: string, b: string): number {
  const t = (s: string) => new Date(`${s}T00:00:00`).getTime();
  return Math.round(Math.abs(t(a) - t(b)) / 86_400_000);
}

/** What was eaten on a day, from check-ins (only "ate" ones carry numbers). */
export function dayTotals(checkins: MealCheckin[], day: string): { kcal: number; proteinG: number; meals: number } {
  const list = checkins.filter((c) => c.day === day && c.status === 'ate');
  return { kcal: list.reduce((s, c) => s + (c.kcal ?? 0), 0), proteinG: list.reduce((s, c) => s + (c.proteinG ?? 0), 0), meals: list.length };
}

/** The last 7 days (oldest first) with whether each was checked in. */
export function week(checkins: MealCheckin[], today: string): { day: string; active: boolean }[] {
  const active = new Set(checkins.filter(counts).map((c) => c.day));
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((day) => ({ day, active: active.has(day) }));
}

export interface Badge {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
}

/** Badges: showing up, consistency, protein days and variety. Never "ate the least". */
export function badges(checkins: MealCheckin[], today: string, proteinTarget: number | null): Badge[] {
  const ate = checkins.filter((c) => c.status === 'ate');
  const s = streak(checkins, today).days;
  const days = [...new Set(ate.map((c) => c.day))];
  const proteinDays = proteinTarget ? days.filter((d) => dayTotals(checkins, d).proteinG >= proteinTarget * 0.9).length : 0;
  const dishes = new Set(ate.map((c) => c.recipeId).filter(Boolean)).size;
  return [
    { id: 'first', title: 'First bite', detail: 'Checked in your first meal', earned: checkins.some(counts) },
    { id: 'streak3', title: 'Three in a row', detail: '3-day streak', earned: s >= 3 },
    { id: 'streak7', title: 'Full week', detail: '7-day streak', earned: s >= 7 },
    { id: 'protein5', title: 'Protein pro', detail: 'Hit your protein on 5 days', earned: proteinDays >= 5 },
    { id: 'variety10', title: 'Explorer', detail: 'Ate 10 different dishes', earned: dishes >= 10 },
    { id: 'streak30', title: 'Habit made', detail: '30-day streak', earned: s >= 30 },
  ];
}
