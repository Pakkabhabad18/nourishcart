// Energy estimation: TEE = BMR × PAL. Pure functions, no defaults for missing inputs.
import type { ActivityAssessment, Sex } from '../types.ts';
import { round } from '../units.ts';
import {
  EXERCISE_PAR,
  FAO_PAL_BANDS,
  MOVEMENT_PAL_ADJUSTMENT,
  OCCUPATION_PAL_ANCHOR,
  SCHOFIELD_KCAL,
} from './methods.ts';

export function schofieldBmr(sex: 'male' | 'female', ageYears: number, weightKg: number): number {
  const row = SCHOFIELD_KCAL[sex].find((r) => ageYears >= r.minAge && ageYears <= r.maxAge);
  if (!row) throw new Error(`No BMR equation for age ${ageYears}`);
  return row.slope * weightKg + row.intercept;
}

export interface PalResult {
  pal: number;
  occupationAnchor: number;
  movementAdjustment: number;
  exerciseIncrement: number;
  band: keyof typeof FAO_PAL_BANDS;
  capped: boolean;
}

/**
 * Activity mapping. Exercise adds (hours/day of exercise) × (PAR − 1) / 24, i.e. the
 * extra energy above resting for the time spent exercising, averaged over the week.
 * This is why 3 gym sessions alone barely move the class: occupation and everyday
 * movement dominate, as the PRD requires.
 */
export function estimatePal(a: ActivityAssessment): PalResult {
  if (!a.occupation || !a.movement) throw new Error('occupation and movement are required');
  const occupationAnchor = OCCUPATION_PAL_ANCHOR[a.occupation];
  const movementAdjustment = MOVEMENT_PAL_ADJUSTMENT[a.movement];
  let exerciseIncrement = 0;
  if (a.workoutsPerWeek > 0 && a.workoutMinutes > 0) {
    if (!a.intensity) throw new Error('intensity required when exercising');
    const hoursPerDay = (a.workoutsPerWeek * a.workoutMinutes) / 60 / 7;
    exerciseIncrement = (hoursPerDay * (EXERCISE_PAR[a.intensity] - 1)) / 24;
  }
  const raw = occupationAnchor + movementAdjustment + exerciseIncrement;
  const capped = raw > FAO_PAL_BANDS.vigorous.max;
  const pal = round(Math.min(raw, FAO_PAL_BANDS.vigorous.max), 2);
  const band = pal >= FAO_PAL_BANDS.vigorous.min ? 'vigorous' : pal >= FAO_PAL_BANDS.active_moderate.min ? 'active_moderate' : 'sedentary_light';
  return { pal, occupationAnchor, movementAdjustment, exerciseIncrement: round(exerciseIncrement, 3), band, capped };
}

export interface EnergyEstimate {
  bmrKcal: number;
  pal: PalResult;
  teeKcal: number; // point estimate, rounded to 10 kcal
  rangeKcal: { low: number; high: number };
  sexPath: 'male' | 'female' | 'neutral_range';
  notes: string[];
}

/**
 * estimateEnergyRequirement. For "prefer not to say" we compute both equations and
 * report the span, with the midpoint as the planning value and lower confidence.
 * The range lower bound is 12% below the point estimate to reflect the ICMR-NIN note
 * that international equations can overestimate Indian BMR by 10-12%; the upper bound
 * is +10% for ordinary individual variation. This is a display range, not a correction.
 */
export function estimateEnergyRequirement(input: { sex: Sex; ageYears: number; weightKg: number; activity: ActivityAssessment }): EnergyEstimate {
  const pal = estimatePal(input.activity);
  const notes: string[] = [];
  let bmr: number;
  let sexPath: EnergyEstimate['sexPath'];
  let low: number;
  let high: number;
  if (input.sex === 'prefer_not_to_say') {
    const m = schofieldBmr('male', input.ageYears, input.weightKg);
    const f = schofieldBmr('female', input.ageYears, input.weightKg);
    bmr = (m + f) / 2;
    sexPath = 'neutral_range';
    low = Math.min(m, f) * pal.pal * 0.88;
    high = Math.max(m, f) * pal.pal * 1.1;
    notes.push('You chose not to share the body-type input, so the range spans both reference equations.');
  } else {
    bmr = schofieldBmr(input.sex, input.ageYears, input.weightKg);
    sexPath = input.sex;
    low = bmr * pal.pal * 0.88;
    high = bmr * pal.pal * 1.1;
  }
  if (pal.capped) notes.push('Activity level was capped at PAL 2.40, the upper end of the FAO sustainable range.');
  const tee = bmr * pal.pal;
  return {
    bmrKcal: round(bmr, 0),
    pal,
    teeKcal: round(tee / 10, 0) * 10,
    rangeKcal: { low: round(low / 10, 0) * 10, high: round(high / 10, 0) * 10 },
    sexPath,
    notes,
  };
}
