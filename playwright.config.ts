import { defineConfig, devices } from '@playwright/test';
// E2E runs against the production build in DEMO MODE (no Supabase env), so it needs no backend.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  // Service workers are blocked so every run tests the build just made, not a cached one.
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', serviceWorkers: 'block' },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
