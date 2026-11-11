// Protein references. EAR, RDA and the cereal-diet note are kept as separate fields
// and never collapsed into one "target" (PRD 2.4, 7.4).
import { round } from '../units.ts';
import { ICMR_PROTEIN } from './methods.ts';

export interface ProteinEstimate {
  earG: number; // planning floor used by the meal planner
  rdaG: number; // reference context only
  cerealBasedContextG: number; // context only, not a multiplier
  basis: 'actual_body_weight';
  notes: string[];
}

export function estimateProteinRequirement(weightKg: number, goal: string | null): ProteinEstimate {
  if (!(weightKg > 0)) throw new Error('weightKg must be positive');
  const notes = [
    'The meal planner checks plans against the EAR (0.66 g/kg/day), which ICMR-NIN recommends for menu planning.',
    'The RDA (0.83 g/kg/day) assumes high-quality protein and is shown for context, not as the plan target.',
  ];
  if (goal === 'muscle_fitness') {
    notes.push(
      'For your muscle/fitness goal, plans favour affordable protein-rich foods and spread protein across meals. No sports-performance protein target is applied until a reviewed policy exists.',
    );
  }
  return {
    earG: round(weightKg * ICMR_PROTEIN.earGPerKg, 0),
    rdaG: round(weightKg * ICMR_PROTEIN.rdaGPerKg, 0),
    cerealBasedContextG: round(weightKg * ICMR_PROTEIN.cerealBasedDietGPerKg, 0),
    basis: 'actual_body_weight',
    notes,
  };
}
