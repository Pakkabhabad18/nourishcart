// Synthetic sample profile used only for the public landing example.
import type { ProfileBundle } from '../../domain/types.ts';

export const SAMPLE_BUNDLE: ProfileBundle = {
  profile: { id: 'sample', ownerUserId: 'sample', displayName: 'Demo Asha', dateOfBirth: '2000-05-14', sex: 'female', heightCm: 162, weightKg: 58, archived: false, onboardingStep: 6, onboardingComplete: true, createdAt: '', updatedAt: '' },
  preferences: { profileId: 'sample', dietPattern: 'eggetarian', cuisines: ['south_indian', 'hyderabadi'], likes: [], dislikes: [], hardExclusions: ['okra'], allergies: [], allergiesConfirmed: true, mealsPerDay: 4, maxCookMinutes: 40, groceryTier: 'standard', clinicalFlags: [], noClinicalFlagsConfirmed: true },
  activity: { profileId: 'sample', questionnaireVersion: 'aq-1', occupation: 'sedentary', movement: 'medium', workoutsPerWeek: 3, workoutMinutes: 45, workoutType: 'strength', intensity: 'moderate' },
  budget: { profileId: 'sample', amountInr: 1500, period: 'weekly', mode: 'hard' },
  goals: { profileId: 'sample', goal: 'muscle_fitness' },
};
