// validateProfileForNutrition: decides whether we may calculate personal estimates.
// It rejects missing or impossible inputs and never assumes a default value.
import type { ProfileBundle } from '../types.ts';
import { ageInYears } from '../units.ts';

export type EligibilityStatus = 'eligible' | 'incomplete' | 'out_of_scope';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  ageYears: number | null;
  missing: ValidationIssue[];
  invalid: ValidationIssue[];
  scopeReasons: string[];
}

// Plausibility bounds catch typos (e.g. 17 kg, 1700 cm). They are not health judgements.
export const BOUNDS = {
  heightCm: { min: 120, max: 230 },
  weightKg: { min: 30, max: 250 },
  ageYears: { min: 18, max: 100 },
} as const;

export function validateProfileForNutrition(b: ProfileBundle, onDate: Date = new Date()): EligibilityResult {
  const missing: ValidationIssue[] = [];
  const invalid: ValidationIssue[] = [];
  const scopeReasons: string[] = [];
  const { profile, preferences, activity, goals } = b;

  let ageYears: number | null = null;
  if (!profile.dateOfBirth) missing.push({ field: 'dateOfBirth', message: 'Date of birth is required' });
  else {
    ageYears = ageInYears(profile.dateOfBirth, onDate);
    if (Number.isNaN(ageYears)) invalid.push({ field: 'dateOfBirth', message: 'Date of birth is not a valid date' });
    else if (ageYears < BOUNDS.ageYears.min) scopeReasons.push('NourishCart currently plans only for adults aged 18 and over.');
    else if (ageYears > BOUNDS.ageYears.max) invalid.push({ field: 'dateOfBirth', message: 'Please check the date of birth' });
  }

  if (profile.heightCm == null) missing.push({ field: 'heightCm', message: 'Height is required' });
  else if (profile.heightCm < BOUNDS.heightCm.min || profile.heightCm > BOUNDS.heightCm.max)
    invalid.push({ field: 'heightCm', message: `Height must be between ${BOUNDS.heightCm.min} and ${BOUNDS.heightCm.max} cm` });

  if (profile.weightKg == null) missing.push({ field: 'weightKg', message: 'Weight is required' });
  else if (profile.weightKg < BOUNDS.weightKg.min || profile.weightKg > BOUNDS.weightKg.max)
    invalid.push({ field: 'weightKg', message: `Weight must be between ${BOUNDS.weightKg.min} and ${BOUNDS.weightKg.max} kg` });

  if (!profile.sex) missing.push({ field: 'sex', message: 'Please answer the body-type question (you can choose “prefer not to say”)' });
  if (!activity.occupation) missing.push({ field: 'occupation', message: 'Daily work / occupation activity is required' });
  if (!activity.movement) missing.push({ field: 'movement', message: 'Everyday movement level is required' });
  if (activity.workoutsPerWeek > 0 && !activity.intensity)
    missing.push({ field: 'intensity', message: 'Exercise intensity is required when you exercise' });
  if (activity.workoutsPerWeek < 0 || activity.workoutsPerWeek > 14)
    invalid.push({ field: 'workoutsPerWeek', message: 'Workouts per week must be between 0 and 14' });
  if (activity.workoutMinutes < 0 || activity.workoutMinutes > 240)
    invalid.push({ field: 'workoutMinutes', message: 'Workout length must be between 0 and 240 minutes' });
  if (!goals.goal) missing.push({ field: 'goal', message: 'Please choose a goal' });
  if (!preferences.dietPattern) missing.push({ field: 'dietPattern', message: 'Please choose a food pattern' });
  if (!preferences.allergiesConfirmed)
    missing.push({ field: 'allergies', message: 'Please confirm allergies, or confirm that you have none' });
  if (!preferences.noClinicalFlagsConfirmed && preferences.clinicalFlags.length === 0)
    missing.push({ field: 'clinicalFlags', message: 'Please answer the health-scope question' });

  if (preferences.clinicalFlags.length > 0) {
    scopeReasons.push(
      'Based on what you shared, a personalised plan should come from a doctor or registered dietitian. NourishCart is a general-wellness tool for healthy adults.',
    );
  }

  const status: EligibilityStatus =
    scopeReasons.length > 0 ? 'out_of_scope' : missing.length > 0 || invalid.length > 0 ? 'incomplete' : 'eligible';
  return { status, ageYears, missing, invalid, scopeReasons };
}
