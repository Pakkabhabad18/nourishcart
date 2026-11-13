// Display helpers. Units are always shown explicitly.
export { formatInr, formatQty, round } from '../domain/units.ts';

export function kcal(v: number): string {
  return `${Math.round(v).toLocaleString('en-IN')} kcal`;
}
export function grams(v: number): string {
  return `${Math.round(v)} g`;
}
export function dayName(day: number): string {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day] ?? `Day ${day + 1}`;
}
export function dayLong(day: number): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day] ?? `Day ${day + 1}`;
}
export const SLOT_LABEL: Record<string, string> = { breakfast: 'Breakfast', snack_am: 'Morning snack', lunch: 'Lunch', snack: 'Evening snack', dinner: 'Dinner' };
export function servingsLabel(s: number): string {
  return s === 1 ? '1 serving' : `${s} servings`;
}
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
export function dateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
/** Today's day index in the plan week (Mon = 0). */
export function todayIndex(d = new Date()): number {
  return (d.getDay() + 6) % 7;
}
