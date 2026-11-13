// The test household used to score label verdicts: every diet, with common allergies.
import type { PersonRules } from '../domain/labels/check.ts';

export const LABEL_PEOPLE: PersonRules[] = [
  { name: 'vegan', dietPattern: 'vegan', allergies: [] },
  { name: 'vegetarian', dietPattern: 'vegetarian', allergies: [] },
  { name: 'eggetarian', dietPattern: 'eggetarian', allergies: [] },
  { name: 'non-veg', dietPattern: 'non_vegetarian', allergies: [] },
  { name: 'veg + peanut allergy', dietPattern: 'vegetarian', allergies: ['peanut'] },
  { name: 'non-veg + milk allergy', dietPattern: 'non_vegetarian', allergies: ['dairy'] },
  { name: 'veg + gluten', dietPattern: 'vegetarian', allergies: ['gluten'] },
  { name: 'non-veg + tree nut + sesame', dietPattern: 'non_vegetarian', allergies: ['tree_nut', 'sesame'] },
  { name: 'eggetarian + soy', dietPattern: 'eggetarian', allergies: ['soy'] },
  { name: 'non-veg + shellfish', dietPattern: 'non_vegetarian', allergies: ['shellfish'] },
  { name: 'vegan + peanut', dietPattern: 'vegan', allergies: ['peanut'] },
];
