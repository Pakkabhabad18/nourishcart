// Pieces shared by the "My targets" screen and profile setup:
//  - GoalPicker: lose fat / stay as I am / build muscle
//  - FocusPicker: nutrients the person wants more of
// Both are controlled components; the caller owns the state and saves it.
import { clsx } from 'clsx';
import type { BodyGoal, FocusNutrient, MealSlot } from '../../domain/types.ts';
import { BODY_GOAL_LABEL, FOCUS_LABEL, FOCUS_SOURCES } from '../../domain/nutrition/personal.ts';
import { Chip } from '../../components/ui.tsx';

const GOAL_HINT: Record<BodyGoal, string> = {
  lose: 'About 15% fewer calories, more protein',
  maintain: 'Calories that match what you burn',
  gain: 'About 10% more calories, high protein',
};

export function GoalPicker({ value, onChange, name = 'body-goal' }: { value: BodyGoal | null; onChange: (g: BodyGoal) => void; name?: string }) {
  return (
    <div role="radiogroup" aria-label="Your goal" className="grid gap-2 sm:grid-cols-3">
      {(['lose', 'maintain', 'gain'] as BodyGoal[]).map((g) => (
        <label
          key={g}
          className={clsx(
            'flex cursor-pointer flex-col rounded-ctl border px-4 py-3 transition-colors',
            value === g ? 'border-primary bg-secondary-container' : 'border-outline-variant hover:bg-on-surface/[0.04]',
          )}
        >
          <input type="radio" name={name} className="sr-only" checked={value === g} onChange={() => onChange(g)} />
          <span className="font-medium">{BODY_GOAL_LABEL[g]}</span>
          <span className="text-xs text-on-surface-variant">{GOAL_HINT[g]}</span>
        </label>
      ))}
    </div>
  );
}

export function FocusPicker({ value, onChange }: { value: FocusNutrient[]; onChange: (v: FocusNutrient[]) => void }) {
  const toggle = (n: FocusNutrient) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n]);
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Nutrients to get more of">
        {(Object.keys(FOCUS_LABEL) as FocusNutrient[]).map((n) => (
          <Chip key={n} selected={value.includes(n)} onClick={() => toggle(n)}>
            {FOCUS_LABEL[n]}
          </Chip>
        ))}
      </div>
      {value.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-on-surface-variant">
          {value.map((n) => (
            <li key={n}>
              <span className="font-medium text-on-surface">{FOCUS_LABEL[n]}:</span> {FOCUS_SOURCES[n].tip}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MEAL_CHOICES: { slot: MealSlot; label: string }[] = [
  { slot: 'breakfast', label: 'Breakfast' },
  { slot: 'snack_am', label: 'Morning snack' },
  { slot: 'lunch', label: 'Lunch' },
  { slot: 'snack', label: 'Evening snack' },
  { slot: 'dinner', label: 'Dinner' },
];

/**
 * Which meals the person eats. Leaving some out is how intermittent fasting works
 * (for 16:8, untick breakfast). At least one meal stays ticked.
 */
export function MealsPicker({ value, onChange }: { value: MealSlot[]; onChange: (v: MealSlot[]) => void }) {
  const toggle = (s: MealSlot) => {
    const next = value.includes(s) ? value.filter((x) => x !== s) : [...value, s];
    if (next.length) onChange(MEAL_CHOICES.map((c) => c.slot).filter((x) => next.includes(x)));
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Meals you eat">
        {MEAL_CHOICES.map((c) => (
          <Chip key={c.slot} selected={value.includes(c.slot)} onClick={() => toggle(c.slot)}>
            {c.label}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">
        {value.length <= 2 ? 'Fewer meals means bigger portions so you still reach your targets.' : `${value.length} meals a day.`} Fasting? Just untick the meals you skip.
      </p>
    </div>
  );
}
