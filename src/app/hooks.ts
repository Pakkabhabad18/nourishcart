// Query hooks. Keys are scoped by profile so switching profiles never shows another
// person's data, and every mutation invalidates exactly what it changes.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { addDays, dayKey } from '../domain/progress/progress.ts';
import { store } from '../lib/store/index.ts';
import { useApp } from './context.tsx';
import { CAT } from '../lib/catalog.ts';
import { runPipeline, negotiate } from '../domain/pipeline.ts';
import type { ProfileBundle } from '../domain/types.ts';
import type { StoredPlan } from '../domain/persistence/mappers.ts';
import { plannedDailyConsumption, estimateReplenishment } from '../domain/inventory/pantry.ts';

export const qk = {
  profiles: ['profiles'] as const,
  bundle: (id: string) => ['bundle', id] as const,
  calc: (id: string) => ['calc', id] as const,
  plans: (id: string) => ['plans', id] as const,
  basket: (id: string) => ['basket', id] as const,
  pantry: (id: string) => ['pantry', id] as const,
  orders: ['orders'] as const,
  consents: ['consents'] as const,
  schedule: (id: string) => ['schedule', id] as const,
  checkins: (id: string) => ['checkins', id] as const,
};

/** Check-ins for the last 60 days (enough for streaks, the week strip and badges). */
export function useCheckins(profileId: string | null | undefined) {
  return useQuery({ queryKey: qk.checkins(profileId ?? '-'), queryFn: () => store.listCheckins(profileId!, addDays(dayKey(new Date()), -60)), enabled: !!profileId });
}

export function useProfiles() {
  const { session } = useApp();
  return useQuery({ queryKey: qk.profiles, queryFn: () => store.listProfiles(), enabled: !!session });
}

/** Active profile: the stored choice if it still exists and is not archived, else the first active profile. */
export function useActiveProfile() {
  const { activeProfileId } = useApp();
  const profiles = useProfiles();
  const active = profiles.data?.filter((p) => !p.archived) ?? [];
  const profile = active.find((p) => p.id === activeProfileId) ?? active[0] ?? null;
  return { profile, profiles, all: profiles.data ?? [] };
}

export function useBundle(profileId: string | null | undefined) {
  return useQuery({ queryKey: qk.bundle(profileId ?? '-'), queryFn: () => store.getBundle(profileId!), enabled: !!profileId });
}

export function useSaveBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ProfileBundle) => store.saveBundle(b),
    onSuccess: (b) => {
      qc.setQueryData(qk.bundle(b.profile.id), b);
      qc.invalidateQueries({ queryKey: qk.profiles });
    },
  });
}

export function useCalculation(profileId: string | null | undefined) {
  return useQuery({ queryKey: qk.calc(profileId ?? '-'), queryFn: () => store.latestCalculation(profileId!), enabled: !!profileId });
}

export function usePlans(profileId: string | null | undefined) {
  return useQuery({ queryKey: qk.plans(profileId ?? '-'), queryFn: () => store.listPlans(profileId!), enabled: !!profileId });
}

export function useSelectedPlan(profileId: string | null | undefined): { plan: StoredPlan | null; proposed: StoredPlan[]; isLoading: boolean; error: unknown } {
  const q = usePlans(profileId);
  const plans = q.data ?? [];
  return { plan: plans.find((p) => p.status === 'selected') ?? null, proposed: plans.filter((p) => p.status === 'proposed'), isLoading: q.isLoading, error: q.error };
}

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: StoredPlan) => store.savePlan(p),
    onSuccess: (p) => qc.invalidateQueries({ queryKey: qk.plans(p.profileId) }),
  });
}

export function usePantry(profileId: string | null | undefined) {
  return useQuery({ queryKey: qk.pantry(profileId ?? '-'), queryFn: () => store.listPantry(profileId!), enabled: !!profileId });
}

export function useBasket(profileId: string | null | undefined) {
  return useQuery({ queryKey: qk.basket(profileId ?? '-'), queryFn: () => store.getActiveBasket(profileId!), enabled: !!profileId });
}

export function useOrders() {
  const { session } = useApp();
  return useQuery({ queryKey: qk.orders, queryFn: () => store.listOrders(), enabled: !!session });
}

/**
 * The live grocery pipeline for the selected plan: demand (minus pantry), optimised
 * basket and budget alternatives. Pure and fast (a few ms), so it is recomputed on render.
 */
export function useGroceryPipeline(bundle: ProfileBundle | null | undefined, plan: StoredPlan | null, pantryItems: { profileId: string; ingredientId: string; quantity: number }[] | undefined, budgetOverride?: number | null) {
  return useMemo(() => {
    if (!bundle || !plan || !bundle.preferences.dietPattern) return null;
    const input = { bundle, plan: plan.draft, targets: plan.targets, patch: plan.patch ?? {}, pantry: pantryItems ?? [], cat: CAT, budgetInrOverride: budgetOverride };
    const result = runPipeline(input);
    const nego = negotiate(input, result);
    return { input, result, ...nego };
  }, [bundle, plan, pantryItems, budgetOverride]);
}

export function useReplenishment(profileId: string | null | undefined) {
  const pantry = usePantry(profileId);
  const { plan } = useSelectedPlan(profileId);
  return useMemo(() => {
    if (!pantry.data) return null;
    const daily = plan ? plannedDailyConsumption(plan.draft, CAT) : new Map<string, number>();
    return estimateReplenishment(pantry.data, daily, new Date());
  }, [pantry.data, plan]);
}
