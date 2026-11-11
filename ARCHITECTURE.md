# Architecture

## Shape of the system

```
Browser PWA (Vite + React + TS)
  ├─ UI: src/features/*            screens, thin; no nutrition maths
  ├─ App state: src/app/*          session, active profile, query hooks
  ├─ Store interface: src/lib/store/types.ts
  │     ├─ DemoStore      localStorage + on-screen demo inbox (review previews)
  │     └─ SupabaseStore  Auth (email OTP) + PostgREST (RLS) + Edge Functions
  └─ Domain: src/domain/*          pure, deterministic engines (also run on the server)

Supabase
  ├─ Auth          email OTP; Mailpit locally, custom SMTP when hosted
  ├─ Postgres      migrations in supabase/migrations, RLS on every table
  └─ Edge Functions (Deno)
        calculate-targets, generate-plan-options, simulate-checkout, delete-account-data
        import the same domain code from supabase/functions/_shared/core

Static hosting: Cloudflare Pages (dist/). Review preview: claude.ai hosted page (dist-preview/, demo mode).
```

No always-on server, no paid API, no LLM.

## Trust boundaries

- The browser is untrusted. It only holds the publishable/anon key.
- RLS enforces ownership on every user table (`owner_user_id = auth.uid()` plus `owns_profile(profile_id)` for child tables).
- Writes that must not be faked are server-only: `calculation_runs` and `orders` have no insert policy for users; Edge Functions write them with the service role after re-validating.
- `simulate-checkout` recomputes every line from catalogue prices, checks approval, version and hard budget, and is idempotent on `checkout:<basketId>:v<version>` (a unique index).
- Edge Functions verify the JWT, cap body size at 16 KB, validate input, return the same 404 for "not yours" and "does not exist", and log only a request id and error class.

## Domain modules (`src/domain`)

| Module | Job |
|---|---|
| `nutrition/` | eligibility, energy, protein, macro policy, calculation record (see NUTRITION_ENGINE.md) |
| `recipes/aggregate.ts` | nutrient sums with unknown-aware totals and coverage |
| `diet.ts` | hard filters: diet pattern, allergens, strict exclusions, product label allergens |
| `planning/plan.ts` | three-option generator, portion fitting, evaluation, validation, scoped meal replacement |
| `grocery/demand.ts` | consolidates ingredient demand across meals/profiles, deducts each profile's pantry once |
| `grocery/optimise.ts` | best-fit pack heuristic (one or two SKUs per ingredient, bounded), match reasons |
| `grocery/negotiate.ts` | cost drivers and alternatives as patches (cheaper packs, ingredient swap, meal consolidation, optional removal, raise budget) |
| `pipeline.ts` | plan + patch → validation → demand → basket → alternatives; one place used by UI and server |
| `orders/checkout.ts` | basket and order state machines, simulated checkout, idempotency |
| `inventory/pantry.ts` | pantry updates from confirmed orders, planned consumption, replenishment ranges |
| `commerce/adapter.ts` | provider adapter contract; simulated provider; disabled placeholders |
| `persistence/mappers.ts` | row ↔ domain mapping shared by browser and functions |

## Key flows

**Plans.** `generatePlanOptions` filters recipes by hard rules, scores them with per-option weights (budget / balanced / goal), assembles 7 days by slot with repetition penalties, scales servings to the energy estimate in 0.25 steps, then nudges portions until each day is within tolerance. All three options must pass validation; otherwise the user sees reasons.

**Budget negotiation.** Each alternative is a `BasketPatch`. The UI asks `negotiate()`, which re-runs the full pipeline for every candidate patch (a few ms each) to get the exact new total and whether the plan still validates. Accepted patches are stored on the plan (`meal_plans.patch`) so they can be undone and so the week view shows what will actually be eaten.

**Checkout.** Groceries → "Review basket" saves a basket version (status REVIEW or OVER_BUDGET) → Checkout: "Approve basket" locks the version → confirm checkbox → "Place simulated order" → server re-checks and writes the order → pantry updated → receipt.

## Frontend conventions

- Routing: `BrowserRouter` by default; `VITE_ROUTER_MODE=hash` for sub-path hosting; `memory` for the sandboxed review preview.
- Data: TanStack Query; keys scoped per profile (`src/app/hooks.ts`). Query cache is cleared on sign-out.
- Forms: per-step validation (Zod for numeric ranges) with field-level messages; onboarding saves on each step.
- Accessibility: native controls, labelled fields, `role=alert` errors, skip link, visible focus, 44 px targets, reduced motion respected, `<dialog>` sheets.
- Offline: banner; all mutating buttons disabled; checkout blocked; service worker caches only the static shell.
- Design tokens: `tailwind.config.js` (PRD 11.1 palette, Inter). The `RangeBar` component shows every estimate as a band with reference ticks.

## Environments

| | Store | Auth email | Hosting |
|---|---|---|---|
| Review preview | DemoStore | on-screen demo inbox | claude.ai hosted page (private until shared) |
| Local full stack | SupabaseStore | Mailpit | `npm run dev` |
| Hosted pilot | SupabaseStore | custom SMTP | Cloudflare Pages + Supabase Free |

## Deployment (Cloudflare Pages)

1. Supabase: create a project (Free). Link and push: `npx supabase link --project-ref <ref>`, `npx supabase db push`, then run `supabase/seed.sql` in the SQL editor, then `npx supabase functions deploy`.
2. Cloudflare Pages: connect the GitHub repo. Build command `npm ci && npm run build`, output `dist`, env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. `public/_redirects` handles SPA routes.
3. In Supabase Auth, set Site URL and Redirect URLs to the `*.pages.dev` URL. Configure custom SMTP (AUTH_AND_SMTP_SETUP.md).

Vercel works the same way (`vercel.json` included): framework Vite, output `dist`, same two env vars.
