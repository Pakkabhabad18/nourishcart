// calculateTargets: assembles a versioned, immutable calculation record (PRD 7.3
// required fields). The UI shows this record as-is in "How was this estimated?".
import type { ProfileBundle, Sex } from '../types.ts';
import { validateProfileForNutrition, type EligibilityResult } from './eligibility.ts';
import { estimateEnergyRequirement, type EnergyEstimate } from './energy.ts';
import { estimateProteinRequirement, type ProteinEstimate } from './protein.ts';
import { CALCULATOR_ID, CALCULATOR_VERSION, ICMR_REFERENCE_ENERGY, METHODS } from './methods.ts';

export interface MacroRanges {
  status: 'not_configured';
  message: string;
}

/** estimateMacroRanges: deliberately returns no targets until a reviewed policy is configured. */
export function estimateMacroRanges(): MacroRanges {
  return {
    status: 'not_configured',
    message:
      'NourishCart does not set carbohydrate or fat targets yet. Plans report the carbs, fat and fibre they contain so you can see the mix, but no split is prescribed.',
  };
}

export interface CalculationRecord {
  calculatorId: string;
  methodVersion: string;
  methodStatus: 'provisional_demo';
  calculatedAt: string;
  inputsSnapshot: {
    ageYears: number;
    sex: Sex;
    heightCm: number;
    weightKg: number;
    occupation: string;
    movement: string;
    workoutsPerWeek: number;
    workoutMinutes: number;
    intensity: string | null;
    goal: string;
    questionnaireVersion: string;
  };
  equationId: string;
  coefficientSetId: string;
  activityMappingId: string;
  energy: EnergyEstimate;
  planningEnergyKcal: number;
  goalAdjustmentKcal: 0;
  protein: ProteinEstimate;
  macros: MacroRanges;
  referenceContext: {
    label: string;
    rows: { work: string; kcal: number }[];
  } | null;
  bmi: number;
  confidence: 'low' | 'medium';
  sourceRefs: string[];
  reviewedBy: null;
  limitations: string[];
  disclaimers: string[];
}

export type TargetsResult =
  | { ok: true; record: CalculationRecord; eligibility: EligibilityResult }
  | { ok: false; eligibility: EligibilityResult };

export function calculateTargets(b: ProfileBundle, now: Date = new Date()): TargetsResult {
  const eligibility = validateProfileForNutrition(b, now);
  if (eligibility.status !== 'eligible' || eligibility.ageYears == null) return { ok: false, eligibility };
  const p = b.profile;
  const sex = p.sex as Sex;
  const weightKg = p.weightKg as number;
  const heightCm = p.heightCm as number;
  const energy = estimateEnergyRequirement({ sex, ageYears: eligibility.ageYears, weightKg, activity: b.activity });
  const protein = estimateProteinRequirement(weightKg, b.goals.goal);
  const bmi = Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;

  const limitations = [
    'Energy is a provisional estimate from a published international equation, not from the ICMR-NIN 2020 adult BMR method. A qualified nutrition reviewer has not signed off this method yet.',
    'Activity is self-reported; the activity mapping is a product assumption inside FAO lifestyle bands.',
    ...energy.notes,
  ];
  if (b.goals.goal === 'weight_management') {
    limitations.push(
      'For weight management, plans stay close to your estimated maintenance energy. Any intentional deficit or surplus should be agreed with a qualified professional.',
    );
  }
  const refSex = sex === 'prefer_not_to_say' ? null : sex;
  const referenceContext = refSex
    ? {
        label: `ICMR-NIN 2020 reference ${refSex === 'male' ? 'man' : 'woman'} (${ICMR_REFERENCE_ENERGY[refSex].referenceWeightKg} kg) — population context, not your target`,
        rows: [
          { work: 'Sedentary work', kcal: ICMR_REFERENCE_ENERGY[refSex].sedentary },
          { work: 'Moderate work', kcal: ICMR_REFERENCE_ENERGY[refSex].moderate },
          { work: 'Heavy work', kcal: ICMR_REFERENCE_ENERGY[refSex].heavy },
        ],
      }
    : null;

  const record: CalculationRecord = {
    calculatorId: CALCULATOR_ID,
    methodVersion: CALCULATOR_VERSION,
    methodStatus: 'provisional_demo',
    calculatedAt: now.toISOString(),
    inputsSnapshot: {
      ageYears: eligibility.ageYears,
      sex,
      heightCm,
      weightKg,
      occupation: b.activity.occupation as string,
      movement: b.activity.movement as string,
      workoutsPerWeek: b.activity.workoutsPerWeek,
      workoutMinutes: b.activity.workoutMinutes,
      intensity: b.activity.intensity,
      goal: b.goals.goal as string,
      questionnaireVersion: b.activity.questionnaireVersion,
    },
    equationId: `${METHODS.energy.id}@${METHODS.energy.version}`,
    coefficientSetId: 'fao2004.table5_2.schofield',
    activityMappingId: `${METHODS.activity.id}@${METHODS.activity.version}`,
    energy,
    planningEnergyKcal: energy.teeKcal,
    goalAdjustmentKcal: 0,
    protein,
    macros: estimateMacroRanges(),
    referenceContext,
    bmi,
    confidence: sex === 'prefer_not_to_say' ? 'low' : 'medium',
    sourceRefs: [METHODS.energy.sourceUrl, METHODS.protein.sourceUrl].filter((x): x is string => !!x),
    reviewedBy: null,
    limitations,
    disclaimers: [
      'These are estimates for general wellness planning, not a diagnosis or medical advice.',
      'BMI is shown for context only and does not set your energy target.',
    ],
  };
  return { ok: true, record, eligibility };
}
