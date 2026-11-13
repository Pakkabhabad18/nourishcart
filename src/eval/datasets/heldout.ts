// HELD-OUT test set for profile reading. Written AFTER the rule reader was finished and
// never used to tune it, so it measures how each reader copes with phrasing it has not
// seen. The 40 cases in utterances.ts were used while building the rules (a development
// set); scoring only on those would flatter the rules.
// Labels follow the same policy as utterances.ts: fill only what a careful person would
// fill from the words alone; anything not listed must stay empty. All people are fictional.
import type { UtteranceCase } from './utterances.ts';

export const HELDOUT: UtteranceCase[] = [
  {
    id: 'h01-cab-driver-ramble', style: 'spoken',
    text: "okay so um I'm thirty two I'm a guy around five eleven and I weigh like seventy eight kilos I drive a cab all day so mostly sitting I don't really work out I eat everything chicken mutton fish all of it no allergies as far as I know want to lose some weight budget around six thousand a month no health problems",
    gold: { ageYears: 32, sex: 'male', heightCm: 180.3, weightKg: 78, occupation: 'sedentary', workoutsPerWeek: 0, dietPattern: 'non_vegetarian', noAllergies: true, goal: 'weight_management', budgetInr: 6000, budgetPeriod: 'monthly', noClinical: true },
  },
  {
    id: 'h02-hindi-homemaker', style: 'hinglish',
    text: 'Main 24 saal ki hoon, height 155 cm, weight 62 kilo. Ghar pe rehti hoon, din bhar ghar ka kaam karti hoon. Pure veg hoon, anda bhi nahi khaati. Peanut se allergy hai. Weight kam karna hai. Mahine ka budget 4000.',
    gold: { ageYears: 24, sex: 'female', heightCm: 155, weightKg: 62, occupation: 'moderate', dietPattern: 'vegetarian', allergies: ['peanut'], goal: 'weight_management', budgetInr: 4000, budgetPeriod: 'monthly' },
  },
  {
    id: 'h03-jain-teacher', style: 'typed',
    text: "I'm 41, female. 168 centimetres, 70 kilograms. Teacher, I'm on my feet most of the day. I'm a Jain so no onion, no garlic, no potatoes, and obviously no eggs or meat. Yoga every morning for half an hour, light. Lactose intolerant. Just want to eat healthier. About 2000 rupees a week. Nothing medical.",
    gold: { ageYears: 41, sex: 'female', heightCm: 168, weightKg: 70, occupation: 'moderate', workoutsPerWeek: 7, workoutMinutes: 30, intensity: 'light', dietPattern: 'vegetarian', allergies: ['dairy'], hardExclusions: ['onion', 'potato'], goal: 'general', budgetInr: 2000, budgetPeriod: 'weekly', noClinical: true },
  },
  {
    id: 'h05-imperial-lifter', style: 'typed',
    text: 'Male, 29. 6 feet 1, 190 pounds. Software engineer, wfh. I lift 5 days a week, an hour, pretty intense. Eggs and dairy fine but no meat. Allergic to shellfish (not that it matters). Bulk up. 2500 a week.',
    gold: { ageYears: 29, sex: 'male', heightCm: 185.4, weightKg: 86.2, occupation: 'sedentary', workoutsPerWeek: 5, workoutMinutes: 60, intensity: 'vigorous', dietPattern: 'eggetarian', allergies: ['shellfish'], goal: 'muscle_fitness', budgetInr: 2500, budgetPeriod: 'weekly' },
  },
  {
    id: 'h06-telugu-english', style: 'hinglish',
    text: 'naa age 35, female, height 160, weight 65. office lo desk job. roju walking chestanu. nenu vegetarian, egg kuda tintanu. allergies emi levu. weight taggali. budget nelaki 5000. health problems emi levu.',
    gold: { ageYears: 35, sex: 'female', heightCm: 160, weightKg: 65, occupation: 'sedentary', movement: 'medium', dietPattern: 'eggetarian', noAllergies: true, goal: 'weight_management', budgetInr: 5000, budgetPeriod: 'monthly', noClinical: true },
  },
  {
    id: 'h07-retired-negations', style: 'typed',
    text: "I'm 52 and male. Not diabetic, no BP, nothing like that. 172 cm, 80 kg. Retired, I walk about 10 to 12 thousand steps daily. Non-veg. No allergies. Just want to stay healthy. Budget 1200 per week.",
    gold: { ageYears: 52, sex: 'male', heightCm: 172, weightKg: 80, movement: 'high', dietPattern: 'non_vegetarian', noAllergies: true, goal: 'general', budgetInr: 1200, budgetPeriod: 'weekly', noClinical: true },
  },
  {
    id: 'h08-pregnant-lowercase', style: 'spoken',
    text: '28 female 158 cm 54 kg seven months pregnant vegetarian allergic to soy want a healthy diet 3000 a month',
    gold: { ageYears: 28, sex: 'female', heightCm: 158, weightKg: 54, clinicalFlags: ['pregnancy'], dietPattern: 'vegetarian', allergies: ['soy'], goal: 'general', budgetInr: 3000, budgetPeriod: 'monthly' },
  },
  {
    id: 'h09-texting-style', style: 'typed',
    text: 'hey! 23F, 5\'2, 50kg, college student, i play badminton 4x a week for like 90 mins, vegan 🌱, nut allergy (tree nuts not peanuts), gain some muscle, 800/week',
    gold: { ageYears: 23, sex: 'female', heightCm: 157.5, weightKg: 50, occupation: 'sedentary', workoutsPerWeek: 4, workoutMinutes: 90, dietPattern: 'vegan', allergies: ['tree_nut'], goal: 'muscle_fitness', budgetInr: 800, budgetPeriod: 'weekly' },
  },
  {
    id: 'h10-husband-facts', style: 'adversarial',
    text: "My husband eats meat but I'm strictly vegetarian, no eggs. I'm 45, 160 cm, 68 kg, female. He has a peanut allergy, I don't have any allergies. I have a desk job. Want to manage my weight. Budget 2000 weekly for me. No health conditions.",
    gold: { ageYears: 45, sex: 'female', heightCm: 160, weightKg: 68, occupation: 'sedentary', dietPattern: 'vegetarian', noAllergies: true, goal: 'weight_management', budgetInr: 2000, budgetPeriod: 'weekly', noClinical: true },
  },
  {
    id: 'h11-kidney-run-on', style: 'spoken',
    text: 'im 60 male 165 cm 70 kg doctor told me i have kidney disease so i need a diet vegetarian no allergies',
    gold: { ageYears: 60, sex: 'male', heightCm: 165, weightKg: 70, clinicalFlags: ['kidney_disease'], dietPattern: 'vegetarian', noAllergies: true },
  },
  {
    id: 'h12-gluten-sick', style: 'typed',
    text: "I can't have gluten at all, it makes me really sick. 31 year old woman, 165 cm and 59 kg, gym thrice weekly for an hour, moderate. I eat everything else including fish and chicken. Goal is fitness and muscle. 1800 per week.",
    gold: { ageYears: 31, sex: 'female', heightCm: 165, weightKg: 59, workoutsPerWeek: 3, workoutMinutes: 60, intensity: 'moderate', dietPattern: 'non_vegetarian', allergies: ['gluten'], goal: 'muscle_fitness', budgetInr: 1800, budgetPeriod: 'weekly' },
  },
  {
    id: 'h13-construction', style: 'typed',
    text: "I'm a construction worker, 27, man, 170 cm 65 kg, the work is very heavy, lifting all day. I eat eggs, chicken, everything. Want more energy and muscle. 1000 rupees a week. No allergies, no illness.",
    gold: { ageYears: 27, sex: 'male', heightCm: 170, weightKg: 65, occupation: 'heavy', dietPattern: 'non_vegetarian', goal: 'muscle_fitness', budgetInr: 1000, budgetPeriod: 'weekly', noAllergies: true, noClinical: true },
  },
  {
    id: 'h14-two-corrections', style: 'adversarial',
    text: "I'm 30... sorry, 33. Height 175, weight 72, male. Vegetarian. Allergies: none. Actually wait, I do get a reaction to sesame. Desk job. Budget 1500 a week. Just general health.",
    gold: { ageYears: 33, sex: 'male', heightCm: 175, weightKg: 72, dietPattern: 'vegetarian', allergies: ['sesame'], occupation: 'sedentary', budgetInr: 1500, budgetPeriod: 'weekly', goal: 'general' },
  },
  {
    id: 'h15-student-cheapest', style: 'typed',
    text: 'Student, 21, male, 178 cm, 63 kg. Very tight budget, 600 a week max, I just want the cheapest healthy food. Non vegetarian. No allergies.',
    gold: { ageYears: 21, sex: 'male', heightCm: 178, weightKg: 63, occupation: 'sedentary', budgetInr: 600, budgetPeriod: 'weekly', goal: 'budget_first', dietPattern: 'non_vegetarian', noAllergies: true },
  },
  {
    id: 'h16-new-mother', style: 'typed',
    text: "Mother of a 4 month old, I'm breastfeeding. 30, 162cm, 60kg, eggetarian, no allergies.",
    gold: { ageYears: 30, sex: 'female', heightCm: 162, weightKg: 60, clinicalFlags: ['lactation'], dietPattern: 'eggetarian', noAllergies: true },
  },
  {
    id: 'h17-prawn-correction', style: 'adversarial',
    text: "I'm 38, female, 163 cm, 61 kg. I don't eat chicken or mutton but I eat fish and eggs. Allergic to fish though... no wait, I mean prawns, I'm allergic to prawns. Fish is fine.",
    gold: { ageYears: 38, sex: 'female', heightCm: 163, weightKg: 61, dietPattern: 'non_vegetarian', allergies: ['shellfish'] },
  },
  {
    id: 'h18-milk-allergy-egg', style: 'typed',
    text: 'No dairy for me, I am allergic to milk. Otherwise vegetarian, and I do eat eggs. 25 yrs, male, 5 ft 8, 68 kg.',
    gold: { ageYears: 25, sex: 'male', heightCm: 172.7, weightKg: 68, dietPattern: 'eggetarian', allergies: ['dairy'] },
  },
  {
    id: 'h19-recovery', style: 'typed',
    text: "I'm 19, female, recovering from anorexia and my dietitian asked me to track meals. Vegetarian. 160 cm, 45 kg.",
    gold: { ageYears: 19, sex: 'female', heightCm: 160, weightKg: 45, clinicalFlags: ['eating_disorder'], dietPattern: 'vegetarian' },
  },
  {
    id: 'h20-manager-steps', style: 'typed',
    text: 'Age 44. Male. 182 cm. 95 kg. Manager, meetings all day. I hardly walk, maybe 3000 steps. Badminton twice a week, 1 hour, moderate. Eat non veg. No allergies. Lose weight. Monthly budget 8000. No medical issues.',
    gold: { ageYears: 44, sex: 'male', heightCm: 182, weightKg: 95, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 2, workoutMinutes: 60, intensity: 'moderate', dietPattern: 'non_vegetarian', noAllergies: true, goal: 'weight_management', budgetInr: 8000, budgetPeriod: 'monthly', noClinical: true },
  },
];
