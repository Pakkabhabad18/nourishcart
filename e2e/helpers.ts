// Shared steps for the browser tests: sign in, name the first person, and answer the
// setup conversation by typing (the speech service can't run in a headless browser).
import { expect, type Page } from '@playwright/test';

export const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

/** Answers in the order the conversation asks them, for a 26-year-old woman who wants to build muscle. */
export const ASHA_ANSWERS = ['26', 'female', '162 cm', '58', 'desk job', 'some walking', '3 times a week', '45 minutes moderate', 'vegetarian but I eat eggs', 'no', 'bhindi', 'build muscle', 'iron', '1500 a week', 'no'];

export async function signIn(page: Page, email: string, base = '') {
  await page.goto(`${base}/`);
  await page.getByRole('link', { name: 'Get started', exact: true }).first().click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const code = (await page.getByLabel('Test inbox').locator('p.num').first().textContent())!.trim();
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
}

export async function firstPerson(page: Page, name: string) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel(/I agree NourishCart can use my details/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: `Let's set up ${name}` })).toBeVisible();
}

/** Types answers into the conversation until the summary appears. */
export async function talk(page: Page, answers: string[] = ASHA_ANSWERS) {
  await page.getByRole('button', { name: 'Type my answers' }).click();
  for (const a of answers) {
    if (await page.getByRole('button', { name: 'Looks right' }).isVisible()) break;
    await page.locator('#conv-answer').fill(a);
    await page.getByRole('button', { name: 'Send' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Check your answers' })).toBeVisible();
}

/** Full setup to a chosen plan, for tests that start further along the journey. */
export async function toChosenPlan(page: Page, email: string, name = 'Asha', option = 1) {
  await signIn(page, email);
  await firstPerson(page, name);
  await talk(page);
  await page.getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByRole('heading', { name: 'Your daily targets' })).toBeVisible();
  await page.getByRole('button', { name: 'See meal plans' }).click();
  await expect(page.getByRole('heading', { name: 'Pick a plan for this week' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose this plan' }).nth(option).click();
  await expect(page.getByRole('heading', { name: "This week's meals" })).toBeVisible();
}
