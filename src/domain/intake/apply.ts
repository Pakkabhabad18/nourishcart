// Applies an extraction to a profile draft. Only fields the extraction found are changed;
// allergies, exclusions and health flags are merged (added), never removed.
import type { ProfileBundle } from '../types.ts';
import type { Extraction } from './extract.ts';

export function applyExtraction(b: ProfileBundle, e: Extraction, now: Date = new Date()): ProfileBundle {
  const n: ProfileBundle = structuredClone(b);
  if (e.ageYears) {
    n.profile.ageAtEntry = e.ageYears.value;
    n.profile.ageEnteredAt = now.toISOString();
    n.profile.dateOfBirth = null;
  }
  if (e.sex) n.profile.sex = e.sex.value;
  if (e.heightCm) n.profile.heightCm = e.heightCm.value;
  if (e.weightKg) n.profile.weightKg = e.weightKg.value;
  if (e.occupation) n.activity.occupation = e.occupation.value;
  if (e.movement) n.activity.movement = e.movement.value;
  if (e.workoutsPerWeek) {
    n.activity.workoutsPerWeek = e.workoutsPerWeek.value;
    if (e.workoutsPerWeek.value === 0) {
      n.activity.workoutType = 'none';
      n.activity.workoutMinutes = 0;
      n.activity.intensity = null;
    }
  }
  if (e.workoutMinutes) n.activity.workoutMinutes = e.workoutMinutes.value;
  if (e.workoutType) n.activity.workoutType = e.workoutType.value;
  if (e.intensity) n.activity.intensity = e.intensity.value;
  if (e.dietPattern) n.preferences.dietPattern = e.dietPattern.value;
  if (e.allergies) {
    n.preferences.allergies = [...new Set([...n.preferences.allergies, ...e.allergies.value])];
    n.preferences.allergiesConfirmed = true;
  } else if (e.noAllergies && n.preferences.allergies.length === 0) n.preferences.allergiesConfirmed = true;
  if (e.hardExclusions) n.preferences.hardExclusions = [...new Set([...n.preferences.hardExclusions, ...e.hardExclusions.value])];
  if (e.dislikes) n.preferences.dislikes = [...new Set([...n.preferences.dislikes, ...e.dislikes.value])];
  if (e.mealsPerDay) n.preferences.mealsPerDay = e.mealsPerDay.value;
  if (e.goal) n.goals.goal = e.goal.value;
  if (e.budgetInr) n.budget.amountInr = e.budgetInr.value;
  if (e.budgetPeriod) n.budget.period = e.budgetPeriod.value;
  if (e.clinicalFlags) {
    n.preferences.clinicalFlags = [...new Set([...n.preferences.clinicalFlags, ...e.clinicalFlags.value])];
    n.preferences.noClinicalFlagsConfirmed = false;
  } else if (e.noClinical && n.preferences.clinicalFlags.length === 0) n.preferences.noClinicalFlagsConfirmed = true;
  return n;
}
