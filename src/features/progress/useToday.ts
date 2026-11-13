// Today's planned meals joined with today's check-ins, plus the check-in action.
// Used by the Today screen and the "+ Log" sheet so both always agree.
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useBundle, useCheckins, useSelectedPlan } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { CAT } from '../../lib/catalog.ts';
import { applyPatchToPlan } from '../../domain/pipeline.ts';
import { aggregateRecipeNutrition } from '../../domain/recipes/aggregate.ts';
import { dayKey, type MealCheckin } from '../../domain/progress/progress.ts';
import { todayIndex } from '../../lib/format.ts';
import type { PlannedMeal } from '../../domain/planning/plan.ts';
import type { Recipe } from '../../domain/types.ts';

export interface TodayMeal {
  meal: PlannedMeal;
  recipe: Recipe;
  kcal: number;
  proteinG: number;
  checkin: MealCheckin | null;
}

export function useToday(profileId: string | undefined) {
  const bundle = useBundle(profileId);
  const { plan } = useSelectedPlan(profileId);
  const checkins = useCheckins(profileId);
  const qc = useQueryClient();
  const today = dayKey(new Date());

  const meals: TodayMeal[] = useMemo(() => {
    if (!plan || !bundle.data) return [];
    const eff = applyPatchToPlan(plan.draft, plan.patch ?? {}, bundle.data, CAT);
    return eff.meals
      .filter((m) => m.day === todayIndex())
      .map((m) => {
        const recipe = CAT.recipes.get(m.recipeId)!;
        const t = aggregateRecipeNutrition(recipe, CAT.ingredients, m.servings, eff.swaps);
        return { meal: m, recipe, kcal: Math.round(t.energyKcal.value), proteinG: Math.round(t.proteinG.value), checkin: checkins.data?.find((c) => c.day === today && c.slot === m.slot) ?? null };
      });
  }, [plan, bundle.data, checkins.data, today]);

  /** Records what happened to a planned meal. "ate" stores its calories and protein. */
  async function checkIn(m: TodayMeal, status: MealCheckin['status']) {
    if (!profileId) return;
    const c: MealCheckin = {
      id: crypto.randomUUID(),
      profileId,
      day: today,
      slot: m.meal.slot,
      status,
      recipeId: status === 'ate' ? m.recipe.id : null,
      servings: status === 'ate' ? m.meal.servings : null,
      kcal: status === 'ate' ? m.kcal : null,
      proteinG: status === 'ate' ? m.proteinG : null,
      createdAt: new Date().toISOString(),
    };
    await store.saveCheckin(c);
    await qc.invalidateQueries({ queryKey: qk.checkins(profileId) });
  }

  async function undo(m: TodayMeal) {
    if (!profileId || !m.checkin) return;
    await store.deleteCheckin(m.checkin.id);
    await qc.invalidateQueries({ queryKey: qk.checkins(profileId) });
  }

  return { meals, plan, checkins: checkins.data ?? [], today, checkIn, undo, loading: checkins.isLoading || bundle.isLoading };
}
