import { test } from '@playwright/test';
import { toChosenPlan } from './helpers.ts';
test('look @mobile', async ({ page }) => {
  const s = (n: string) => page.screenshot({ path: `/tmp/shots/n-${n}.png`, fullPage: true });
  await page.goto('/'); await s('landing');
  await toChosenPlan(page, 'look@example.com');
  await s('week');
  await page.getByRole('link', { name: 'Today' }).last().click(); await page.waitForTimeout(1200); await s('today');
  await page.getByRole('button', { name: /Ate / }).first().click(); await page.waitForTimeout(600); await s('today-ate');
  await page.getByRole('button', { name: 'Log a meal' }).last().click(); await page.waitForTimeout(500); await s('log');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Me' }).last().click(); await page.waitForTimeout(800); await s('me');
});
