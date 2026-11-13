// The day's menu for whoever cooks, in English, Telugu or Hindi.
//
// buildMenu() turns one day of the selected plan into dishes with ingredient amounts (exact,
// deterministic). englishNote() writes it as plain sentences. For Telugu and Hindi an AI model
// (Groq, api/cook.js) rewrites the English note in simple spoken language, and checkTranslation()
// makes sure it kept EVERY quantity: each number in the English note must appear in the
// translation, and no new numbers may appear. If the check fails the app shows the English note
// instead, so a wrong quantity is never read out to the cook.
import type { Catalog, PlanDraft } from '../planning/plan.ts';
import { swappedLines } from '../planning/plan.ts';
import type { MealSlot } from '../types.ts';

export const COOK_PROMPT_VERSION = 'cook-prompt-1.0.0';
export type CookLanguage = 'en' | 'te' | 'hi';
export const LANGUAGE_NAMES: Record<CookLanguage, string> = { en: 'English', te: 'Telugu', hi: 'Hindi' };
export const SPEECH_LANG: Record<CookLanguage, string> = { en: 'en-IN', te: 'te-IN', hi: 'hi-IN' };

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const SLOT_NAMES: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };

export interface MenuDish {
  slot: MealSlot;
  name: string; // recipe name, with its local name when there is one
  people: number; // servings rounded for speech, e.g. 1.5 -> "1.5"
  items: { name: string; amount: string }[]; // "250 g", "2 pieces", "15 ml"
}

/** "Rice (Sona Masoori, raw)" -> "Rice (Sona Masoori)": drop the part after a comma, keep brackets balanced. */
function shortName(name: string): string {
  let n = name.split(',')[0].trim();
  const open = (n.match(/\(/g) ?? []).length - (n.match(/\)/g) ?? []).length;
  if (open > 0) n += ')'.repeat(open);
  return n;
}

/** Round amounts the way a cook measures: grams to 5 g (10 g above 100), pieces to halves. */
function speakAmount(amount: number, unit: string): string {
  if (unit === 'piece') return `${Math.round(amount * 2) / 2} ${amount <= 1 ? 'piece' : 'pieces'}`;
  const step = amount > 100 ? 10 : 5;
  const v = Math.max(step, Math.round(amount / step) * step);
  return `${v} ${unit === 'ml' ? 'ml' : 'g'}`;
}

export function buildMenu(plan: PlanDraft, day: number, cat: Catalog): MenuDish[] {
  const meals = plan.meals.filter((m) => m.day === day).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  return meals.flatMap((m) => {
    const r = cat.recipes.get(m.recipeId);
    if (!r) return [];
    const items = swappedLines(r, m.servings, plan.swaps)
      .filter((l) => !l.optional && l.amount > 0)
      .map((l) => {
        const ing = cat.ingredients.get(l.ingredientId);
        const base = ing ? shortName(ing.name) : l.ingredientId;
        return { name: ing?.localNames?.[0] && !base.toLowerCase().includes(ing.localNames[0].toLowerCase()) ? `${base} (${ing.localNames[0]})` : base, amount: speakAmount(l.amount, ing?.unitBasis ?? 'g') };
      });
    return [{ slot: m.slot, name: r.localNames[0] ? `${r.name} (${r.localNames[0]})` : r.name, people: Math.round(m.servings * 2) / 2, items }];
  });
}

export function englishNote(menu: MenuDish[], dayLabel: string): string {
  const lines = [`Menu for ${dayLabel}.`];
  for (const d of menu) {
    lines.push(`${SLOT_NAMES[d.slot]}: ${d.name}, ${d.people} ${d.people === 1 ? 'serving' : 'servings'}. Use ${d.items.map((i) => `${i.amount} ${i.name}`).join(', ')}.`);
  }
  return lines.join('\n');
}

export const COOK_SYSTEM_PROMPT = `You help a household send the day's menu to their cook, who may not read English.
Rewrite the English menu in simple, spoken {LANGUAGE} that a home cook in Hyderabad would use. Keep it short and polite.
Rules:
- Keep EVERY number exactly as written, using the same digits (0-9), and keep units as g, ml or pieces. Do not convert, round or add numbers.
- Keep every dish and every ingredient; do not add ingredients or advice.
- Dish and ingredient names can stay in their common Indian names.
- Output only the message text, no notes.`;

/** All numbers in a text, as written ("250", "1.5"). */
const numbers = (t: string) => (t.match(/\d+(?:\.\d+)?/g) ?? []).sort();

export interface TranslationCheck {
  ok: boolean;
  missing: string[]; // numbers from the English note not found in the translation
  extra: string[]; // numbers in the translation that the English note doesn't have
}

/** Every quantity must survive translation unchanged; nothing may be added. */
export function checkTranslation(english: string, translated: string): TranslationCheck {
  const want = numbers(english);
  const got = numbers(translated.replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966)).replace(/[౦-౯]/g, (c) => String(c.charCodeAt(0) - 0x0c66)));
  const missing: string[] = [];
  const pool = [...got];
  for (const n of want) {
    const i = pool.indexOf(n);
    if (i >= 0) pool.splice(i, 1);
    else missing.push(n);
  }
  return { ok: missing.length === 0 && pool.length === 0 && translated.trim().length > 0, missing, extra: pool };
}
