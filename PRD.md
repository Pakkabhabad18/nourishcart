# PRD summary

Summary of `NourishCart_Technical_PRD.pdf` (v2.0, 11 Nov 2026). **The PDF is authoritative**; this file is for quick reference.

## Product

A consumer wellness and commerce assistant. Loop: understand the person → reference targets → three feasible plans → schedule meals → ingredient demand → match products → optimise basket → approval → simulated checkout → pantry → replenishment. Not a calorie counter, medical diet tool or marketplace.

## Locked decisions

PWA (Vite + React + TS + Tailwind), Cloudflare Pages, Supabase Free (Auth, Postgres, RLS, Edge Functions), email OTP only, one account with many adult profiles, personal budget per profile with optional household consolidation, simulated commerce first, ₹0-first, no paid runtime LLM and no unpaid LLM receiving profile data, deterministic versioned nutrition engine. Open gate: licensed data and qualified nutrition review before public advice.

## Users

Healthy adults 18+: students on a budget, working professionals, gym-goers, household organisers. Goals: general, muscle/fitness, weight management, budget-first (budget is a constraint, not a health goal).

## Non-goals (MVP)

Diagnosis or treatment, minors, pregnancy/lactation/clinical pathways, live payments or unattended orders, scraping, live inventory guarantees, wearables, photo recognition, barcode scanning, native apps, unpaid LLM calls with personal data.

## Functional requirements

| ID | Requirement | Where implemented |
|---|---|---|
| FR-001 | Email OTP only; throttled resend; safe errors; session; logout | `features/auth`, `lib/store/*` |
| FR-002 | Many profiles per account; RLS isolation | `features/profiles`, migration |
| FR-003 | 18+ healthy adults; scope message otherwise | `nutrition/eligibility.ts` |
| FR-004/005 | Onboarding with save/resume; activity beyond gym frequency | `features/onboarding` |
| FR-006 | Deterministic, versioned, sourced calculations | `domain/nutrition` |
| FR-007/008 | Three distinct plans; comparison without unexplained "best" | `planning/plan.ts`, `PlansPage` |
| FR-009/010 | Weekly schedule; scoped meal replacement | `PlansPage` |
| FR-011 | Demand consolidation, explicit units, pantry deducted once | `grocery/demand.ts` |
| FR-012/013 | Simulated catalogue; hard-filtered product match with reasons | `data/catalogue.ts`, `grocery/optimise.ts` |
| FR-014/015 | Basket optimisation; budget negotiation | `grocery/optimise.ts`, `grocery/negotiate.ts` |
| FR-016 | Explicit-confirm simulated checkout with "SIMULATED – NOT PURCHASED" label | `orders/checkout.ts`, `CheckoutPage` |
| FR-017/018 | Pantry; replenishment ranges; no automatic orders | `inventory/pantry.ts`, `PantryPage` |
| FR-019 | Local store price entry | Not built yet |
| FR-020 | Provider abstraction | `commerce/adapter.ts` |
| FR-021 | Consent and deletion | `SettingsPage`, `delete-account-data` |
| FR-022 | Installable PWA, offline shell | `vite.config.ts`, `lib/pwa.ts` |
| FR-023 | Accessibility | throughout |
| FR-024 | No paid service by default | `FREE_TIER_LIMITS.md` |

## Nutrition rules (PRD 7)

TEE = BMR × PAL; do not guess the ICMR equation; show ICMR adult reference rows as context. Protein EAR 0.66 g/kg for planning, RDA 0.83 g/kg as context, 1.0 g/kg cereal-diet note as context; no sports target. No universal macro split. EAR/RDA/TUL never interchangeable. Missing data is unknown. Recipe totals from ingredients with retention factors where available.

## Golden demo (PRD 17.3)

26-year-old, desk job, moderate walking, 3 workouts/week, eggetarian, one strict exclusion, ₹1,500 weekly budget → three plans → select → change lunch → rebuild groceries → over budget → accept two alternatives → under budget → simulated checkout → receipt marked not purchased → pantry stock. Automated in `e2e/golden.spec.ts` and `grocery.test.ts`.

## Release gates

A Foundation · B Nutrition · C Planning · D Grocery · E Transaction · F PWA deployment · G Public OTP. Current status per gate is in BUILD_STATUS.md.
