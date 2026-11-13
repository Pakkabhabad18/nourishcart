// End-to-end journey for a new person, in demo mode (no backend). Screenshots go to e2e/screenshots/.
// Covers: sign-in, consent, setup conversation (with a correction), personal targets, three plans,
// swapping a meal, the shopping list, practice checkout, pantry, a second person, and the
// AI-backed screens with the AI answer mocked.
import { expect, test } from '@playwright/test';
import { ASHA_ANSWERS, firstPerson, shot, signIn, talk, toChosenPlan } from './helpers.ts';

test('new person: setup by conversation to a filled shopping list', async ({ page, context }) => {
  await page.goto('/');
  await shot(page, '01-landing');
  await signIn(page, 'demo.asha@example.com');

  // Welcome: name and consent, both required
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Please type a name.')).toBeVisible();
  await page.getByLabel('Your name').fill('Asha');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Please tick the box to agree.')).toBeVisible();
  await shot(page, '03-welcome');
  await page.getByLabel(/I agree NourishCart can use my details/).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Conversation: one question at a time
  await expect(page.getByRole('heading', { name: "Let's set up Asha" })).toBeVisible();
  await shot(page, '04-talk-start');
  await page.getByRole('button', { name: 'Type my answers' }).click();
  await expect(page.getByText('How old are you?')).toBeVisible();
  // An unclear answer is asked again, never guessed
  await page.locator('#conv-answer').fill('hmm');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Sorry, I didn't catch that/)).toBeVisible();
  for (const a of ASHA_ANSWERS) {
    await page.locator('#conv-answer').fill(a);
    await page.getByRole('button', { name: 'Send' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Check your answers' })).toBeVisible();
  const answersCard = page.getByRole('region', { name: 'Your answers' });
  await expect(answersCard.getByText('Okra (bhindi)')).toBeVisible();
  await expect(answersCard.getByText('₹1,500 a week')).toBeVisible();
  await shot(page, '04b-talk-summary');
  // Change one answer from the summary
  await page.getByRole('button', { name: 'Change goal' }).click();
  await page.locator('#conv-answer').fill('lose fat');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('region', { name: 'Your answers' }).getByText('Lose fat', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Looks right' }).click();

  // Targets: goal, own numbers, nutrients
  await expect(page.getByRole('heading', { name: 'Your daily targets' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Lose fat/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Iron' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Edit numbers' }).click();
  await page.getByLabel('Protein per day').fill('90');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save targets' }).click();
  await expect(page.getByText('Yours', { exact: true })).toBeVisible();
  await shot(page, '05-targets');

  // Plans are made without another tap
  await page.getByRole('button', { name: 'See meal plans' }).click();
  await expect(page.getByRole('heading', { name: 'Pick a plan for this week' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose this plan' })).toHaveCount(3);
  await expect(page.getByText(/\/90 g/).first()).toBeVisible(); // protein shown against her own target
  await shot(page, '06-plans');
  await page.getByRole('button', { name: 'Choose this plan' }).nth(1).click();
  await expect(page.getByRole('heading', { name: "This week's meals" })).toBeVisible();

  // Swap one meal
  await page.getByRole('button', { name: 'Replace' }).nth(1).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Use this' }).first().click();
  await expect(page.getByText(/replaced/)).toBeVisible();
  await shot(page, '07-week');

  // Shopping list; bring it under budget if needed
  await page.getByRole('link', { name: 'Shop for this week' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Compare Zepto and Instamart' })).toBeVisible();
  for (let i = 0; i < 5 && (await page.getByText(/over budget/).isVisible()); i++) {
    await page.getByRole('button', { name: 'Apply', exact: true }).first().click();
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(/under budget/)).toBeVisible();
  // An excluded food is never on the list
  await expect(page.getByRole('button', { name: /^Okra/ })).toHaveCount(0);
  await shot(page, '08-shop');

  // Practice checkout (offline blocks it)
  await page.getByRole('button', { name: 'Practice checkout (no real order)' }).click();
  await page.getByRole('button', { name: 'Approve list' }).click();
  await context.setOffline(true);
  await page.getByLabel(/I understand this is practice/).check();
  await expect(page.getByRole('button', { name: /Place practice order/ })).toBeDisabled();
  await context.setOffline(false);
  await page.getByRole('button', { name: /Place practice order/ }).click();
  await expect(page.getByText('SIMULATED ORDER – NO PURCHASE PLACED – NO PAYMENT TAKEN')).toBeVisible();
  await shot(page, '09-receipt');

  // Today shows the week as done; pantry was filled from the order
  await page.getByRole('link', { name: 'Today', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: "Today's meals" })).toBeVisible();
  await shot(page, '10-today');
  await page.getByRole('button', { name: /Asha/ }).click();
  await page.getByRole('menuitem', { name: 'Pantry' }).click();
  await expect(page.getByText(/Reorder around/).first()).toBeVisible();

  // Second person: separate setup and pantry
  await page.getByRole('button', { name: /Asha/ }).click();
  await page.getByRole('menuitem', { name: 'Household' }).click();
  await page.getByRole('button', { name: 'Add a person' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Ravi');
  await page.getByRole('button', { name: 'Create and set up' }).click();
  await expect(page.getByRole('heading', { name: "Let's set up Ravi" })).toBeVisible();
  await page.getByRole('button', { name: /Ravi/ }).click();
  await page.getByRole('menuitem', { name: 'Pantry' }).click();
  await expect(page.getByText('Nothing here yet')).toBeVisible();
  await page.getByRole('button', { name: /Ravi/ }).click();
  await page.getByRole('menuitemradio', { name: /Asha/ }).click();
  await expect(page.getByText(/Reorder around/).first()).toBeVisible();
});

test('phone layout: four tabs, no overflow @mobile', async ({ page }) => {
  await toChosenPlan(page, 'mobile@example.com');
  await shot(page, 'm01-week');
  const nav = page.getByRole('navigation', { name: 'Main' }).last();
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(page.getByText(/Demo mode/)).toHaveCount(0);
  for (const tab of ['Today', 'Shop', 'Scan']) {
    await nav.getByRole('link', { name: tab }).click();
    await page.waitForTimeout(300);
    await shot(page, `m-${tab.toLowerCase()}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  }
});

test('evaluation page shows the gates', async ({ page }) => {
  await signIn(page, 'demo.eval@example.com');
  await firstPerson(page, 'Eval');
  await page.getByRole('button', { name: /Eval/ }).click();
  await page.getByRole('menuitem', { name: 'How we test' }).click();
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible();
  await expect(page.getByText(/Calories never below the floor/)).toBeVisible();
  await shot(page, '15-evaluation');
});

test('conversation: AI reads an answer the rules could not, and our checks drop what it invents (AI mocked)', async ({ page }) => {
  // The AI suggests the right occupation (quoted from the answer) and an invented weight
  // (quoted words not in the answer). Only the first may be used.
  await page.route('**/api/intake', (route) =>
    route.fulfill({
      json: {
        model: 'mock',
        promptVersion: 'intake-prompt-1.1.0',
        content: JSON.stringify({ occupation: { value: 'light', evidence: 'pottery in my studio' }, weightKg: { value: 99, evidence: 'about 99 kilos' } }),
      },
    }),
  );
  await signIn(page, 'demo.ai@example.com');
  await firstPerson(page, 'Meera');
  await page.getByLabel(/let AI read my answer/).check();
  await page.getByRole('button', { name: 'Type my answers' }).click();
  for (const a of ['31', 'female', '165', '60']) {
    await page.locator('#conv-answer').fill(a);
    await page.getByRole('button', { name: 'Send' }).click();
  }
  for (let i = 0; i < 2; i++) {
    await page.locator('#conv-answer').fill('I make pottery in my studio');
    await page.getByRole('button', { name: 'Send' }).click();
  }
  await expect(page.getByText(/Some walking, got it/)).toBeVisible();
  for (const a of ['some', 'no', 'non veg', 'no', 'nothing', 'stay the same', 'no', '2000 a week', 'no']) {
    await page.locator('#conv-answer').fill(a);
    await page.getByRole('button', { name: 'Send' }).click();
  }
  await expect(page.getByRole('region', { name: 'Your answers' }).getByText('60 kg')).toBeVisible(); // the invented 99 kg never replaced what she said
  await shot(page, '04c-ai-reader');
});

test('label scan: photo read by AI, verdict by our rules (AI mocked)', async ({ page }) => {
  await page.route('**/api/label', (route) =>
    route.fulfill({
      json: {
        model: 'mock',
        promptVersion: 'label-prompt-1.0.0',
        content: JSON.stringify({ productName: 'Fruity Gummy Bears', ingredientsText: 'Sugar, Glucose Syrup, Gelatine, Acidity Regulator (INS 330), Colours (INS 120, INS 133)', containsText: '', mayContainText: '', vegMark: 'brown', readable: true, allergens: [] }),
      },
    }),
  );
  await signIn(page, 'demo.scan@example.com');
  await firstPerson(page, 'Asha');
  await talk(page);
  await page.getByRole('button', { name: 'Looks right' }).click();
  await page.getByRole('link', { name: 'Scan', exact: true }).first().click();
  await expect(page.getByText(/Gemini/)).toHaveCount(0);
  await page.locator('#label-photo').setInputFiles('eval-data/labels/l06-gummy-gelatin.jpg');
  await expect(page.getByText('Fruity Gummy Bears')).toBeVisible();
  await expect(page.getByText('Avoid')).toBeVisible();
  await expect(page.getByText(/label says “gelatine”/)).toBeVisible();
  await shot(page, '16-label-scan');
});

test('cook note: translated menu keeps every quantity (AI mocked)', async ({ page }) => {
  // The mock answer drops one quantity, so the app must refuse it and show English instead.
  await page.route('**/api/cook', (route) => route.fulfill({ json: { content: 'సోమవారం మెను: పోహా 75 g', model: 'mock', promptVersion: 'cook-prompt-1.0.0' } }));
  await toChosenPlan(page, 'demo.cook@example.com');
  await page.getByRole('link', { name: 'Menu for my cook' }).click();
  await page.getByRole('radio', { name: 'Mon' }).click();
  await page.getByRole('button', { name: 'Make the note' }).click();
  await expect(page.getByText(/changed some quantities/)).toBeVisible();
  await expect(page.getByText(/Menu for Monday\./)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send on WhatsApp' })).toHaveAttribute('href', /wa\.me/);
  await shot(page, '17-cook-note');
});

test('step-by-step form still works', async ({ page }) => {
  await signIn(page, 'demo.ravi@example.com');
  await firstPerson(page, 'Ravi');
  await page.getByRole('button', { name: 'Use a form instead' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter a date of birth or your age.')).toBeVisible();
  await page.getByLabel('Date of birth').fill('2000-05-14');
  await page.getByRole('radio', { name: 'Male', exact: true }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Height in centimetres').fill('172');
  await page.getByLabel('Weight in kg').fill('70');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('radio', { name: /Mostly sitting/ }).click();
  await page.getByRole('radio', { name: /Medium/ }).click();
  await page.getByLabel('Workouts per week').fill('0');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('radio', { name: 'Vegetarian', exact: true }).click();
  await page.getByLabel('No allergies or severe intolerances').check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByText('Stay as I am').click();
  await page.getByRole('checkbox', { name: 'Vitamin B12' }).click();
  await page.getByLabel('Grocery budget for this person').fill('1500');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('None of these apply').check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'Calculate my estimates' }).click();
  await expect(page.getByRole('heading', { name: 'Your daily targets' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Vitamin B12' })).toHaveAttribute('aria-checked', 'true');
});
