# Build status

Last updated: 13 November 2026, session 2.

## Session 2 (professor's feedback)

| Feedback | What changed | Tested by |
|---|---|---|
| UI looks generic | Material Design 3: colour roles from Material Color Utilities (seed #1A73E8), Roboto Flex, navigation rail/bar, filled/tonal/outlined buttons, filter chips, snackbars | E2E screenshots |
| Onboarding has too many questions | Speak-or-type setup (`/profiles/:id/quick`): browser speech (en-IN) or typing, rule-based reader with quoted evidence, only missing items asked; age can replace date of birth | `intake.test.ts`, E2E golden journey, gates V1–V3 |
| OTP email | Gmail app-password and Brevo SMTP steps; `scripts/deploy-hosted.sh` for the hosted project | Local Mailpit integration tests (17 passed) |
| Order on Instamart / Zepto | Instamart cart builder over the Builders Club tool flow, on a sandbox until access is granted; Instamart/Zepto checklist with search links | `instamart.test.ts`, E2E, gates M5–M7 |
| Evaluation | 25 gates incl. store carts; in-app Evaluation page | `npm run eval`: all pass |


## Quality gates (run on the final tree of this session)

| Check | Command | Result |
|---|---|---|
| Typecheck (strict) | `npm run typecheck` | Pass |
| Lint | `npm run lint` | Pass: 0 errors, 4 warnings (`any` at the integration-test boundary) |
| Unit tests | `npm test` | **60 passed** (incl. intake, Instamart cart, quick evaluation) |
| Production build | `npm run build` | Pass. Main JS 503 kB (154 kB gzip). Bundle splitting is a to-do. |
| Integration tests | `npm run test:integration` | **17 passed** against local Supabase (CLI 3.1.0, Postgres + Auth + Edge Runtime + Mailpit in Docker) |
| E2E | `npm run e2e` | **3 passed**: desktop golden journey (quick setup, Instamart sandbox order), step-by-step form, Pixel 7 mobile journey |
| Secret scan of `dist/` | grep for service-role, secret keys, SMTP passwords | None found |

## Email OTP status

- **Local Mailpit: TESTED.** A real request → branded 6-digit email in Mailpit → verify → session; wrong code rejected (`otp_expired`); second request within 60 s rejected (`over_email_send_rate_limit`); sign-out clears the session. Automated in `tests/integration/supabase.int.test.ts`.
- **Hosted custom SMTP: `BLOCKED_EXTERNAL_SETUP`.** Needs a team-owned domain, a Brevo (or similar) account approved for sending, DNS records, and the SMTP key entered in the Supabase dashboard. Steps: AUTH_AND_SMTP_SETUP.md §3.
- **Demo mode** (review preview): codes appear in a labelled on-screen inbox; nothing is emailed.

## Deployment status

- **Review preview: deployed** as a private claude.ai hosted page in demo mode: https://claude.ai/artifact/6GkSF7HcKgNfydqENX4kDQ. Built with `npm run build:preview`; smoke-tested before publishing (sign-in to Welcome with no page errors). Share it from its page to give teammates access.
- **Vercel: deployed** at https://nourishcart.vercel.app from the GitHub repo (demo mode until the Supabase variables are set).
- **Hosted Supabase project:** run `./scripts/deploy-hosted.sh <project-ref>` with the team's account.

## Release gates (PRD 17.4)

| Gate | State |
|---|---|
| A Foundation | Met locally: app runs, login works in test mode, profiles persist, RLS tests pass |
| B Nutrition | Met for the prototype: versioned, golden tests pass, energy clearly labelled provisional. Expert review still open. |
| C Planning | Met: three distinct plans, hard rules hold, totals trace to ingredient data |
| D Grocery | Met: demand, pack rounding and totals deterministic |
| E Transaction | Met: simulated only, explicit approval and confirmation, idempotent, "not purchased" receipt |
| F PWA | Partly: manifest, icons, service worker and offline handling built; Cloudflare deployment and device install not yet verified |
| G Public OTP | Blocked on external SMTP/domain setup |

## What exists

Every screen in the brief is built and wired to real state: landing, sign-in/OTP (check email, resend cooldown, errors), welcome with consent, profiles (create, rename, archive, restore, switch), 7-step onboarding with save/resume, nutrition results with method drill-down, three-plan comparison, weekly planner with servings and replacement, recipe detail, grocery demand, catalogue, basket with budget negotiation and undo, checkout review and approval, receipt, order history, pantry with replenishment, scheduled draft basket, settings (consent, export, copy JSON, delete account, install help, data sources), loading/empty/error/offline states.

## Known gaps and next work

1. **Hosted environment**: create the Supabase project, push migration + seed + functions, deploy to Cloudflare Pages, run the E2E suite against it.
2. **Hosted SMTP** (gate G).
3. **Nutrition expert review** (checklist in NUTRITION_ENGINE.md) and a licensed nutrient dataset.
4. **FR-019 local store price entry**: not built.
5. **Household basket checkout**: the household view consolidates demand with attribution; a combined order is not built.
6. **Edge Functions** cover targets, plan generation, checkout and deletion. Meal replacement and basket optimisation run client-side with RLS writes; the server re-verifies prices, approval, version and budget at checkout. A `optimise-basket` function could add server-side recomputation earlier.
7. **Bundle size**: split vendor and route chunks.
8. **Accessibility**: manual keyboard audit and axe run still to do (semantic controls and labels are in place).
9. **Swiggy Builders Club**: apply with a demo video of the sandbox flow, then add the `instamart-proxy` function (COMMERCE_ADAPTERS.md).
10. **Abuse controls** before public sign-up: Turnstile on sign-in, rate-limit review.

## Questions for the team

- Which domain (or subdomain) can we use for the sign-in sender? Does the team already own one?
- Who will create the Supabase and Cloudflare (or Vercel) accounts, and should the repo be connected for automatic preview deploys?
- Is there a nutrition professional who can review the method and sign off?
- GitHub repository URL for the first push.

## Sandbox notes (this build session only)

The local Edge Runtime container could not fetch npm packages through the sandbox's TLS proxy. The functions therefore import a vendored supabase-js bundle (`supabase/functions/_shared/vendor`), which is also fine in production. A sandbox-only CA file and env file in `supabase/functions/` are gitignored.
