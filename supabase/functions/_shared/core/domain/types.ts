// Shared domain types. These are plain data shapes used by the UI, the demo store,
// the Supabase store and the Edge Functions. No React or browser APIs in this folder,
// so the same files can be copied into supabase/functions/_shared and run on Deno.

export type Sex = 'male' | 'female' | 'prefer_not_to_say';
export type DietPattern = 'vegan' | 'vegetarian' | 'eggetarian' | 'non_vegetarian';
export type Goal = 'general' | 'muscle_fitness' | 'weight_management' | 'budget_first';
export type OccupationClass = 'sedentary' | 'light' | 'moderate' | 'heavy';
export type MovementBand = 'low' | 'medium' | 'high';
export type Intensity = 'light' | 'moderate' | 'vigorous';
export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export type BudgetPeriod = 'weekly' | 'monthly';
export type BudgetMode = 'hard' | 'flexible';
export type Allergen = 'dairy' | 'egg' | 'peanut' | 'tree_nut' | 'gluten' | 'soy' | 'fish' | 'sesame' | 'shellfish';
export type ClinicalFlag =
  | 'pregnancy'
  | 'lactation'
  | 'eating_disorder'
  | 'kidney_disease'
  | 'diabetes_clinical_diet'
  | 'bariatric_surgery'
  | 'other_medical_condition';
export type GroceryTier = 'value' | 'standard' | 'premium';
export type UnitBasis = 'g' | 'ml' | 'piece';

/** One adult person's planning profile. A profile is not a login identity. */
export interface Profile {
  id: string;
  ownerUserId: string;
  displayName: string;
  dateOfBirth: string | null; // ISO date
  /** Age the person stated (quick setup), with the date they said it. Used only when dateOfBirth is empty. */
  ageAtEntry: number | null;
  ageEnteredAt: string | null;
  sex: Sex | null;
  heightCm: number | null;
  weightKg: number | null;
  archived: boolean;
  onboardingStep: number; // last saved wizard step, for save/resume
  onboardingComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilePreferences {
  profileId: string;
  dietPattern: DietPattern | null;
  cuisines: string[];
  likes: string[]; // recipe ids the user liked
  dislikes: string[]; // ingredient ids (soft)
  hardExclusions: string[]; // ingredient ids (strict)
  allergies: Allergen[];
  allergiesConfirmed: boolean; // user explicitly answered the allergy question
  mealsPerDay: 3 | 4;
  maxCookMinutes: number;
  groceryTier: GroceryTier;
  clinicalFlags: ClinicalFlag[];
  noClinicalFlagsConfirmed: boolean;
}

export interface ActivityAssessment {
  profileId: string;
  questionnaireVersion: string;
  occupation: OccupationClass | null;
  movement: MovementBand | null;
  workoutsPerWeek: number;
  workoutType: 'none' | 'strength' | 'cardio' | 'mixed' | 'sport' | 'yoga';
  workoutMinutes: number;
  intensity: Intensity | null;
}

export interface ProfileBudget {
  profileId: string;
  amountInr: number | null;
  period: BudgetPeriod;
  mode: BudgetMode;
}

export interface Goals {
  profileId: string;
  goal: Goal | null;
}

/** Everything the engines need for one profile, assembled by the store. */
export interface ProfileBundle {
  profile: Profile;
  preferences: ProfilePreferences;
  activity: ActivityAssessment;
  budget: ProfileBudget;
  goals: Goals;
}

/** Nutrient values for one ingredient per 100 g (or 100 ml for liquids). null = unknown, never zero. */
export interface NutrientValues {
  energyKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fibreG: number | null;
  ironMg: number | null;
  calciumMg: number | null;
}
export type NutrientKey = keyof NutrientValues;

export interface Ingredient {
  id: string;
  name: string;
  localNames: string[];
  foodGroup: 'cereal' | 'millet' | 'pulse' | 'dairy' | 'egg' | 'meat' | 'fish' | 'vegetable' | 'fruit' | 'nut_seed' | 'fat' | 'condiment' | 'soy';
  unitBasis: UnitBasis;
  gramsPerPiece?: number; // explicit conversion for piece-counted foods (eggs, bananas)
  state: 'raw' | 'dry' | 'cooked';
  dietClass: 'plant' | 'dairy' | 'egg' | 'meat' | 'fish';
  allergens: Allergen[];
  nutrientsPer100: NutrientValues;
  sourceId: string;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean; // never true for sample data
  perishability: 'daily' | 'fresh' | 'staple' | 'packaged';
  substitutes: IngredientSubstitute[];
}

export interface IngredientSubstitute {
  ingredientId: string;
  ratio: number; // grams of substitute per gram of original
  note: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  amount: number; // per serving, in the ingredient's unit basis
  optional: boolean;
  retentionFactor: number | null; // null = not available -> micronutrients marked approximate
}

export interface Recipe {
  id: string;
  version: number;
  name: string;
  localNames: string[];
  cuisine: 'south_indian' | 'north_indian' | 'hyderabadi' | 'pan_indian' | 'continental';
  slots: MealSlot[];
  ingredients: RecipeIngredient[];
  servingGrams: number; // approximate cooked serving weight
  prepMinutes: number;
  difficulty: 'easy' | 'medium';
  steps: string[];
  sourceId: string;
  confidence: 'low' | 'medium';
}

export interface DataSource {
  id: string;
  title: string;
  publisher: string;
  version: string;
  url: string | null;
  license: string;
  attribution: string;
  permissionStatus: 'not_required' | 'permitted' | 'pending' | 'not_permitted';
  isSample: boolean;
  notes: string;
}

export interface CatalogueProduct {
  id: string;
  provider: 'SIMULATED';
  externalProductId: string;
  ingredientId: string;
  brand: string;
  title: string;
  packQty: number;
  packUnit: UnitBasis;
  priceInr: number;
  tier: GroceryTier;
  available: boolean;
  allergens: Allergen[]; // label/trace allergens on top of the ingredient's own
  lastCheckedAt: string;
  isSample: true;
}
