# NourishCart

Personal nutrition, meal planning and grocery planning for Indian homes, as an installable web app (PWA). Starting with Hyderabad.

One account plans for several adults. For each person, NourishCart estimates energy and protein needs, offers three meal plans (Budget Optimised, Balanced, Goal Aligned), turns the chosen week into a grocery basket sized to real pack sizes and the pantry, helps bring it under budget, and records a **simulated** order after explicit approval. No real purchase or payment happens in this version.

**Review preview (demo mode):** https://claude.ai/artifact/6GkSF7HcKgNfydqENX4kDQ
It is private to the owner until shared from its page. Data stays in the reviewer's browser and sign-in codes appear on screen.

## Status

Working end to end in demo mode and against a local Supabase stack. See [BUILD_STATUS.md](BUILD_STATUS.md) for what was tested, what is blocked and what is next.

| Area | State |
|---|---|
| Email OTP sign-in | Working locally with Supabase + Mailpit (tested). Hosted SMTP blocked on a team-owned domain. |
| Profiles, onboarding, nutrition estimates | Working. Energy method is provisional and unreviewed. |
| Three plans, weekly planner, meal replacement | Working |
| Groceries, budget negotiation, simulated checkout, orders | Working |
| Pantry, replenishment, scheduled draft basket | Working |
| Live retailers | Not connected by design (simulated catalogue) |

## Run it

### Demo mode (no backend)

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

With no Supabase env vars, the app uses browser storage and a labelled on-screen inbox for codes.

### Full local stack (Supabase + Mailpit)

Needs Docker.

```bash
npm install
npm run sb:start                 # Postgres, Auth, Edge Runtime, Mailpit
npx supabase functions serve     # second terminal
npx supabase status              # copy API URL + publishable key
```

Create `.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<publishable key>
```

`npm run dev`, sign in, and read the code at http://127.0.0.1:54324 (Mailpit). Full guide: [AUTH_AND_SMTP_SETUP.md](AUTH_AND_SMTP_SETUP.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` (Cloudflare Pages / Vercel) |
| `npm run build:preview` | Demo-mode build for sandboxed review hosting (`dist-preview/`) |
| `npm run typecheck` / `npm run lint` | TypeScript strict / ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | Auth, RLS and Edge Function tests against the local stack |
| `npm run e2e` | Playwright golden journey + mobile layout (demo mode, needs `npm run build` first) |
| `npm run sync:functions` | Copy `src/domain` + `src/data` into Edge Functions after editing them |
| `npm run db:seed-sql` | Regenerate `supabase/seed.sql` from `src/data` |
| `npm run sb:start` / `sb:stop` / `sb:reset` | Local Supabase stack |

## Project layout

```
src/
  domain/        pure engines: nutrition, planning, grocery, orders, pantry, commerce adapters
  data/          sample foods, recipes, simulated catalogue, source register
  lib/store/     DemoStore and SupabaseStore behind one interface
  app/           router, shell, session/profile context, query hooks
  features/      screens (auth, profiles, onboarding, nutrition, meal-plans, groceries, orders, pantry, settings, overview)
  components/    UI kit, including the RangeBar estimate visual
supabase/
  migrations/    schema + RLS
  functions/     calculate-targets, generate-plan-options, simulate-checkout, delete-account-data
  templates/     OTP email
tests/integration/   local-stack tests
e2e/                 Playwright tests
```

## Documents

[PRD.md](PRD.md) (summary; the PDF is authoritative) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATABASE.md](DATABASE.md) · [NUTRITION_ENGINE.md](NUTRITION_ENGINE.md) · [DATA_SOURCES_AND_LICENSES.md](DATA_SOURCES_AND_LICENSES.md) · [COMMERCE_ADAPTERS.md](COMMERCE_ADAPTERS.md) · [AUTH_AND_SMTP_SETUP.md](AUTH_AND_SMTP_SETUP.md) · [FREE_TIER_LIMITS.md](FREE_TIER_LIMITS.md) · [DECISIONS.md](DECISIONS.md) · [BUILD_STATUS.md](BUILD_STATUS.md) · [CLAUDE.md](CLAUDE.md)

## Important limits

- General wellness for healthy adults 18+. Not medical advice.
- Nutrition values are illustrative sample data, not verified facts.
- Products, prices and orders are simulated.
- ₹0 recurring cost on free tiers; email OTP volume is the main constraint (see FREE_TIER_LIMITS.md).
