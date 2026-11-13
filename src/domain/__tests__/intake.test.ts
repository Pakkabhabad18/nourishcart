// Intake: rule extractor basics, applying to a profile, and the LLM safety layers.
import { extractProfile, missingFollowUps } from '../intake/extract.ts';
import { applyExtraction } from '../intake/apply.ts';
import { mergeWithRules, sanitiseLlmOutput } from '../intake/llm.ts';
import { validateProfileForNutrition } from '../nutrition/eligibility.ts';
import { goldenBundle, NOW } from '../../test/fixtures.ts';

const GOLDEN = "I'm 26, female, 162 cm, 58 kg. Desk job, walk daily in the evening. Gym 3 times a week for 45 minutes, moderate. Vegetarian but I eat eggs. No allergies. Never eat bhindi. Build muscle. Rs 1500 per week. No health issues.";

describe('rule extractor', () => {
  it('fills every planning field from one description', () => {
    const e = extractProfile(GOLDEN, NOW);
    expect(missingFollowUps(e)).toEqual([]);
    expect(e.dietPattern?.value).toBe('eggetarian');
    expect(e.hardExclusions?.value).toEqual(['okra']);
    expect(e.dietPattern?.evidence).toMatch(/vegetarian but i eat eggs/);
  });
  it('never treats silence as "none"', () => {
    const e = extractProfile('26, male, 170 cm, 70 kg', NOW);
    expect(e.noAllergies).toBeUndefined();
    expect(e.noClinical).toBeUndefined();
    expect(missingFollowUps(e)).toEqual(expect.arrayContaining(['allergies', 'clinical', 'diet']));
  });
  it('understands negation of health conditions', () => {
    expect(extractProfile('I am not diabetic and not pregnant', NOW).clinicalFlags).toBeUndefined();
    expect(extractProfile('I am diabetic', NOW).clinicalFlags?.value).toEqual(['diabetes_clinical_diet']);
  });
});

describe('applying to a profile', () => {
  it('produces an eligible profile using stated age', () => {
    const blank = goldenBundle({ profile: { dateOfBirth: null, sex: null, heightCm: null, weightKg: null }, preferences: { dietPattern: null, allergiesConfirmed: false, hardExclusions: [], noClinicalFlagsConfirmed: false }, activity: { occupation: null, movement: null }, goals: { goal: null }, budget: { amountInr: null } });
    const b = applyExtraction(blank, extractProfile(GOLDEN, NOW), NOW);
    expect(b.profile.ageAtEntry).toBe(26);
    expect(validateProfileForNutrition(b, NOW).status).toBe('eligible');
    // a year later the age moves on without anyone re-entering it
    expect(validateProfileForNutrition(b, new Date('2027-11-14T00:00:00Z')).ageYears).toBe(27);
  });
  it('only adds allergies, never removes them', () => {
    const b = applyExtraction(goldenBundle({ preferences: { allergies: ['peanut'] } }), extractProfile('allergic to fish', NOW), NOW);
    expect(b.preferences.allergies.sort()).toEqual(['fish', 'peanut']);
  });
});

describe('LLM safety layers', () => {
  const said = 'i am vegetarian and 30 years old';
  it('drops fields whose evidence is not in what the person said', () => {
    const s = sanitiseLlmOutput(JSON.stringify({ dietPattern: { value: 'vegetarian', evidence: 'i am vegetarian' }, allergies: { value: ['peanut'], evidence: 'allergic to peanuts' }, ageYears: { value: 30, evidence: '30 years old' } }), said);
    expect(s.extraction.dietPattern?.value).toBe('vegetarian');
    expect(s.extraction.ageYears?.value).toBe(30);
    expect(s.extraction.allergies).toBeUndefined();
    expect(s.dropped[0].reason).toMatch(/evidence not found/);
  });
  it('rejects values outside the allowed lists and bad JSON', () => {
    expect(sanitiseLlmOutput('{"dietPattern":{"value":"pescatarian","evidence":"i am vegetarian"}}', said).extraction.dietPattern).toBeUndefined();
    expect(sanitiseLlmOutput('sorry, I cannot help', said).dropped[0].reason).toBe('not valid JSON');
  });
  it('accepts "no conditions" only when said in general terms', () => {
    const claim = (said: string, ev: string) => sanitiseLlmOutput(JSON.stringify({ noClinical: { value: true, evidence: ev } }), said).extraction.noClinical;
    expect(claim('i am not pregnant and not diabetic', 'not pregnant and not diabetic')).toBeUndefined();
    expect(claim('sugar ledu bp ledu', 'sugar ledu bp ledu')).toBeUndefined();
    expect(claim('no health problems', 'no health problems')).toBeDefined();
    expect(claim('health problems emi levu', 'health problems emi levu')).toBeDefined();
    expect(claim('not diabetic, nothing like that', 'nothing like that')).toBeDefined();
  });

  it('lets the AI correct plain facts but never loosen safety ones', () => {
    const said = "i'm 30... sorry 33, vegetarian, allergic to peanuts";
    const rules = extractProfile(said, NOW);
    const llm = sanitiseLlmOutput('{"ageYears":{"value":33,"evidence":"sorry 33"},"dietPattern":{"value":"eggetarian","evidence":"vegetarian"}}', said).extraction;
    const m = mergeWithRules(rules, llm);
    expect(m.ageYears?.value).toBe(33);
    expect(m.dietPattern?.value).toBe('vegetarian');
    expect(m.allergies?.value).toEqual(['peanut']);
  });

  it('merge can never be less safe than the rules', () => {
    const rules = extractProfile('vegetarian, allergic to peanuts', NOW);
    const llm = sanitiseLlmOutput('{"dietPattern":{"value":"eggetarian","evidence":"vegetarian"},"noAllergies":{"value":true,"evidence":"vegetarian"}}', 'vegetarian, allergic to peanuts').extraction;
    const m = mergeWithRules(rules, llm);
    expect(m.dietPattern?.value).toBe('vegetarian');
    expect(m.allergies?.value).toEqual(['peanut']);
    expect(m.noAllergies).toBeUndefined();
  });
});
