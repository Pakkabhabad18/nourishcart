// Scripted setup conversations, answered the way people actually talk: short, mixed
// Hindi-English, numbers as words, answers that cover more than one question, and a
// few answers that are unclear the first time.
// `answers[key]` is what the person says when asked that question; an array means they
// say the first thing, are asked again, and then say the second.
// `expect` is the hand-written correct result. Written after the engine, in the same
// session, so this is a test set, not a held-out set.
import type { Allergen, BodyGoal, DietPattern, FocusNutrient } from '../../domain/types.ts';
import type { QKey } from '../../domain/intake/conversation.ts';

export interface ConvCase {
  id: string;
  answers: Partial<Record<QKey, string | string[]>>;
  expect: {
    age: number;
    sex: 'male' | 'female' | 'prefer_not_to_say';
    heightCm: number; // within ±2 cm
    weightKg: number;
    occupation: 'sedentary' | 'light' | 'moderate' | 'heavy';
    movement: 'low' | 'medium' | 'high';
    workoutsPerWeek: number;
    diet: DietPattern;
    allergies: Allergen[]; // [] = said no allergies
    bodyGoal: BodyGoal;
    focus: FocusNutrient[];
    budgetInr: number;
    budgetPeriod: 'weekly' | 'monthly';
    clinical: boolean; // true = said a doctor-managed condition (must end out of scope)
  };
}

export const CONVERSATIONS: ConvCase[] = [
  {
    id: 'c01',
    answers: { age: '26', sex: 'female', height: '5 feet 4', weight: '58', occupation: 'desk job', movement: 'not much', workouts: 'three times a week', workoutDetails: '45 minutes moderate', diet: 'vegetarian but I eat eggs', allergies: 'no', exclusions: 'bhindi', goal: 'build muscle', focus: 'iron', budget: '1500 a week', clinical: 'no' },
    expect: { age: 26, sex: 'female', heightCm: 162.6, weightKg: 58, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 3, diet: 'eggetarian', allergies: [], bodyGoal: 'gain', focus: ['iron'], budgetInr: 1500, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c02',
    answers: { age: "I'm thirty two", sex: 'male', height: '178 cm', weight: '82 kilos', occupation: 'software engineer, work from home', movement: 'barely, maybe 3000 steps', workouts: 'no', diet: 'non veg', allergies: 'none', exclusions: 'nothing', goal: 'I want to lose weight', focus: 'not sure', budget: '8000 per month', clinical: 'nope' },
    expect: { age: 32, sex: 'male', heightCm: 178, weightKg: 82, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 0, diet: 'non_vegetarian', allergies: [], bodyGoal: 'lose', focus: [], budgetInr: 8000, budgetPeriod: 'monthly', clinical: false },
  },
  {
    id: 'c03',
    answers: { age: "I'm 41, male, 170 cm and 75 kg, I'm a teacher", movement: 'a fair bit', workouts: 'yoga daily', workoutDetails: '30 min light', diet: 'pure veg', allergies: 'peanuts', exclusions: 'mushroom', goal: 'stay the same', focus: 'vitamin d and b12', budget: '2000 a week', clinical: 'no' },
    expect: { age: 41, sex: 'male', heightCm: 170, weightKg: 75, occupation: 'light', movement: 'medium', workoutsPerWeek: 7, diet: 'vegetarian', allergies: ['peanut'], bodyGoal: 'maintain', focus: ['vitamin_d', 'b12'], budgetInr: 2000, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c04',
    answers: { age: ['umm', '29'], sex: 'woman', height: '160', weight: ['around sixty', '60 kg'], occupation: 'nurse', movement: 'a lot', workouts: '2', workoutDetails: 'one hour, intense', diet: 'I eat everything', allergies: 'milk', exclusions: 'no', goal: 'cut fat', focus: 'my hemoglobin is low', budget: 'rs 1200 weekly', clinical: 'no health conditions' },
    expect: { age: 29, sex: 'female', heightCm: 160, weightKg: 60, occupation: 'moderate', movement: 'high', workoutsPerWeek: 2, diet: 'non_vegetarian', allergies: ['dairy'], bodyGoal: 'lose', focus: ['iron'], budgetInr: 1200, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c05',
    answers: { age: '55', sex: 'prefer not to say', height: '5.6', weight: '70', occupation: 'retired, mostly at home sitting', movement: 'some', workouts: "don't work out", diet: 'vegan', allergies: 'no allergies', exclusions: 'nothing', goal: 'just eat healthy', focus: 'calcium', budget: '1000', budgetPeriod: 'week', clinical: 'no' },
    expect: { age: 55, sex: 'prefer_not_to_say', heightCm: 170.7, weightKg: 70, occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 0, diet: 'vegan', allergies: [], bodyGoal: 'maintain', focus: ['calcium'], budgetInr: 1000, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c06',
    answers: { age: '23', sex: 'male', height: '6 feet', weight: '68', occupation: 'student', movement: '12000 steps', workouts: '5 times a week', workoutDetails: '60 minutes hard', diet: 'non vegetarian', allergies: 'no', exclusions: 'nothing', goal: 'bulk up', focus: 'no', budget: '3000 a month', clinical: 'no' },
    expect: { age: 23, sex: 'male', heightCm: 182.9, weightKg: 68, occupation: 'sedentary', movement: 'high', workoutsPerWeek: 5, diet: 'non_vegetarian', allergies: [], bodyGoal: 'gain', focus: [], budgetInr: 3000, budgetPeriod: 'monthly', clinical: false },
  },
  {
    id: 'c07',
    answers: { age: '35', sex: 'female', height: '155 cm', weight: '62', occupation: 'homemaker', movement: 'okay amount', workouts: 'no', diet: 'eggetarian', allergies: 'gluten', exclusions: 'brinjal', goal: 'lose fat', focus: 'folic acid', budget: '1800 a week', clinical: "I'm pregnant" },
    // ICMR-NIN lists homemakers under moderate work, so 'moderate' is the right answer here.
    expect: { age: 35, sex: 'female', heightCm: 155, weightKg: 62, occupation: 'moderate', movement: 'medium', workoutsPerWeek: 0, diet: 'eggetarian', allergies: ['gluten'], bodyGoal: 'lose', focus: ['folate'], budgetInr: 1800, budgetPeriod: 'weekly', clinical: true },
  },
  {
    id: 'c08',
    answers: { age: '47', sex: 'male', height: '172', weight: '90', occupation: 'construction work', movement: 'all day', workouts: 'never', diet: 'non veg', allergies: 'no', exclusions: 'nothing', goal: 'lose weight', focus: 'no', budget: '1500 a week', clinical: 'yes I follow a diabetes diet from my doctor' },
    expect: { age: 47, sex: 'male', heightCm: 172, weightKg: 90, occupation: 'heavy', movement: 'high', workoutsPerWeek: 0, diet: 'non_vegetarian', allergies: [], bodyGoal: 'lose', focus: [], budgetInr: 1500, budgetPeriod: 'weekly', clinical: true },
  },
  {
    id: 'c09',
    answers: { age: '30', sex: 'female', height: '165', weight: '55', occupation: 'office', movement: 'little', workouts: '4 times', workoutDetails: '40 minutes moderate', diet: 'veg', allergies: ['hmm', 'no'], exclusions: 'nothing', goal: ['not sure', 'maintain'], focus: 'b12', budget: '₹2500 a week', clinical: 'no' },
    expect: { age: 30, sex: 'female', heightCm: 165, weightKg: 55, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 4, diet: 'vegetarian', allergies: [], bodyGoal: 'maintain', focus: ['b12'], budgetInr: 2500, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c10',
    answers: { age: '38', sex: 'male', height: '5 foot 10 inches', weight: '77 kg', occupation: 'delivery', movement: 'lots', workouts: 'no', diet: 'non veg', allergies: 'shellfish and fish', exclusions: 'nothing', goal: 'save money', focus: 'no', budget: '900 a week', clinical: 'no' },
    expect: { age: 38, sex: 'male', heightCm: 177.8, weightKg: 77, occupation: 'moderate', movement: 'high', workoutsPerWeek: 0, diet: 'non_vegetarian', allergies: ['fish', 'shellfish'], bodyGoal: 'maintain', focus: [], budgetInr: 900, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c11',
    answers: { age: 'twenty eight', sex: 'female', height: '158', weight: '49', occupation: 'teacher', movement: 'some', workouts: 'twice a week', workoutDetails: '30 minutes light', diet: 'vegetarian', allergies: 'soy', exclusions: 'nothing', goal: 'gain muscle', focus: 'iron and calcium', budget: '6000 monthly', clinical: 'no' },
    expect: { age: 28, sex: 'female', heightCm: 158, weightKg: 49, occupation: 'light', movement: 'medium', workoutsPerWeek: 2, diet: 'vegetarian', allergies: ['soy'], bodyGoal: 'gain', focus: ['iron', 'calcium'], budgetInr: 6000, budgetPeriod: 'monthly', clinical: false },
  },
  {
    id: 'c12',
    answers: { age: '61', sex: 'male', height: '168', weight: '72', occupation: 'retired', movement: 'I walk in the morning, 6000 steps', workouts: 'no', diet: 'vegetarian', allergies: 'no', exclusions: 'onion', goal: 'stay healthy', focus: 'vitamin d', budget: '1500 a week', clinical: 'none' },
    expect: { age: 61, sex: 'male', heightCm: 168, weightKg: 72, occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 0, diet: 'vegetarian', allergies: [], bodyGoal: 'maintain', focus: ['vitamin_d'], budgetInr: 1500, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c13',
    answers: { age: '24', sex: 'female', height: '170', weight: '65', occupation: 'student', movement: 'a lot', workouts: '3 times a week', workoutDetails: '45 min intense', diet: 'non veg', allergies: 'eggs', exclusions: 'nothing', goal: 'lose fat', focus: 'no', budget: '1200 a week', clinical: "I'm breastfeeding" },
    expect: { age: 24, sex: 'female', heightCm: 170, weightKg: 65, occupation: 'sedentary', movement: 'high', workoutsPerWeek: 3, diet: 'non_vegetarian', allergies: ['egg'], bodyGoal: 'lose', focus: [], budgetInr: 1200, budgetPeriod: 'weekly', clinical: true },
  },
  {
    id: 'c14',
    answers: { age: '44', sex: 'female', height: '152', weight: '68', occupation: 'shop owner', movement: 'not much', workouts: 'no', diet: 'eggetarian', allergies: 'no', exclusions: 'nothing', goal: 'lose weight', focus: 'zinc', budget: '7000 a month', clinical: 'no' },
    expect: { age: 44, sex: 'female', heightCm: 152, weightKg: 68, occupation: 'light', movement: 'low', workoutsPerWeek: 0, diet: 'eggetarian', allergies: [], bodyGoal: 'lose', focus: ['zinc'], budgetInr: 7000, budgetPeriod: 'monthly', clinical: false },
  },
  {
    id: 'c15',
    answers: { age: '27', sex: 'male', height: '175', weight: '70', occupation: 'desk job', movement: 'normal', workouts: 'gym 4 times a week, 1 hour, heavy lifting', diet: 'non veg', allergies: 'no', exclusions: 'nothing', goal: 'build muscle', focus: 'no', budget: '2500 a week', clinical: 'no' },
    expect: { age: 27, sex: 'male', heightCm: 175, weightKg: 70, occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 4, diet: 'non_vegetarian', allergies: [], bodyGoal: 'gain', focus: [], budgetInr: 2500, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'c16',
    answers: { age: '33', sex: 'female', height: '163', weight: '57', occupation: 'software', movement: 'very little', workouts: 'no', diet: 'vegan', allergies: 'tree nuts', exclusions: 'nothing', goal: 'same as now', focus: 'b12 and iron', budget: '2000 a week', clinical: 'no' },
    expect: { age: 33, sex: 'female', heightCm: 163, weightKg: 57, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 0, diet: 'vegan', allergies: ['tree_nut'], bodyGoal: 'maintain', focus: ['iron', 'b12'], budgetInr: 2000, budgetPeriod: 'weekly', clinical: false },
  },
];

/**
 * Held-out batch: written after the engine fixes above and scored once, with no changes
 * made in response. Its score is the honest estimate of how new people will fare.
 */
export const CONVERSATIONS_HELDOUT: ConvCase[] = [
  {
    id: 'h01',
    answers: { age: 'I am 31 years old', sex: 'man', height: '5 ft 7', weight: '74 kg', occupation: 'I drive a cab, sitting all day', movement: 'very less', workouts: 'cricket on sundays', workoutDetails: '2 hours moderate', diet: 'non-veg but no beef', allergies: 'nothing', exclusions: 'beef', goal: 'reduce my belly', focus: 'no idea', budget: '1,800 rupees a week', clinical: 'no' },
    expect: { age: 31, sex: 'male', heightCm: 170.2, weightKg: 74, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 1, diet: 'non_vegetarian', allergies: [], bodyGoal: 'lose', focus: [], budgetInr: 1800, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'h02',
    answers: { age: '19', sex: 'girl', height: '150 centimetres', weight: '44', occupation: 'college student', movement: 'I walk to college, maybe 8000 steps', workouts: 'zero', diet: 'veg, Jain style', allergies: 'no allergy', exclusions: 'onion and garlic', goal: 'gain weight', focus: 'calcium', budget: '4000 per month', clinical: 'no' },
    expect: { age: 19, sex: 'female', heightCm: 150, weightKg: 44, occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 0, diet: 'vegetarian', allergies: [], bodyGoal: 'gain', focus: ['calcium'], budgetInr: 4000, budgetPeriod: 'monthly', clinical: false },
  },
  {
    id: 'h03',
    answers: { age: '52', sex: 'female', height: '157', weight: '71', occupation: 'housewife', movement: 'moderate', workouts: 'walk in the evening 5 days', workoutDetails: '30 minutes, slow', diet: 'eggs ok, no meat', allergies: 'none', exclusions: 'no', goal: 'lose some weight', focus: 'vitamin D is low', budget: '2000 a week', clinical: 'thyroid, doctor gave me a diet' },
    expect: { age: 52, sex: 'female', heightCm: 157, weightKg: 71, occupation: 'moderate', movement: 'medium', workoutsPerWeek: 5, diet: 'eggetarian', allergies: [], bodyGoal: 'lose', focus: ['vitamin_d'], budgetInr: 2000, budgetPeriod: 'weekly', clinical: true },
  },
  {
    id: 'h04',
    answers: { age: '36', sex: 'male', height: '181', weight: '95', occupation: 'warehouse loading', movement: 'too much', workouts: 'no time', diet: 'everything', allergies: 'prawns', exclusions: 'nothing', goal: 'maintain', focus: 'no', budget: '3000 weekly', clinical: 'no' },
    expect: { age: 36, sex: 'male', heightCm: 181, weightKg: 95, occupation: 'heavy', movement: 'high', workoutsPerWeek: 0, diet: 'non_vegetarian', allergies: ['shellfish'], bodyGoal: 'maintain', focus: [], budgetInr: 3000, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'h05',
    answers: { age: '25', sex: 'female', height: '5 feet 2 inches', weight: '52 kgs', occupation: 'UX designer', movement: '4000 steps', workouts: 'pilates thrice a week', workoutDetails: '50 min moderate', diet: 'vegan', allergies: 'sesame', exclusions: 'nothing', goal: 'tone up, build some muscle', focus: 'b12', budget: '2200/week', clinical: 'no' },
    expect: { age: 25, sex: 'female', heightCm: 157.5, weightKg: 52, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 3, diet: 'vegan', allergies: ['sesame'], bodyGoal: 'gain', focus: ['b12'], budgetInr: 2200, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'h06',
    answers: { age: '67', sex: 'male', height: '165', weight: '60', occupation: 'retired teacher', movement: 'little', workouts: 'no', diet: 'vegetarian', allergies: 'no', exclusions: 'nothing', goal: 'stay as I am', focus: 'iron, my doctor said I am anaemic', budget: '5000 a month', clinical: 'kidney problem, I follow a renal diet' },
    expect: { age: 67, sex: 'male', heightCm: 165, weightKg: 60, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 0, diet: 'vegetarian', allergies: [], bodyGoal: 'maintain', focus: ['iron'], budgetInr: 5000, budgetPeriod: 'monthly', clinical: true },
  },
  {
    id: 'h07',
    answers: { age: '29', sex: 'male', height: '173', weight: '66', occupation: 'sales, on the road all day', movement: 'more than 10000 steps', workouts: 'gym 6 days', workoutDetails: '75 minutes heavy', diet: 'chicken and eggs, no fish', allergies: 'no', exclusions: 'fish', goal: 'muscle gain', focus: 'zinc', budget: '3500 per week', clinical: 'no' },
    expect: { age: 29, sex: 'male', heightCm: 173, weightKg: 66, occupation: 'moderate', movement: 'high', workoutsPerWeek: 6, diet: 'non_vegetarian', allergies: [], bodyGoal: 'gain', focus: ['zinc'], budgetInr: 3500, budgetPeriod: 'weekly', clinical: false },
  },
  {
    id: 'h08',
    answers: { age: '40', sex: 'female', height: '168', weight: '80', occupation: 'bank job', movement: 'hardly', workouts: 'no', diet: 'non veg', allergies: 'I get rashes from peanuts', exclusions: 'nothing', goal: 'weight loss', focus: 'none', budget: '1500 a week', clinical: 'no' },
    expect: { age: 40, sex: 'female', heightCm: 168, weightKg: 80, occupation: 'sedentary', movement: 'low', workoutsPerWeek: 0, diet: 'non_vegetarian', allergies: ['peanut'], bodyGoal: 'lose', focus: [], budgetInr: 1500, budgetPeriod: 'weekly', clinical: false },
  },
];
