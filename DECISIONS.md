# Decisions

PRD decisions D-01 to D-13 are kept as written in the PRD (PWA, Vite+React+TS+Tailwind, Cloudflare Pages, Supabase Free, email OTP only, custom SMTP for public OTP, one account with many adult profiles, personal budgets, simulated commerce, no unpaid LLM with profile data, deterministic versioned nutrition, data licence and review gate open, official-access-only retailers).

Decisions made during the build:

| ID | Decision | Why |
|---|---|---|
| D-14 | Energy uses FAO/WHO/UNU 2004 Schofield BMR × a product PAL mapping, labelled `provisional_demo`. | The PRD forbids guessing the ICMR-NIN 2020 BMR method. The FAO equations are published and were checked against the FAO page. The sedentary anchor uses ICMR's 1.40. |
| D-15 | Energy is displayed as a range (−12% / +10%) with no correction applied to the point estimate. | ICMR notes 10–12% overestimation by some international equations; showing it as uncertainty avoids an unreviewed "blanket correction". |
| D-16 | No macro targets; plans report carbs/fat/fibre only. | PRD 7.4 requires a reviewed policy first. |
| D-17 | Leaner schema: planned meals and basket lines as jsonb snapshots; replenishment computed on read; no separate accounts table. | Atomic plan/basket versions, no stale estimates. See DATABASE.md. |
| D-18 | Only clinical scope status is stored, not the condition selected. | Data minimisation (PRD 7.1, 15.2). |
| D-19 | Basket states follow the PRD (DRAFT, REVIEW, OVER_BUDGET, APPROVED, SIMULATED_ORDER, EXPIRED); order states follow the master prompt (DRAFT → … → CONFIRMED, FAILED, CANCELLED). | The two documents described different objects; keeping both avoids a conflict. |
| D-20 | Budget alternatives are patches re-run through the full pipeline. | Savings are exact, nutrition is re-validated, every change is undoable. |
| D-21 | Added "meal consolidation" alternative (swap the few meals that need a single-use ingredient). | Ingredient swaps alone saved too little (₹16–36) for a ₹1,500 basket; consolidation saves ₹50–170 and keeps the plan valid. |
| D-22 | Edge Functions import a copy of `src/domain` and `src/data` (`npm run sync:functions`) and a vendored supabase-js bundle. | One source of truth for maths; functions boot with no runtime npm fetch. |
| D-23 | Demo mode (browser storage + on-screen code) exists alongside Supabase mode. | Reviewers can use the full product before a Supabase project and SMTP domain exist. It is clearly labelled and is not an auth bypass for real data. |
| D-24 | Review preview is hosted as a private claude.ai page (memory router, no service worker). Vercel/Cloudflare deploys need the team's own accounts. | No deploy credentials were available in the build session. |
| D-25 | Household view consolidates demand with per-person attribution but does not order a combined basket yet. | PRD marks household basket optional; budgets must not merge silently. |
| D-26 | Weekly budget from a monthly budget = monthly / 4.33. | Explicit, documented conversion. |
| D-27 | Monday-start plan week; plan cost shown both as "food used" and "first basket after pack rounding". | Pack rounding makes the first basket higher than ingredient cost; showing both avoids surprise. |
| D-28 | Git commits use the user's name and email only, without a co-author trailer. | User instruction. |

Open questions for the team are listed in BUILD_STATUS.md.
| D-29 | Material Design 3 is the design kit; colours are generated from one seed by Material Color Utilities (`npm run theme`). | Professor asked for a recognised kit; M3 suits a utility app used daily on Android phones in India. |
| D-30 | Onboarding starts with "describe yourself" (voice or text) read by a rule-based extractor, not an LLM. Evidence is shown per field and only missing items are asked. | Deterministic, testable (gates V1–V3), free, and no health data leaves the device. An LLM path exists behind safety layers and its own eval. |
| D-31 | Allergies and "no health conditions" are never inferred from silence. | Missing an allergy is the costliest error in the product. |
| D-32 | A stated age is stored with the date it was stated (`age_at_entry`, `age_entered_at`); current age is derived. | People say "I'm 26" more readily than a date of birth; the age still moves on each year. |
| D-33 | Instamart ordering uses only the official Builders Club MCP tools, behind a server proxy; until access is granted it runs on an in-app sandbox. Zepto gets search hand-off links only. | No scraping or automation of consumer sites (terms and safety). The sandbox lets the full flow and its safety be evaluated now. |
| D-34 | Checkout to a real store needs a fresh confirmation of the exact total and is never retried automatically. | Orders cost real money and the checkout tool is not idempotent. |
| D-35 | The "describe yourself" AI reader uses Groq (free tier, OpenAI's open-weight gpt-oss-120b) through a Vercel function, opt-in per person. This replaces D-30's "no LLM". | Groq does not train on API data and offers Zero Data Retention, so the earlier rule against free LLM APIs is met for this text. The key stays server-side; the rules still check every answer. |
| D-36 | A held-out set of 19 descriptions is kept separate from the 40 used to build the rules. | Scoring only on the development set made the rules look near-perfect; the held-out set shows the real gap (about 70% recall) that the AI reader is meant to close. |
| D-37 | Price comparison reads Zepto and Instamart through a read-only browser extension in the person's own browser, not from a server. | Prices depend on the person's location and login; server scraping is blocked by the stores and against their terms. Read-only, store-search URLs only. |
| D-38 | A store page is read by AI (Gemini), and every product it reports is checked against the page text (title as a line, price on its own card). Choosing and totalling are deterministic. | One reader works for any store layout, and the checks stop invented or planted prices whatever the model does. Store page text is public, so the free tier's data terms are acceptable here. |
| D-39 | Filling store carts automatically is not built yet. | It means clicking on a consumer website; it needs a team decision on store terms first. Instamart's compliant route is the Builders Club MCP. |
