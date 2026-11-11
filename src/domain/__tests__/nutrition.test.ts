// Nutrition engine tests: validation, units, energy/protein, EAR/RDA semantics, determinism.
import { validateProfileForNutrition } from '../nutrition/eligibility.ts';
import { estimatePal, estimateEnergyRequirement, schofieldBmr } from '../nutrition/energy.ts';
import { estimateProteinRequirement } from '../nutrition/protein.ts';
import { calculateTargets, estimateMacroRanges } from '../nutrition/targets.ts';
import { ICMR_REFERENCE_ENERGY, METHODS } from '../nutrition/methods.ts';
import { lbToKg, ftInToCm, cmToFtIn, unitPrice, ageInYears, toPaise, fromPaise } from '../units.ts';
import { goldenBundle, NOW } from '../../test/fixtures.ts';

describe('units', () => {
  it('converts kg/lb and cm/ft-in explicitly', () => {
    expect(lbToKg(132.277)).toBeCloseTo(60, 2);
    expect(ftInToCm(5, 4)).toBeCloseTo(162.56, 2);
    expect(cmToFtIn(182.88)).toEqual({ feet: 6, inches: 0 });
  });
  it('normalises unit prices only within the same unit basis', () => {
    expect(unitPrice(78, 1000, 'g')).toEqual({ value: 78, label: '/kg' });
    expect(unitPrice(30, 500, 'ml')).toEqual({ value: 60, label: '/L' });
    expect(unitPrice(48, 6, 'piece')).toEqual({ value: 8, label: '/piece' });
    expect(() => unitPrice(10, 0, 'g')).toThrow();
  });
  it('handles money in paise without float drift', () => {
    expect(fromPaise(toPaise(0.1) + toPaise(0.2))).toBe(0.3);
  });
  it('computes age in completed years', () => {
    expect(ageInYears('2000-11-12', NOW)).toBe(25);
    expect(ageInYears('2000-11-11', NOW)).toBe(26);
  });
});

describe('validateProfileForNutrition', () => {
  it('accepts the golden profile', () => {
    expect(validateProfileForNutrition(goldenBundle(), NOW).status).toBe('eligible');
  });
  it('never assumes missing inputs', () => {
    const r = validateProfileForNutrition(goldenBundle({ profile: { weightKg: null, dateOfBirth: null }, activity: { occupation: null } }), NOW);
    expect(r.status).toBe('incomplete');
    expect(r.missing.map((m) => m.field)).toEqual(expect.arrayContaining(['weightKg', 'dateOfBirth', 'occupation']));
  });
  it('rejects impossible values', () => {
    const r = validateProfileForNutrition(goldenBundle({ profile: { heightCm: 17, weightKg: 600 } }), NOW);
    expect(r.invalid.map((i) => i.field)).toEqual(['heightCm', 'weightKg']);
  });
  it('stops minors and clinical situations with a scope message', () => {
    expect(validateProfileForNutrition(goldenBundle({ profile: { dateOfBirth: '2010-01-01' } }), NOW).status).toBe('out_of_scope');
    expect(validateProfileForNutrition(goldenBundle({ preferences: { clinicalFlags: ['pregnancy'] } }), NOW).status).toBe('out_of_scope');
  });
  it('requires an explicit allergy answer (blank is not "none")', () => {
    const r = validateProfileForNutrition(goldenBundle({ preferences: { allergiesConfirmed: false } }), NOW);
    expect(r.missing.map((m) => m.field)).toContain('allergies');
  });
  it('requires intensity when the person exercises', () => {
    const r = validateProfileForNutrition(goldenBundle({ activity: { intensity: null } }), NOW);
    expect(r.missing.map((m) => m.field)).toContain('intensity');
  });
});

describe('energy', () => {
  it('uses the FAO 2004 Table 5.2 Schofield coefficients', () => {
    expect(schofieldBmr('male', 25, 65)).toBeCloseTo(15.057 * 65 + 692.2, 6);
    expect(schofieldBmr('female', 45, 55)).toBeCloseTo(8.126 * 55 + 845.6, 6);
    expect(schofieldBmr('male', 70, 60)).toBeCloseTo(11.711 * 60 + 587.7, 6);
  });
  it('maps activity so gym frequency alone does not set the class', () => {
    const desk3x = estimatePal({ profileId: 'x', questionnaireVersion: 'aq-1', occupation: 'sedentary', movement: 'low', workoutsPerWeek: 3, workoutMinutes: 45, workoutType: 'strength', intensity: 'moderate' });
    expect(desk3x.band).toBe('sedentary_light');
    expect(desk3x.pal).toBeLessThan(1.5);
    const heavy = estimatePal({ profileId: 'x', questionnaireVersion: 'aq-1', occupation: 'heavy', movement: 'high', workoutsPerWeek: 14, workoutMinutes: 240, workoutType: 'sport', intensity: 'vigorous' });
    expect(heavy.pal).toBe(2.4);
    expect(heavy.capped).toBe(true);
  });
  it('is deterministic and reports a range with the ICMR overestimation note in mind', () => {
    const a = goldenBundle().activity;
    const e1 = estimateEnergyRequirement({ sex: 'female', ageYears: 26, weightKg: 58, activity: a });
    const e2 = estimateEnergyRequirement({ sex: 'female', ageYears: 26, weightKg: 58, activity: a });
    expect(e1).toEqual(e2);
    expect(e1.rangeKcal.low).toBeLessThan(e1.teeKcal);
    expect(e1.rangeKcal.high).toBeGreaterThan(e1.teeKcal);
  });
  it('uses a neutral range when sex is not shared', () => {
    const e = estimateEnergyRequirement({ sex: 'prefer_not_to_say', ageYears: 30, weightKg: 60, activity: goldenBundle().activity });
    expect(e.sexPath).toBe('neutral_range');
    expect(e.notes[0]).toMatch(/both reference equations/);
  });
});

describe('protein EAR / RDA semantics', () => {
  it('keeps EAR (planning) and RDA (context) as separate values', () => {
    const p = estimateProteinRequirement(65, 'general');
    expect(p.earG).toBe(43); // 0.66 × 65 = 42.9
    expect(p.rdaG).toBe(54); // 0.83 × 65 = 53.95
    expect(p.cerealBasedContextG).toBe(65);
  });
  it('does not raise protein to a sports target for muscle goals', () => {
    const p = estimateProteinRequirement(70, 'muscle_fitness');
    expect(p.earG).toBe(46);
    expect(p.notes.join(' ')).toMatch(/No sports-performance protein target/);
  });
});

describe('calculateTargets', () => {
  it('produces a versioned, provisional record with reference context', () => {
    const r = calculateTargets(goldenBundle(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.methodStatus).toBe('provisional_demo');
    expect(r.record.equationId).toBe(`${METHODS.energy.id}@${METHODS.energy.version}`);
    expect(r.record.referenceContext?.rows[0].kcal).toBe(ICMR_REFERENCE_ENERGY.female.sedentary);
    expect(r.record.goalAdjustmentKcal).toBe(0);
    expect(r.record.disclaimers.join(' ')).toMatch(/BMI is shown for context only/);
  });
  it('does not set macro targets without a reviewed policy', () => {
    expect(estimateMacroRanges().status).toBe('not_configured');
  });
  it('returns no record for an ineligible profile', () => {
    expect(calculateTargets(goldenBundle({ profile: { dateOfBirth: '2012-01-01' } }), NOW).ok).toBe(false);
  });
});
