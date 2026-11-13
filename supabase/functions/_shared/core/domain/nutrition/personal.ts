// Personal targets: turns the maintenance estimate plus the person's own goal and numbers
// into the targets the planner uses. Pure functions, no I/O.
//
// Order of work:
//   1. suggestion  = maintenance energy adjusted for the body goal, protein per kg for the goal,
//                    fat as a share of energy, carbs the remainder, fibre per 1,000 kcal
//   2. the person's own numbers replace the suggestion where they typed one
//   3. safety limits are applied last, and every change is explained in `notes`
import type { BodyGoal, FocusNutrient, Goals, Sex } from '../types.ts';
import { round } from '../units.ts';

/** No typed-in numbers: every target uses the suggestion. */
export const NO_CUSTOM_TARGETS = { kcal: null, proteinG: null, carbsG: null, fatG: null, fibreG: null };

export const PERSONAL_TARGETS_VERSION = 'personal-targets-1.0.0';

/** Energy change per goal, as a share of maintenance. Moderate on purpose. */
export const GOAL_ENERGY_SHIFT: Record<BodyGoal, number> = { lose: -0.15, maintain: 0, gain: 0.1 };
/** Largest change we plan for, even if the person types a bigger one. */
export const MAX_DEFICIT = 0.2;
export const MAX_SURPLUS = 0.15;
/** Lowest daily energy we will ever plan, by sex (common clinical floors for unsupervised diets). */
export const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500, prefer_not_to_say: 1350 };

/** Suggested protein, g per kg body weight, by goal. */
export const PROTEIN_G_PER_KG: Record<BodyGoal, number> = { maintain: 1.0, lose: 1.4, gain: 1.6 };
export const PROTEIN_MAX_G_PER_KG = 2.0;
/** Fat as a share of energy: suggestion and allowed range (WHO / ICMR-NIN guidance on total fat). */
export const FAT_SHARE = { suggested: 0.25, min: 0.15, max: 0.35 };
/** Fibre: 14 g per 1,000 kcal (US Institute of Medicine adequate intake), bounded. */
export const FIBRE_G_PER_1000_KCAL = 14;
export const FIBRE_RANGE = { min: 15, max: 60 };

export const BODY_GOAL_LABEL: Record<BodyGoal, string> = { lose: 'Lose fat', maintain: 'Stay as I am', gain: 'Build muscle' };

export const FOCUS_LABEL: Record<FocusNutrient, string> = {
  iron: 'Iron',
  calcium: 'Calcium',
  b12: 'Vitamin B12',
  vitamin_d: 'Vitamin D',
  folate: 'Folate',
  zinc: 'Zinc',
};

/**
 * For nutrients the food table measures (iron, calcium) the planner uses the numbers.
 * For the rest it favours food groups that are well-known sources (ICMR-NIN 2020
 * "Dietary Guidelines for Indians"). This is a lean, not a guarantee of an amount.
 */
export const FOCUS_SOURCES: Record<FocusNutrient, { measured: 'ironMg' | 'calciumMg' | null; groups: string[]; tip: string }> = {
  iron: { measured: 'ironMg', groups: ['pulse', 'millet', 'vegetable'], tip: 'Ragi, bajra, dals and leafy greens. Have them with lemon or amla for better absorption.' },
  calcium: { measured: 'calciumMg', groups: ['dairy', 'millet', 'nut_seed'], tip: 'Milk, curd, paneer, ragi and sesame.' },
  b12: { measured: null, groups: ['dairy', 'egg', 'fish', 'meat'], tip: 'Milk, curd, eggs, fish and meat. Plant foods have almost none, so vegans usually need a supplement; ask a doctor.' },
  vitamin_d: { measured: null, groups: ['fish', 'egg', 'dairy'], tip: 'Mostly from sunlight. Food helps a little: fish, egg yolk, fortified milk.' },
  folate: { measured: null, groups: ['pulse', 'vegetable'], tip: 'Dals, chickpeas and green leafy vegetables.' },
  zinc: { measured: null, groups: ['pulse', 'millet', 'nut_seed', 'meat'], tip: 'Dals, millets, nuts, seeds and meat.' },
};

export type Source = 'suggested' | 'yours' | 'yours_adjusted';

export interface TargetValue {
  value: number;
  suggested: number;
  source: Source;
  /** Safe range for this person; the sliders on "My targets" can't go outside it. */
  min: number;
  max: number;
}

export interface PersonalTargets {
  version: string;
  bodyGoal: BodyGoal;
  maintenanceKcal: number;
  kcal: TargetValue;
  proteinG: TargetValue;
  carbsG: TargetValue;
  fatG: TargetValue;
  fibreG: TargetValue;
  focusNutrients: FocusNutrient[];
  /** Plain sentences explaining any adjustment we made to a typed-in number. */
  notes: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function pick(suggested: number, typed: number | null, lo: number, hi: number, what: string, unit: string, notes: string[]): TargetValue {
  const min = Math.ceil(lo);
  const max = Math.max(min, Math.floor(hi));
  const s = Math.round(clamp(suggested, min, max));
  if (typed == null) return { value: s, suggested: s, source: 'suggested', min, max };
  const v = Math.round(clamp(typed, min, max));
  if (v !== Math.round(typed)) {
    notes.push(`Your ${what} of ${Math.round(typed).toLocaleString('en-IN')} ${unit} is outside the safe range for you, so we plan with ${v.toLocaleString('en-IN')} ${unit}.`);
    return { value: v, suggested: s, source: 'yours_adjusted', min, max };
  }
  return { value: v, suggested: s, source: 'yours', min, max };
}

/**
 * personalTargets: the numbers the planner aims for.
 * `bmrKcal` keeps the energy floor above resting needs; `earG` is the protein floor that
 * plans are always validated against, whatever the person types.
 */
export function personalTargets(input: { maintenanceKcal: number; bmrKcal: number; weightKg: number; sex: Sex; earG: number; goals: Goals }): PersonalTargets {
  const { maintenanceKcal, bmrKcal, weightKg, sex, earG, goals } = input;
  // No body goal chosen yet = plan at maintenance (the safe default; older profiles keep their numbers).
  const bodyGoal: BodyGoal = goals.bodyGoal ?? 'maintain';
  const notes: string[] = [];

  // Energy
  const floor = Math.max(KCAL_FLOOR[sex], Math.round(bmrKcal));
  const lo = Math.max(floor, Math.round(maintenanceKcal * (1 - MAX_DEFICIT)));
  const hi = Math.round(maintenanceKcal * (1 + MAX_SURPLUS));
  const kcal = pick(maintenanceKcal * (1 + GOAL_ENERGY_SHIFT[bodyGoal]), goals.custom.kcal, lo, Math.max(lo, hi), 'calorie target', 'kcal', notes);

  // Protein: never below the EAR floor, never above 2 g/kg.
  const proteinG = pick(weightKg * PROTEIN_G_PER_KG[bodyGoal], goals.custom.proteinG, earG, weightKg * PROTEIN_MAX_G_PER_KG, 'protein target', 'g', notes);

  // Fat by share of energy (9 kcal/g); carbs take what is left (4 kcal/g).
  const fatG = pick((kcal.value * FAT_SHARE.suggested) / 9, goals.custom.fatG, (kcal.value * FAT_SHARE.min) / 9, (kcal.value * FAT_SHARE.max) / 9, 'fat target', 'g', notes);
  const carbKcal = Math.max(0, kcal.value - proteinG.value * 4 - fatG.value * 9);
  const carbsG = pick(carbKcal / 4, goals.custom.carbsG, (kcal.value * 0.3) / 4, (kcal.value * 0.7) / 4, 'carb target', 'g', notes);

  const fibreG = pick((kcal.value / 1000) * FIBRE_G_PER_1000_KCAL, goals.custom.fibreG, FIBRE_RANGE.min, FIBRE_RANGE.max, 'fibre target', 'g', notes);

  return { version: PERSONAL_TARGETS_VERSION, bodyGoal, maintenanceKcal: Math.round(maintenanceKcal), kcal, proteinG, carbsG, fatG, fibreG, focusNutrients: goals.focusNutrients, notes };
}

/** kcal from the three macros, to show when typed numbers don't add up to the calorie target. */
export function macroKcal(t: Pick<PersonalTargets, 'proteinG' | 'carbsG' | 'fatG'>): number {
  return round(t.proteinG.value * 4 + t.carbsG.value * 4 + t.fatG.value * 9, 0);
}
