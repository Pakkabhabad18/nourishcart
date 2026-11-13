// Synthetic test profiles. Never use real people's data in fixtures (PRD 15.2).
import type { ProfileBundle } from '../domain/types.ts';
import { INGREDIENT_MAP } from '../data/ingredients.ts';
import { RECIPE_MAP } from '../data/recipes.ts';
import { CATALOGUE } from '../data/catalogue.ts';
import type { Catalog } from '../domain/planning/plan.ts';

export const NOW = new Date('2026-11-11T09:00:00.000Z');
export const CAT: Catalog = { recipes: RECIPE_MAP, ingredients: INGREDIENT_MAP, products: CATALOGUE };

/** PRD 17.3 golden demo: 26-year-old, desk job, moderate walking, 3 workouts/week,
 *  vegetarian-with-eggs, one strict exclusion, ₹1,500 weekly budget. */
export function goldenBundle(overrides: Partial<{ [K in keyof ProfileBundle]: Partial<ProfileBundle[K]> }> = {}): ProfileBundle {
  const b: ProfileBundle = {
    profile: {
      id: 'p-golden', ownerUserId: 'u-1', displayName: 'Demo Asha', dateOfBirth: '2000-05-14', ageAtEntry: null, ageEnteredAt: null, sex: 'female',
      heightCm: 162, weightKg: 58, archived: false, onboardingStep: 6, onboardingComplete: true,
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    },
    preferences: {
      profileId: 'p-golden', dietPattern: 'eggetarian', cuisines: ['south_indian', 'hyderabadi'], likes: [], dislikes: [],
      hardExclusions: ['okra'], allergies: [], allergiesConfirmed: true, mealsPerDay: 4, maxCookMinutes: 40,
      groceryTier: 'standard', clinicalFlags: [], noClinicalFlagsConfirmed: true,
    },
    activity: { profileId: 'p-golden', questionnaireVersion: 'aq-1', occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 3, workoutMinutes: 45, workoutType: 'strength', intensity: 'moderate' },
    budget: { profileId: 'p-golden', amountInr: 1500, period: 'weekly', mode: 'hard' },
    goals: { profileId: 'p-golden', goal: 'muscle_fitness' },
  };
  return {
    profile: { ...b.profile, ...overrides.profile },
    preferences: { ...b.preferences, ...overrides.preferences },
    activity: { ...b.activity, ...overrides.activity },
    budget: { ...b.budget, ...overrides.budget },
    goals: { ...b.goals, ...overrides.goals },
  };
}
