import { defineConfig } from 'vitest/config';
// Runs against the local Supabase stack (npm run sb:start + supabase functions serve).
export default defineConfig({
  test: { include: ['tests/integration/**/*.int.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 120_000, fileParallelism: false },
});
