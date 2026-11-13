// Conversation setup: scripted chats, short spoken-style answers, and the safety rules.
import { describe, expect, it } from 'vitest';
import { answer, emptyConversation, nextQuestion, reopen, toBundle, type ConvState } from '../intake/conversation.ts';
import { goldenBundle } from '../../test/fixtures.ts';

/** Plays a whole chat: each answer goes to whatever question is next. Returns the final state and the questions asked. */
function chat(answers: string[]): { s: ConvState; asked: string[]; misunderstood: number } {
  let s = emptyConversation();
  const asked: string[] = [];
  let misunderstood = 0;
  for (const a of answers) {
    const k = nextQuestion(s);
    if (!k) break;
    asked.push(k);
    const r = answer(s, k, a);
    if (r.understood == null) misunderstood++;
    s = r.state;
  }
  return { s, asked, misunderstood };
}

describe('conversation setup', () => {
  it('understands short spoken answers, one question at a time', () => {
    const { s, misunderstood } = chat(['twenty six', 'female', '5 feet 4', '58', 'desk job', 'not much', 'three times a week', '45 minutes moderate', 'vegetarian but I eat eggs', 'no', 'bhindi', 'build muscle', 'iron', '1500 a week', 'no']);
    expect(misunderstood).toBe(0);
    expect(nextQuestion(s)).toBeNull();
    const b = toBundle(s, goldenBundle({ profile: { dateOfBirth: null, sex: null, heightCm: null, weightKg: null }, preferences: { dietPattern: null, allergiesConfirmed: false, hardExclusions: [], noClinicalFlagsConfirmed: false }, goals: { goal: null } }));
    expect(b.profile.ageAtEntry).toBe(26);
    expect(b.profile.heightCm).toBeCloseTo(162.6, 0);
    expect(b.profile.weightKg).toBe(58);
    expect(b.activity).toMatchObject({ occupation: 'sedentary', movement: 'low', workoutsPerWeek: 3, workoutMinutes: 45, intensity: 'moderate' });
    expect(b.preferences.dietPattern).toBe('eggetarian');
    expect(b.preferences.allergiesConfirmed).toBe(true);
    expect(b.preferences.hardExclusions).toContain('okra');
    expect(b.goals).toMatchObject({ bodyGoal: 'gain', goal: 'muscle_fitness', focusNutrients: ['iron'] });
    expect(b.budget).toMatchObject({ amountInr: 1500, period: 'weekly' });
    expect(b.preferences.noClinicalFlagsConfirmed).toBe(true);
  });

  it('skips questions already answered in a long first answer', () => {
    const { s, asked } = chat(["I'm 30, male, 175 cm and 72 kg, desk job, I'm vegetarian with no allergies", 'a fair bit', 'no', 'nothing', 'lose fat', 'no', '6000 a month', 'no']);
    expect(asked).not.toContain('sex');
    expect(asked).not.toContain('height');
    expect(asked).not.toContain('diet');
    expect(asked).not.toContain('allergies');
    expect(nextQuestion(s)).toBeNull();
  });

  it('asks again when it did not understand, and never guesses', () => {
    let s = emptyConversation();
    const r = answer(s, 'age', 'hmm let me think');
    expect(r.understood).toBeNull();
    expect(r.state.misses.age).toBe(1);
    expect(nextQuestion(r.state)).toBe('age');
    s = answer(r.state, 'age', '41').state;
    expect(nextQuestion(s)).toBe('sex');
  });

  it('never records "no allergies" or "no conditions" from an unrelated answer', () => {
    const { s } = chat(['26', 'no']); // "no" to the sex question
    expect(s.e.noAllergies).toBeUndefined();
    expect(s.e.noClinical).toBeUndefined();
  });

  it('records an allergy said at any point, and a later "no" to the allergy question replaces it', () => {
    let s = answer(emptyConversation(), 'age', "26, and I'm allergic to peanuts").state;
    expect(s.e.allergies?.value).toEqual(['peanut']);
    s = answer(s, 'allergies', 'no').state;
    expect(s.e.allergies).toBeUndefined();
    expect(s.e.noAllergies).toBeDefined();
  });

  it('a doctor-managed diet takes the profile out of scope', () => {
    const s = answer(emptyConversation(), 'clinical', 'yes I follow a diet from my doctor for kidney').state;
    expect(s.e.clinicalFlags).toBeDefined();
    expect(s.e.noClinical).toBeUndefined();
  });

  it('asks for the period when the budget has none', () => {
    let s = emptyConversation();
    s = answer(s, 'budget', '2000').state;
    expect(s.e.budgetInr?.value).toBe(2000);
    for (const k of ['age', 'sex', 'height', 'weight', 'occupation', 'movement', 'workouts', 'diet', 'allergies', 'exclusions', 'goal', 'focus'] as const) s = answer(s, k, { age: '30', sex: 'male', height: '170', weight: '70', occupation: 'student', movement: 'a lot', workouts: 'no', diet: 'non veg', allergies: 'none', exclusions: 'nothing', goal: 'stay the same', focus: 'not sure' }[k]).state;
    expect(nextQuestion(s)).toBe('budgetPeriod');
    s = answer(s, 'budgetPeriod', 'month').state;
    expect(s.e.budgetPeriod?.value).toBe('monthly');
  });

  it('change in the summary asks that question again', () => {
    let s = answer(emptyConversation(), 'goal', 'lose weight').state;
    expect(s.bodyGoal).toBe('lose');
    s = reopen(s, 'goal');
    expect(s.bodyGoal).toBeNull();
  });
});

describe('conversation setup: answers out of place', () => {
  it('picks up walking said in passing', () => {
    const r = answer(emptyConversation(), 'age', "I'm 25, desk job, not much walking, gym 3 times a week");
    expect(r.state.e.movement?.value).toBe('low');
  });
  it('keeps a goal given to the wrong question, and still asks that question', () => {
    const r = answer(emptyConversation(), 'exclusions', 'build muscle');
    expect(r.understood).toBeNull();
    expect(r.state.bodyGoal).toBe('gain');
    expect(nextQuestion(r.state)).toBe('age');
  });
  it('a bare "no" to another question never fills allergies or health', () => {
    const r = answer(emptyConversation(), 'goal', 'no');
    expect(r.state.e.noAllergies).toBeUndefined();
    expect(r.state.e.noClinical).toBeUndefined();
  });
});
