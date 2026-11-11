// Picks the store from environment. No Supabase env -> DEMO MODE.
import { DemoStore } from './demoStore.ts';
import { SupabaseStore } from './supabaseStore.ts';
import type { NourishStore } from './types.ts';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const store: NourishStore = url && key ? new SupabaseStore(url, key) : new DemoStore();
export const isDemo = store.mode === 'demo';
