// Plays every scripted conversation through the real engine and scores the result.
//   V5 critical  no unsafe result: a stated allergy missing, "no allergies" recorded for someone
//                with one, or a doctor-managed condition not taking the profile out of scope
//   V6           fields correct (each of 14 fields per person compared with the hand labels)
//   V7           conversations finished without help (each question asked at most twice; a real
//                person would get tap-to-answer options after the second miss)
import { answer, emptyConversation, nextQuestion, toBundle, type ConvState } from '../domain/intake/conversation.ts';
import { validateProfileForNutrition } from '../domain/nutrition/eligibility.ts';
import { emptyBundle } from '../lib/store/types.ts';
import { CONVERSATIONS, type ConvCase } from './datasets/conversations.ts';

export interface ConversationReport {
  conversations: number;
  finished: number;
  questionsAsked: number;
  retries: number;
  fieldsChecked: number;
  fieldsCorrect: number;
  unsafe: { id: string; what: string }[];
  wrong: { id: string; field: string; got: string; want: string }[];
}

function play(c: ConvCase): { s: ConvState; asked: number; retries: number; stuck: boolean } {
  let s = emptyConversation();
  const times: Record<string, number> = {};
  let asked = 0;
  let retries = 0;
  for (let turn = 0; turn < 40; turn++) {
    const k = nextQuestion(s);
    if (!k) return { s, asked, retries, stuck: false };
    const said = c.answers[k];
    const n = times[k] ?? 0;
    times[k] = n + 1;
    if (n >= 2) return { s, asked, retries, stuck: true }; // asked three times: count as stuck
    // The meals question was added after these scripts were written; people who weren't asked
    // it answer the most common pattern.
    const text = Array.isArray(said) ? said[Math.min(n, said.length - 1)] : (said ?? (k === 'meals' ? 'breakfast, lunch and dinner' : 'no'));
    asked++;
    const r = answer(s, k, text);
    if (r.understood == null) retries++;
    s = r.state;
  }
  return { s, asked, retries, stuck: true };
}

export function runConversationEval(cases: ConvCase[] = CONVERSATIONS): ConversationReport {
  const r: ConversationReport = { conversations: 0, finished: 0, questionsAsked: 0, retries: 0, fieldsChecked: 0, fieldsCorrect: 0, unsafe: [], wrong: [] };
  const now = new Date('2026-11-14T10:00:00Z');
  for (const c of cases) {
    r.conversations++;
    const { s, asked, retries, stuck } = play(c);
    r.questionsAsked += asked;
    r.retries += retries;
    if (!stuck) r.finished++;
    const e = c.expect;
    const b = toBundle(s, emptyBundle({ id: c.id, ownerUserId: 'eval', displayName: c.id, dateOfBirth: null, ageAtEntry: null, ageEnteredAt: null, sex: null, heightCm: null, weightKg: null, archived: false, onboardingStep: 0, onboardingComplete: false, createdAt: '', updatedAt: '' }), now);

    // Safety first. Only finished conversations can be saved, so only they can be unsafe;
    // an unfinished one is counted under "finished" instead.
    const gotAllergies = [...b.preferences.allergies].sort();
    if (!stuck) {
      for (const a of e.allergies) if (!gotAllergies.includes(a)) r.unsafe.push({ id: c.id, what: `allergy ${a} missing` });
      if (e.allergies.length && s.e.noAllergies && !s.e.allergies) r.unsafe.push({ id: c.id, what: '"no allergies" recorded' });
      const elig = validateProfileForNutrition(b, now);
      if (e.clinical && elig.status === 'eligible') r.unsafe.push({ id: c.id, what: 'doctor-managed condition still in scope' });
    }

    const checks: [string, unknown, unknown, boolean?][] = [
      ['age', b.profile.ageAtEntry, e.age],
      ['sex', b.profile.sex, e.sex],
      ['height', b.profile.heightCm, e.heightCm, b.profile.heightCm != null && Math.abs(b.profile.heightCm - e.heightCm) <= 2],
      ['weight', b.profile.weightKg, e.weightKg],
      ['occupation', b.activity.occupation, e.occupation],
      ['movement', b.activity.movement, e.movement],
      ['workouts', b.activity.workoutsPerWeek, e.workoutsPerWeek],
      ['diet', b.preferences.dietPattern, e.diet],
      ['allergies', gotAllergies.join(','), [...e.allergies].sort().join(',')],
      ['goal', b.goals.bodyGoal, e.bodyGoal],
      ['focus', [...b.goals.focusNutrients].sort().join(','), [...e.focus].sort().join(',')],
      ['budget', b.budget.amountInr, e.budgetInr],
      ['period', b.budget.period, e.budgetPeriod],
      ['clinical', b.preferences.clinicalFlags.length > 0, e.clinical],
    ];
    for (const [field, got, want, ok] of checks) {
      r.fieldsChecked++;
      if (ok ?? got === want) r.fieldsCorrect++;
      else r.wrong.push({ id: c.id, field, got: String(got), want: String(want) });
    }
  }
  return r;
}
