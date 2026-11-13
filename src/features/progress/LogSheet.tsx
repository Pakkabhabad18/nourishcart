// The "+ Log" sheet: one tap per meal. "Ate it" counts its calories and protein; "Skipped"
// still counts for the streak (fasting is a choice, not a failure); "Something else" counts
// the day without numbers. Also a shortcut to scan a packet.
import { Link } from 'react-router-dom';
import { Check, ScanLine, Undo2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Sheet } from '../../components/ui.tsx';
import { NutrionSays } from '../../components/Nutrion.tsx';
import { SLOT_LABEL } from '../../lib/format.ts';
import { useToday, type TodayMeal } from './useToday.ts';

export function MealCheck({ m, onCheck, onUndo, compact }: { m: TodayMeal; onCheck: (m: TodayMeal, s: 'ate' | 'skipped' | 'other') => void; onUndo: (m: TodayMeal) => void; compact?: boolean }) {
  const st = m.checkin?.status;
  return (
    <li className={clsx('flex items-center gap-3 py-3', st === 'ate' && 'opacity-90')}>
      <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-full', st === 'ate' ? 'pop bg-leaf text-white' : st ? 'bg-surface-container-high text-on-surface-variant' : 'border-2 border-dashed border-outline-variant')} aria-hidden>
        {st === 'ate' ? <Check className="h-5 w-5" /> : st ? <X className="h-4 w-4" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-on-surface-variant">{SLOT_LABEL[m.meal.slot]}</span>
        <Link to={`/recipes/${m.recipe.id}?servings=${m.meal.servings}`} className="block truncate font-semibold hover:text-primary">{m.recipe.name}</Link>
        {!compact && <span className="num block text-xs text-on-surface-variant">{m.kcal} kcal, {m.proteinG} g protein</span>}
      </span>
      {st ? (
        <button onClick={() => onUndo(m)} className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm text-on-surface-variant hover:bg-on-surface/[0.06]" aria-label={`Undo ${SLOT_LABEL[m.meal.slot]}`}>
          <Undo2 className="h-4 w-4" aria-hidden /> {st === 'ate' ? 'Eaten' : st === 'skipped' ? 'Skipped' : 'Other'}
        </button>
      ) : (
        <span className="flex gap-1.5">
          <button onClick={() => onCheck(m, 'ate')} className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-on-primary active:scale-95" aria-label={`Ate ${m.recipe.name}`}>
            Ate it
          </button>
          <details className="relative">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full border border-outline-variant text-lg leading-none text-on-surface-variant" aria-label={`Other options for ${SLOT_LABEL[m.meal.slot]}`}>⋯</summary>
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-ctl border border-outline-variant bg-surface-container-lowest p-1 shadow-e2">
              <button onClick={() => onCheck(m, 'other')} className="block w-full rounded-xs px-3 py-2.5 text-left text-sm hover:bg-on-surface/[0.06]">Ate something else</button>
              <button onClick={() => onCheck(m, 'skipped')} className="block w-full rounded-xs px-3 py-2.5 text-left text-sm hover:bg-on-surface/[0.06]">Skipped / fasting</button>
            </div>
          </details>
        </span>
      )}
    </li>
  );
}

export function LogSheet({ open, onClose, profileId }: { open: boolean; onClose: () => void; profileId: string | undefined }) {
  const { meals, checkIn, undo } = useToday(profileId);
  const left = meals.filter((m) => !m.checkin).length;
  return (
    <Sheet open={open} onClose={onClose} title="Log today">
      {meals.length === 0 ? (
        <NutrionSays>Pick your meals for the week first, then log them here.</NutrionSays>
      ) : (
        <>
          <NutrionSays mood={left === 0 ? 'happy' : 'idle'} size={48}>
            {left === 0 ? 'All logged for today. Nice!' : `${left} ${left === 1 ? 'meal' : 'meals'} left to log today.`}
          </NutrionSays>
          <ul className="mt-2 divide-y divide-outline-variant">
            {meals.map((m) => (
              <MealCheck key={m.meal.id} m={m} onCheck={checkIn} onUndo={undo} />
            ))}
          </ul>
        </>
      )}
      <Link to="/scan" onClick={onClose} className="mt-4 flex items-center gap-3 rounded-ctl bg-surface-container px-4 py-3 font-medium hover:bg-surface-container-high">
        <ScanLine className="h-5 w-5 text-primary" aria-hidden /> Check a packet before you eat it
      </Link>
    </Sheet>
  );
}
