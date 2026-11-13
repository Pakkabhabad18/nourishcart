// PRD 17.3 golden demo, end to end, in demo mode. Screenshots go to e2e/screenshots/.
import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await shot(page, '01-landing');
  await page.getByRole('link', { name: 'Get started with email' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  // Resend is throttled
  await expect(page.getByRole('button', { name: /Resend code in \d+s/ })).toBeDisabled();
  const code = (await page.getByLabel('Demo inbox').locator('p.num').first().textContent())!.trim();
  await shot(page, '02-otp');
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect or has expired');
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
}

async function onboard(page: Page) {
  // About
  await page.getByLabel('Date of birth').fill('2000-05-14');
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // Body
  await page.getByLabel('Height in centimetres').fill('162');
  await page.getByLabel('Weight in kg').fill('58');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // Activity
  await page.getByRole('radio', { name: /Mostly sitting/ }).click();
  await page.getByRole('radio', { name: /Medium/ }).click();
  await page.getByLabel('Workouts per week').fill('3');
  await page.getByLabel('Minutes per session').fill('45');
  await page.getByLabel('Type').selectOption('strength');
  await page.getByRole('radio', { name: /Moderate: a bit breathless/ }).click();
  await shot(page, '04-onboarding-activity');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // Food
  await page.getByRole('radio', { name: 'Eggetarian' }).click();
  await page.getByLabel('No allergies or severe intolerances').check();
  await page.getByLabel('Search foods').fill('okra');
  await page.getByRole('checkbox', { name: 'Okra (bhindi)' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // Goal & budget
  await page.getByRole('radio', { name: /Support training and muscle/ }).click();
  await page.getByLabel('Grocery budget for this person').fill('1500');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // Health scope
  await page.getByLabel('None of these apply').check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  // Review
  await expect(page.getByText('Okra (bhindi)')).toBeVisible();
  await page.getByRole('button', { name: 'Calculate my estimates' }).click();
}

test('golden demo journey', async ({ page, context }) => {
  await signIn(page, 'demo.asha@example.com');
  await expect(page.getByRole('heading', { name: 'Before you add any personal details' })).toBeVisible();
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await expect(page.getByText('Please accept the privacy notice')).toBeVisible();
  await page.getByLabel(/I have read the notice/).check();
  await page.getByLabel('Profile name').fill('Demo Asha');
  await shot(page, '03-welcome');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();

  // Speak-or-type setup (typed here; the browser's speech service can't run headless).
  await expect(page.getByRole('heading', { name: 'Tell us about Demo Asha' })).toBeVisible();
  await page.getByLabel('Describe yourself').fill(
    "I'm 26, female, 162 cm, 58 kg. Desk job, walk daily in the evening. Gym 3 times a week for 45 minutes, moderate strength training. Vegetarian but I eat eggs. Never eat bhindi. Build muscle.",
  );
  await shot(page, '04a-quick-describe');
  await page.getByRole('button', { name: /Continue \(3 left to ask\)/ }).click();
  // Only what was not said is asked: allergies, budget, health scope
  await expect(page.getByRole('heading', { name: 'A few more details' })).toBeVisible();
  await expect(page.getByText('Height (cm)')).toHaveCount(0);
  await expect(page.getByText('from “never eat bhindi”')).toBeVisible();
  await expect(page.getByText('[object Object]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save and see my targets' }).click();
  await expect(page.getByText(/Still needed: allergies, budget, health conditions/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'No food allergies' }).click();
  await page.getByLabel('Grocery budget (₹)').fill('1500');
  await page.getByRole('checkbox', { name: 'None of these' }).click();
  await shot(page, '04b-quick-review');
  await page.getByRole('button', { name: 'Save and see my targets' }).click();

  // Nutrition results
  await expect(page.getByRole('heading', { name: 'Daily estimates for Demo Asha' })).toBeVisible();
  await expect(page.getByText(/planning floor/)).toBeVisible();
  await page.getByRole('button', { name: 'How was this estimated?' }).click();
  await expect(page.getByText('provisional demo method')).toBeVisible();
  await shot(page, '05-nutrition');

  // Three plans
  await page.getByRole('button', { name: 'See meal plan options' }).click();
  await page.getByRole('button', { name: 'Show me three plans' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a plan for this week' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Choose / })).toHaveCount(3);
  await shot(page, '06-compare');
  await page.getByRole('button', { name: 'Choose Balanced' }).click();
  await expect(page.getByRole('heading', { name: 'Balanced week' })).toBeVisible();

  // Replace lunch on the current day
  await page.getByRole('button', { name: 'Replace' }).nth(1).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await shot(page, '07-replace');
  await page.getByRole('dialog').getByRole('button', { name: 'Use this' }).first().click();
  await expect(page.getByText(/replaced/)).toBeVisible();
  await shot(page, '08-week');

  // Groceries: over budget, accept alternatives until under
  await page.getByRole('link', { name: 'Build this week’s groceries' }).click();
  await expect(page.getByRole('heading', { name: 'Groceries for this week' })).toBeVisible();
  await expect(page.getByText(/over your hard budget/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review basket' })).toBeDisabled();
  await shot(page, '09-over-budget');
  for (let i = 0; i < 4; i++) {
    if (!(await page.getByText(/over your hard budget/).isVisible())) break;
    await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(/under budget/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Changes you accepted' })).toBeVisible();
  await shot(page, '10-under-budget');

  // Checkout
  await page.getByRole('button', { name: 'Review basket' }).click();
  await page.getByRole('button', { name: 'Approve basket' }).click();
  // Instamart (sandbox): search, fill cart, review, explicit confirmation, order
  await page.getByRole('button', { name: 'Order from a store' }).click();
  await page.getByRole('button', { name: 'Find products on Instamart' }).click();
  await expect(page.getByText(/items found/)).toBeVisible();
  await expect(page.getByText('Not added. Please pick these yourself')).toBeVisible();
  await page.getByRole('button', { name: /Put \d+ items in my Instamart cart/ }).click();
  await expect(page.getByText('To pay')).toBeVisible();
  await expect(page.getByRole('button', { name: /Place order for/ })).toBeDisabled();
  await page.getByLabel(/I've checked the items and the total/).check();
  await shot(page, '11a-instamart-cart');
  await page.getByRole('button', { name: /Place order for/ }).click();
  await expect(page.getByText(/Sandbox order SANDBOX-\d+ placed/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find Okra (bhindi) on Zepto' })).toHaveCount(0); // excluded food never listed
  await shot(page, '11b-store-order');
  await page.getByRole('link', { name: 'Back to basket' }).click();
  // Offline blocks checkout
  await context.setOffline(true);
  await page.getByLabel(/I understand this is a simulated order/).check();
  await expect(page.getByRole('button', { name: /Place simulated order/ })).toBeDisabled();
  await context.setOffline(false);
  await shot(page, '11-checkout');
  await page.getByRole('button', { name: /Place simulated order/ }).click();
  await expect(page.getByText('SIMULATED ORDER – NO PURCHASE PLACED – NO PAYMENT TAKEN')).toBeVisible();
  await shot(page, '12-receipt');

  // Orders + pantry + replenishment
  await page.getByRole('link', { name: 'Orders' }).first().click();
  await expect(page.getByText('Confirmed (simulated)')).toHaveCount(1);
  await page.getByRole('link', { name: 'Pantry' }).first().click();
  await expect(page.getByText(/Reorder around/).first()).toBeVisible();
  await shot(page, '13-pantry');
  await page.getByRole('link', { name: 'Home' }).first().click();
  await shot(page, '14-overview');

  // Second profile + isolation
  await page.getByRole('link', { name: 'Profiles' }).first().click();
  await page.getByRole('button', { name: 'Add adult profile' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Ravi');
  await page.getByRole('button', { name: 'Create and set up' }).click();
  await expect(page.getByRole('heading', { name: 'Tell us about Ravi' })).toBeVisible();
  await page.getByRole('link', { name: 'Pantry' }).first().click();
  await expect(page.getByText('The pantry is empty')).toBeVisible();
  await page.getByRole('link', { name: 'Profiles' }).first().click();
  await shot(page, '15-profiles');
  await page.getByRole('button', { name: 'Switch to Demo Asha' }).click();
  await page.getByRole('link', { name: 'Pantry' }).first().click();
  await expect(page.getByText(/Reorder around/).first()).toBeVisible();
});

test('mobile layout of the key screens @mobile', async ({ page }) => {
  await page.goto('/');
  await shot(page, 'm01-landing');
  await page.getByRole('link', { name: 'Get started with email' }).click();
  await page.getByLabel('Email address').fill('mobile@example.com');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  const code = (await page.getByLabel('Demo inbox').locator('p.num').first().textContent())!.trim();
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page.getByLabel(/I have read the notice/).check();
  await page.getByLabel('Profile name').fill('Demo Asha');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByRole('button', { name: 'Use an example' }).click();
  await shot(page, 'm01b-quick-setup');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Check what we understood' })).toBeVisible();
  await expect(page.getByText('₹1,500 a week')).toBeVisible();
  await page.getByRole('button', { name: 'Save and see my targets' }).click();
  await expect(page.getByRole('heading', { name: 'Daily estimates for Demo Asha' })).toBeVisible();
  await shot(page, 'm02-nutrition');
  await page.getByRole('link', { name: 'Plans', exact: true }).click();
  await page.getByRole('button', { name: 'Show me three plans' }).click();
  await shot(page, 'm03-compare');
  await page.getByRole('button', { name: 'Choose Budget Optimised' }).click();
  await shot(page, 'm04-week');
  await page.getByRole('link', { name: 'Groceries', exact: true }).click();
  await shot(page, 'm05-groceries');
  // No horizontal overflow in the primary flow (NFR responsive)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('evaluation page shows the gates', async ({ page }) => {
  await signIn(page, 'demo.eval@example.com');
  await page.getByLabel(/I have read the notice/).check();
  await page.getByLabel('Profile name').fill('Eval');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByRole('link', { name: 'Evaluation', exact: true }).first().click();
  await expect(page.getByText(/All \d+ checks passed/)).toBeVisible();
  await expect(page.getByText('Store carts contain nothing that breaks the person’s rules (checked against hand labels)')).toBeVisible();
  await shot(page, '15-evaluation');
});

test('AI reader: model answer is checked before use (model mocked)', async ({ page }) => {
  // The real model runs on Vercel; here we play back a fixed answer that includes one
  // correct detail the rules miss (gluten) and one invented detail (weight) that must be rejected.
  await page.route('**/api/intake', (route) =>
    route.fulfill({
      json: {
        model: 'openai/gpt-oss-120b',
        promptVersion: 'intake-prompt-1.1.0',
        content: JSON.stringify({
          ageYears: { value: 31, evidence: '31 year old' },
          allergies: { value: ['gluten'], evidence: "can't have gluten" },
          weightKg: { value: 75, evidence: 'about 75 kilos' },
        }),
      },
    }),
  );
  await signIn(page, 'demo.ai@example.com');
  await page.getByLabel(/I have read the notice/).check();
  await page.getByLabel('Profile name').fill('Meera');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByLabel('Describe yourself').fill("I can't have gluten at all, it makes me really sick. 31 year old woman, 165 cm. I eat everything including fish.");
  await page.getByLabel(/Let AI read my description/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Read by AI, checked by NourishCart')).toBeVisible();
  await expect(page.getByText('1 AI suggestion was rejected by our checks')).toBeVisible();
  await expect(page.getByText('Gluten (wheat)')).toBeVisible();
  await shot(page, '04c-ai-reader');
});

test('label scan: photo read by AI, verdict by our rules (model mocked)', async ({ page }) => {
  await page.route('**/api/label', (route) =>
    route.fulfill({
      json: {
        model: 'gemini-mock',
        promptVersion: 'label-prompt-1.0.0',
        content: JSON.stringify({ productName: 'Fruity Gummy Bears', ingredientsText: 'Sugar, Glucose Syrup, Gelatine, Acidity Regulator (INS 330), Colours (INS 120, INS 133)', containsText: '', mayContainText: '', vegMark: 'brown', readable: true, allergens: [] }),
      },
    }),
  );
  await signIn(page, 'demo.scan@example.com');
  await page.getByLabel(/I have read the notice/).check();
  await page.getByLabel('Profile name').fill('Asha');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByRole('button', { name: 'Use an example' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save and see my targets' }).click();
  await page.getByRole('link', { name: 'Scan', exact: true }).first().click();
  await page.locator('#label-photo').setInputFiles('eval-data/labels/l06-gummy-gelatin.jpg');
  await expect(page.getByText('Fruity Gummy Bears')).toBeVisible();
  await expect(page.getByText('Avoid')).toBeVisible();
  await expect(page.getByText(/label says “gelatine”/)).toBeVisible();
  await shot(page, '16-label-scan');
});

test('step-by-step form still works', async ({ page }) => {
  await signIn(page, 'demo.ravi@example.com');
  await page.getByLabel(/I have read the notice/).check();
  await page.getByLabel('Profile name').fill('Ravi');
  await page.getByRole('button', { name: 'Create profile and continue' }).click();
  await page.getByRole('link', { name: 'Fill the form step by step instead' }).click();
  // Validation blocks an empty step
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter a date of birth or your age.')).toBeVisible();
  await onboard(page);
  await expect(page.getByRole('heading', { name: 'Daily estimates for Ravi' })).toBeVisible();
});
