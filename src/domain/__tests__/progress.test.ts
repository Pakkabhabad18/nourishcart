// Streaks forgive one gap a week, skipping a meal still counts, badges follow check-ins.
import { describe, expect, it } from 'vitest';
import { addDays, badges, dayTotals, streak, week, type MealCheckin } from '../progress/progress.ts';

const ci = (day: string, status: MealCheckin['status'] = 'ate', extra: Partial<MealCheckin> = {}): MealCheckin => ({ id: `${day}-${status}-${Math.random()}`, profileId: 'p', day, slot: 'lunch', status, recipeId: 'r1', servings: 1, kcal: 500, proteinG: 20, createdAt: '', ...extra });
const today = '2026-11-14';
const days = (n: number, from = today) => Array.from({ length: n }, (_, i) => addDays(from, -i));

describe('progress', () => {
  it('counts consecutive days, starting yesterday if today is empty', () => {
    expect(streak(days(5).map((d) => ci(d)), today).days).toBe(5);
    expect(streak(days(3, addDays(today, -1)).map((d) => ci(d)), today).days).toBe(3);
  });
  it('forgives one missed day in a week, not two', () => {
    const list = [...days(3), ...days(3, addDays(today, -4))].map((d) => ci(d)); // gap on day -3
    const s = streak(list, today);
    expect(s.days).toBe(6);
    expect(s.forgivenUsed).toBe(true);
    const two = [...days(2), ...days(2, addDays(today, -3)), ...days(2, addDays(today, -6))].map((d) => ci(d)); // gaps at -2 and -5
    expect(streak(two, today).days).toBe(4);
  });
  it('a planned skip (fasting) keeps the streak', () => {
    expect(streak([ci(today, 'skipped'), ci(addDays(today, -1))], today).days).toBe(2);
  });
  it('totals only meals actually eaten', () => {
    expect(dayTotals([ci(today), ci(today, 'skipped'), ci(today, 'other', { kcal: null })], today)).toEqual({ kcal: 500, proteinG: 20, meals: 1 });
  });
  it('week strip has 7 days ending today', () => {
    const w = week([ci(today)], today);
    expect(w).toHaveLength(7);
    expect(w[6]).toEqual({ day: today, active: true });
  });
  it('badges are earned by showing up, never by eating less', () => {
    const b = badges(days(7).map((d) => ci(d)), today, 20);
    expect(b.find((x) => x.id === 'streak7')!.earned).toBe(true);
    expect(b.find((x) => x.id === 'protein5')!.earned).toBe(true);
    expect(b.find((x) => x.id === 'variety10')!.earned).toBe(false);
  });
});
