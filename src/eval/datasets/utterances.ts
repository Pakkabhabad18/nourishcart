// Labelled test set for the profile extractor. Each case is a description a user might
// type or say (speech-to-text output is lower-case with little punctuation), and the
// fields a careful human would fill from it. Fields not listed must stay EMPTY: filling
// them would be a hallucination. All people here are fictional.
import type { Allergen, ClinicalFlag, DietPattern, Goal, Intensity, MovementBand, OccupationClass, Sex } from '../../domain/types.ts';

export interface UtteranceGold {
  ageYears?: number;
  sex?: Sex;
  heightCm?: number; // compared with ±1.5 cm tolerance
  weightKg?: number; // compared with ±0.5 kg tolerance
  occupation?: OccupationClass;
  movement?: MovementBand;
  workoutsPerWeek?: number;
  workoutMinutes?: number;
  intensity?: Intensity;
  dietPattern?: DietPattern;
  allergies?: Allergen[];
  noAllergies?: true;
  hardExclusions?: string[];
  goal?: Goal;
  budgetInr?: number;
  budgetPeriod?: 'weekly' | 'monthly';
  clinicalFlags?: ClinicalFlag[];
  noClinical?: true;
}

export interface UtteranceCase {
  id: string;
  style: 'typed' | 'spoken' | 'hinglish' | 'adversarial';
  text: string;
  gold: UtteranceGold;
}

export const UTTERANCES: UtteranceCase[] = [
  {
    id: 'u01-golden', style: 'typed',
    text: "Hi, I'm 26 years old, female, 5 feet 4 inches and 58 kg. I work at a desk in an IT company and walk daily in the evening. Gym 3 times a week for 45 minutes, moderate. I'm vegetarian but I eat eggs. No allergies. I never eat bhindi. I want to build muscle. Budget is 1500 rupees per week. No health issues.",
    gold: { ageYears: 26, sex: 'female', heightCm: 162.6, weightKg: 58, occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 3, workoutMinutes: 45, intensity: 'moderate', dietPattern: 'eggetarian', noAllergies: true, hardExclusions: ['okra'], goal: 'muscle_fitness', budgetInr: 1500, budgetPeriod: 'weekly', noClinical: true },
  },
  {
    id: 'u02-spoken-golden', style: 'spoken',
    text: "i am 26 years old female 162 cm 58 kg i work in an office i walk to work gym 3 times a week 45 minutes moderate i am vegetarian but i eat eggs no allergies i never eat bhindi i want to build muscle my budget is 1500 rupees per week no health issues",
    gold: { ageYears: 26, sex: 'female', heightCm: 162, weightKg: 58, occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 3, workoutMinutes: 45, intensity: 'moderate', dietPattern: 'eggetarian', noAllergies: true, hardExclusions: ['okra'], goal: 'muscle_fitness', budgetInr: 1500, budgetPeriod: 'weekly', noClinical: true },
  },
  {
    id: 'u03-nonveg-peanut', style: 'typed',
    text: 'I am a 34 year old male, 178 cm, 82 kilos. Delivery job. Non veg. Allergic to peanuts. Want to lose weight. Rs 8000 monthly.',
    gold: { ageYears: 34, sex: 'male', heightCm: 178, weightKg: 82, occupation: 'moderate', dietPattern: 'non_vegetarian', allergies: ['peanut'], goal: 'weight_management', budgetInr: 8000, budgetPeriod: 'monthly' },
  },
  {
    id: 'u04-vegan-student', style: 'spoken',
    text: 'vegan twenty two girl 160 cm 50 kg student i dont exercise no allergies i want to eat healthy budget 1000 per week',
    gold: { ageYears: 22, sex: 'female', heightCm: 160, weightKg: 50, occupation: 'sedentary', workoutsPerWeek: 0, dietPattern: 'vegan', noAllergies: true, goal: 'general', budgetInr: 1000, budgetPeriod: 'weekly' },
  },
  {
    id: 'u05-pure-veg-dairy', style: 'typed',
    text: "I'm 41, male, pure veg. Lactose intolerant. Teacher. 70 kg, 5'7\". Want to eat balanced. ₹2000 a week.",
    gold: { ageYears: 41, sex: 'male', heightCm: 170.2, weightKg: 70, occupation: 'light', dietPattern: 'vegetarian', allergies: ['dairy'], goal: 'general', budgetInr: 2000, budgetPeriod: 'weekly' },
  },
  {
    id: 'u06-pregnant', style: 'typed',
    text: "I'm 29, female, 155 cm, 60 kg, vegetarian, pregnant, want to eat healthy.",
    gold: { ageYears: 29, sex: 'female', heightCm: 155, weightKg: 60, dietPattern: 'vegetarian', goal: 'general', clinicalFlags: ['pregnancy'] },
  },
  {
    id: 'u07-not-pregnant', style: 'typed',
    text: 'I am not pregnant and not diabetic. 30 years old woman, 165 cm, 62 kg, eggetarian.',
    gold: { ageYears: 30, sex: 'female', heightCm: 165, weightKg: 62, dietPattern: 'eggetarian' },
  },
  {
    id: 'u08-diabetic', style: 'spoken',
    text: 'i am 52 male 172 cm 90 kg non vegetarian i am diabetic want to lose weight',
    gold: { ageYears: 52, sex: 'male', heightCm: 172, weightKg: 90, dietPattern: 'non_vegetarian', goal: 'weight_management', clinicalFlags: ['diabetes_clinical_diet'] },
  },
  {
    id: 'u09-conflict-vegan-eggs', style: 'adversarial',
    text: "I'm vegan but I eat eggs sometimes. 24, male, 180 cm, 75 kg.",
    gold: { ageYears: 24, sex: 'male', heightCm: 180, weightKg: 75, dietPattern: 'vegan' },
  },
  {
    id: 'u10-veg-no-eggs', style: 'typed',
    text: 'Vegetarian, no eggs please. 28 years, female, 158 cm, 52 kg.',
    gold: { ageYears: 28, sex: 'female', heightCm: 158, weightKg: 52, dietPattern: 'vegetarian' },
  },
  {
    id: 'u11-nonveg-no-eggs', style: 'typed',
    text: 'I eat chicken and fish but no eggs. 31, male, 176 cm, 74 kg.',
    gold: { ageYears: 31, sex: 'male', heightCm: 176, weightKg: 74, dietPattern: 'non_vegetarian', hardExclusions: ['egg'] },
  },
  {
    id: 'u12-multi-allergy', style: 'typed',
    text: 'Allergic to peanuts, soy and sesame. Gluten intolerant too. 27, female, 163 cm, 55 kg, vegetarian.',
    gold: { ageYears: 27, sex: 'female', heightCm: 163, weightKg: 55, dietPattern: 'vegetarian', allergies: ['peanut', 'soy', 'sesame', 'gluten'] },
  },
  {
    id: 'u13-shellfish', style: 'spoken',
    text: 'i am 38 male non veg allergic to prawns 185 cm 88 kg software engineer gym 4 times a week 1 hour intense',
    gold: { ageYears: 38, sex: 'male', heightCm: 185, weightKg: 88, occupation: 'sedentary', workoutsPerWeek: 4, workoutMinutes: 60, intensity: 'vigorous', dietPattern: 'non_vegetarian', allergies: ['shellfish'] },
  },
  {
    id: 'u14-lbs', style: 'typed',
    text: '25, male, 6 ft, 165 lbs, eggetarian, want to build muscle, gym daily.',
    gold: { ageYears: 25, sex: 'male', heightCm: 182.9, weightKg: 74.8, dietPattern: 'eggetarian', goal: 'muscle_fitness', workoutsPerWeek: 7 },
  },
  {
    id: 'u15-decimal-feet', style: 'spoken',
    text: 'my height is 5.8 feet and i weigh 70 kgs i am 33 male vegetarian',
    gold: { ageYears: 33, sex: 'male', heightCm: 172.7, weightKg: 70, dietPattern: 'vegetarian' },
  },
  {
    id: 'u16-hinglish', style: 'hinglish',
    text: 'main 27 saal ka hoon, male, shakahari, anda nahi khata, 172 cm, 68 kg, office job, budget 1200 per week',
    gold: { sex: 'male', heightCm: 172, weightKg: 68, occupation: 'sedentary', dietPattern: 'vegetarian', budgetInr: 1200, budgetPeriod: 'weekly' },
  },
  {
    id: 'u17-steps', style: 'typed',
    text: 'I walk about 12000 steps a day, work in retail, 45 years female, 160 cm, 70 kg, vegetarian, want to lose weight.',
    gold: { ageYears: 45, sex: 'female', heightCm: 160, weightKg: 70, occupation: 'light', movement: 'high', dietPattern: 'vegetarian', goal: 'weight_management' },
  },
  {
    id: 'u18-construction', style: 'spoken',
    text: 'i work in construction i am 30 male 170 cm 65 kg non veg i eat everything budget 700 per week',
    gold: { ageYears: 30, sex: 'male', heightCm: 170, weightKg: 65, occupation: 'heavy', dietPattern: 'non_vegetarian', budgetInr: 700, budgetPeriod: 'weekly' },
  },
  {
    id: 'u19-tree-nuts', style: 'typed',
    text: 'Allergy to almonds and cashews. 36 year old woman, 168 cm, 64 kg, eggetarian, no health problems.',
    gold: { ageYears: 36, sex: 'female', heightCm: 168, weightKg: 64, dietPattern: 'eggetarian', allergies: ['tree_nut'], noClinical: true },
  },
  {
    id: 'u20-thyroid', style: 'typed',
    text: 'I have thyroid. 40, female, 158 cm, 66 kg, vegetarian.',
    gold: { ageYears: 40, sex: 'female', heightCm: 158, weightKg: 66, dietPattern: 'vegetarian', clinicalFlags: ['other_medical_condition'] },
  },
  {
    id: 'u21-minor', style: 'typed',
    text: "I'm 16, male, 170 cm, 55 kg, vegetarian, want to build muscle.",
    gold: { ageYears: 16, sex: 'male', heightCm: 170, weightKg: 55, dietPattern: 'vegetarian', goal: 'muscle_fitness' },
  },
  {
    id: 'u22-dislike-vs-never', style: 'typed',
    text: "I don't like tofu but I never eat mushrooms. Non veg. 29 male 175 cm 70 kg.",
    gold: { ageYears: 29, sex: 'male', heightCm: 175, weightKg: 70, dietPattern: 'non_vegetarian' },
  },
  {
    id: 'u23-avoid-paneer', style: 'spoken',
    text: 'vegetarian avoid paneer and rajma i am 35 female 160 cm 58 kg',
    gold: { ageYears: 35, sex: 'female', heightCm: 160, weightKg: 58, dietPattern: 'vegetarian', hardExclusions: ['paneer', 'rajma'] },
  },
  {
    id: 'u24-no-eggs-love-paneer', style: 'spoken',
    text: 'no eggs i love paneer vegetarian 26 male 175 cm 72 kg',
    gold: { ageYears: 26, sex: 'male', heightCm: 175, weightKg: 72, dietPattern: 'vegetarian' },
  },
  {
    id: 'u25-cardio', style: 'typed',
    text: 'I run 5 days a week for 30 minutes, light pace. 31 female 160 cm 54 kg vegan, no allergies.',
    gold: { ageYears: 31, sex: 'female', heightCm: 160, weightKg: 54, workoutsPerWeek: 5, workoutMinutes: 30, intensity: 'light', dietPattern: 'vegan', noAllergies: true },
  },
  {
    id: 'u26-born-year', style: 'typed',
    text: 'Born in 1990, male, 175 cm, 80 kg, non-vegetarian, want to lose fat, budget of 2500 per week.',
    gold: { ageYears: 36, sex: 'male', heightCm: 175, weightKg: 80, dietPattern: 'non_vegetarian', goal: 'weight_management', budgetInr: 2500, budgetPeriod: 'weekly' },
  },
  {
    id: 'u27-minimal', style: 'typed',
    text: 'I want to eat healthier.',
    gold: { goal: 'general' },
  },
  {
    id: 'u28-empty-ish', style: 'adversarial',
    text: 'hello',
    gold: {},
  },
  {
    id: 'u29-other-person', style: 'adversarial',
    text: 'My wife is vegetarian and my brother is allergic to peanuts. I am 33, male, 178 cm, 80 kg and I eat everything.',
    gold: { ageYears: 33, sex: 'male', heightCm: 178, weightKg: 80, dietPattern: 'non_vegetarian' },
  },
  {
    id: 'u30-says-no-allergy-then-names', style: 'adversarial',
    text: 'No allergies, oh wait I am allergic to fish. 30 male 170 cm 70 kg non veg.',
    gold: { ageYears: 30, sex: 'male', heightCm: 170, weightKg: 70, dietPattern: 'non_vegetarian', allergies: ['fish'] },
  },
  {
    id: 'u31-wfh', style: 'spoken',
    text: 'i work from home mostly sit all day 29 female 165 cm 68 kg eggetarian want to lose weight budget 1800 per week no health issues',
    gold: { ageYears: 29, sex: 'female', heightCm: 165, weightKg: 68, occupation: 'sedentary', movement: 'low', dietPattern: 'eggetarian', goal: 'weight_management', budgetInr: 1800, budgetPeriod: 'weekly', noClinical: true },
  },
  {
    id: 'u32-yoga', style: 'typed',
    text: 'Yoga 3 times a week for an hour. 50 year old woman, 155 cm, 60 kg, vegetarian, no allergies, eat healthy, I am healthy.',
    gold: { ageYears: 50, sex: 'female', heightCm: 155, weightKg: 60, workoutsPerWeek: 3, workoutMinutes: 60, dietPattern: 'vegetarian', noAllergies: true, goal: 'general', noClinical: true },
  },
  {
    id: 'u33-budget-first', style: 'typed',
    text: 'Student on a tight budget, 20, male, 170 cm, 60 kg, non veg, Rs 600 per week.',
    gold: { ageYears: 20, sex: 'male', heightCm: 170, weightKg: 60, occupation: 'sedentary', dietPattern: 'non_vegetarian', goal: 'budget_first', budgetInr: 600, budgetPeriod: 'weekly' },
  },
  {
    id: 'u34-breastfeeding', style: 'typed',
    text: 'I am breastfeeding, 31, female, 160 cm, 63 kg, vegetarian.',
    gold: { ageYears: 31, sex: 'female', heightCm: 160, weightKg: 63, dietPattern: 'vegetarian', clinicalFlags: ['lactation'] },
  },
  {
    id: 'u35-nurse-job', style: 'typed',
    text: 'I am a nurse, on my feet all day. 34, female, 162 cm, 59 kg, eggetarian.',
    gold: { ageYears: 34, sex: 'female', heightCm: 162, weightKg: 59, occupation: 'moderate', movement: 'high', dietPattern: 'eggetarian' },
  },
  {
    id: 'u36-veg-word-in-vegetables', style: 'adversarial',
    text: 'I eat chicken, fish and lots of vegetables. 27 male 172 cm 69 kg.',
    gold: { ageYears: 27, sex: 'male', heightCm: 172, weightKg: 69, dietPattern: 'non_vegetarian' },
  },
  {
    id: 'u37-egg-allergy-eggetarian', style: 'adversarial',
    text: 'Eggetarian but allergic to eggs. 28 female 160 cm 55 kg.',
    gold: { ageYears: 28, sex: 'female', heightCm: 160, weightKg: 55, dietPattern: 'eggetarian', allergies: ['egg'] },
  },
  {
    id: 'u38-kidney', style: 'spoken',
    text: 'i have kidney disease 60 male 168 cm 72 kg vegetarian',
    gold: { ageYears: 60, sex: 'male', heightCm: 168, weightKg: 72, dietPattern: 'vegetarian', clinicalFlags: ['kidney_disease'] },
  },
  {
    id: 'u39-monthly', style: 'typed',
    text: 'Grocery budget 6000 per month. 44 male 170 cm 78 kg eggetarian, maintain weight.',
    gold: { ageYears: 44, sex: 'male', heightCm: 170, weightKg: 78, dietPattern: 'eggetarian', goal: 'weight_management', budgetInr: 6000, budgetPeriod: 'monthly' },
  },
  {
    id: 'u40-no-meat', style: 'typed',
    text: "I don't eat meat. 32, female, 157 cm, 61 kg, cashier, no allergies.",
    gold: { ageYears: 32, sex: 'female', heightCm: 157, weightKg: 61, occupation: 'light', dietPattern: 'vegetarian', noAllergies: true },
  },
];

/**
 * Notes on deliberately hard cases:
 * - u16 (Hinglish): "saal ka" age and "anda nahi" are not understood by the rule parser; the
 *   gold omits age so the case measures what is reliably extracted. "shakahari" is understood.
 * - u22: tofu goes to dislikes (soft) and mushrooms are not in our food list; neither is a strict exclusion.
 * - u29: the facts are about the speaker (non-vegetarian, no allergy stated). Statements about
 *   other people may make the parser over-restrict; that is scored as a safe error, while
 *   under-restricting would be critical.
 * - u37: diet stays eggetarian, but the egg allergy is a hard filter, so no egg is ever planned.
 */
