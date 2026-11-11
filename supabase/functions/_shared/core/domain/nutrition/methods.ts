// Versioned method registry. Every calculation result records which entries it used,
// so the same inputs + method version always reproduce the same output (FR-006).

export interface MethodEntry {
  id: string;
  version: string;
  status: 'provisional_demo' | 'reference_context' | 'not_configured' | 'reviewed';
  title: string;
  source: string;
  sourceUrl: string | null;
  verifiedOn: string; // date the source text was checked
  reviewedBy: string | null; // qualified nutrition reviewer; null until sign-off
  notes: string;
}

/**
 * BMR equations from FAO/WHO/UNU (2004) Human energy requirements, Table 5.2
 * (Schofield 1985), kcal/day with weight in kg. Checked against the FAO page on 2026-11-11.
 * ICMR-NIN 2020 notes that some international equations can overestimate Indian BMR
 * by 10-12%; we do NOT apply a blanket correction (PRD 7.3 gate). Instead the
 * lower end of the reported range reflects that possibility.
 */
export const SCHOFIELD_KCAL = {
  male: [
    { minAge: 18, maxAge: 29, slope: 15.057, intercept: 692.2 },
    { minAge: 30, maxAge: 59, slope: 11.472, intercept: 873.1 },
    { minAge: 60, maxAge: 200, slope: 11.711, intercept: 587.7 },
  ],
  female: [
    { minAge: 18, maxAge: 29, slope: 14.818, intercept: 486.6 },
    { minAge: 30, maxAge: 59, slope: 8.126, intercept: 845.6 },
    { minAge: 60, maxAge: 200, slope: 9.082, intercept: 658.5 },
  ],
} as const;

/** FAO/WHO/UNU 2004 Table 5.3 lifestyle PAL bands. */
export const FAO_PAL_BANDS = {
  sedentary_light: { min: 1.4, max: 1.69 },
  active_moderate: { min: 1.7, max: 1.99 },
  vigorous: { min: 2.0, max: 2.4 },
} as const;

/**
 * Product-chosen anchor PAL per occupation class. These sit inside the FAO bands; the
 * sedentary anchor uses 1.40, the value the ICMR-NIN 2020 note adopted for sedentary
 * work. The other anchors are product assumptions awaiting nutrition review.
 */
export const OCCUPATION_PAL_ANCHOR = {
  sedentary: 1.4,
  light: 1.55,
  moderate: 1.75,
  heavy: 2.05,
} as const;

export const MOVEMENT_PAL_ADJUSTMENT = { low: 0, medium: 0.05, high: 0.1 } as const;

/** Approximate physical activity ratios (multiples of BMR) for structured exercise. Product assumption. */
export const EXERCISE_PAR = { light: 3, moderate: 4.5, vigorous: 6.5 } as const;

/** ICMR-NIN 2020 brief note adult reference context (reference persons, not prescriptions). */
export const ICMR_REFERENCE_ENERGY = {
  male: { referenceWeightKg: 65, sedentary: 2110, moderate: 2710, heavy: 3470 },
  female: { referenceWeightKg: 55, sedentary: 1660, moderate: 2130, heavy: 2720 },
} as const;

/** ICMR-NIN 2020 protein references for healthy adults, g per kg body weight per day. */
export const ICMR_PROTEIN = {
  earGPerKg: 0.66,
  rdaGPerKg: 0.83,
  cerealBasedDietGPerKg: 1.0,
} as const;

export const METHODS = {
  energy: {
    id: 'energy.fao2004_schofield_pal',
    version: '1.0.0',
    status: 'provisional_demo',
    title: 'TEE = BMR × PAL (FAO/WHO/UNU 2004 Schofield BMR, product PAL mapping)',
    source: 'FAO/WHO/UNU (2004) Human energy requirements, Tables 5.2 and 5.3; ICMR-NIN (2020) brief note for TEE = BMR × PAL and sedentary PAL 1.40',
    sourceUrl: 'https://www.fao.org/3/y5686e/y5686e07.htm',
    verifiedOn: '2026-11-11',
    reviewedBy: null,
    notes:
      'ICMR-NIN 2020 adult BMR equations have not been extracted from the full report, so this is not an ICMR-derived personal estimate. Needs qualified nutrition review before public advice.',
  },
  activity: {
    id: 'activity.questionnaire_map',
    version: '1.0.0',
    status: 'provisional_demo',
    title: 'Occupation anchor + daily movement + structured exercise increment',
    source: 'Product mapping inside FAO 2004 PAL bands',
    sourceUrl: null,
    verifiedOn: '2026-11-11',
    reviewedBy: null,
    notes: 'Gym frequency alone never sets the class. Anchors and PAR values are product assumptions.',
  },
  protein: {
    id: 'protein.icmr2020_ear_rda',
    version: '1.0.0',
    status: 'reference_context',
    title: 'Protein EAR 0.66 g/kg/day for planning; RDA 0.83 g/kg/day shown as context',
    source: 'ICMR-NIN (2020) A Brief Note on Nutrient Requirements for Indians',
    sourceUrl: 'https://www.nin.res.in/rdabook/brief_note.pdf',
    verifiedOn: '2026-11-11',
    reviewedBy: null,
    notes: 'EAR is the planning reference; RDA assumes high-quality protein. No sports-performance target is applied.',
  },
  macros: {
    id: 'macros.policy',
    version: '0.0.0',
    status: 'not_configured',
    title: 'Fat / carbohydrate target policy',
    source: 'Not configured',
    sourceUrl: null,
    verifiedOn: '2026-11-11',
    reviewedBy: null,
    notes: 'PRD 7.4: no universal macro split. Planned carbs, fat and fibre are reported, but no target is set until a reviewed policy exists.',
  },
} satisfies Record<string, MethodEntry>;

export const CALCULATOR_ID = 'nourishcart.targets';
export const CALCULATOR_VERSION = '1.0.0';
export const ACTIVITY_QUESTIONNAIRE_VERSION = 'aq-1';
