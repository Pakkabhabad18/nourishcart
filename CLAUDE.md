# Working on NourishCart

Read before changing code. The PRD PDF is the product source of truth; `PRD.md` summarises it. The master build prompt sets implementation rules.

## Non-negotiables

- Nutrition maths lives only in `src/domain`. Never in React components, never in an LLM prompt.
- Do not invent coefficients, nutrient values, prices, credentials, test results or deployment URLs. Unverified methods stay `provisional_demo`.
- Unknown nutrient data is `null`, shown as unknown, never 0.
- Allergies, diet pattern and strict exclusions are hard filters (reject, never penalise).
- Never lower nutrition targets or portions silently; never exceed a hard budget without the user changing it.
- Everything commercial is simulated and labelled. No scraping, no unofficial APIs, no payment fields.
- Only the publishable/anon key in the browser. No secrets in git or `VITE_*` vars.
- No paid services, no runtime LLM with profile data.

## After editing domain or data

```bash
npm run sync:functions   # Edge Functions use a copy
npm run db:seed-sql      # if src/data changed
```

Bump versions when behaviour changes: `METHODS` in `nutrition/methods.ts`, `PLANNER_VERSION`, `OPTIMISER_CONFIG.version`, `DATA_VERSION`.

## Quality gate (every change)

```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run e2e
npm run test:integration   # with the local Supabase stack running
```

Update `BUILD_STATUS.md` with exact results. Never report a test or deployment you did not run.

## Conventions

- TypeScript strict; `.ts` extensions in imports (Deno compatibility for domain files).
- Add a store method to both `DemoStore` and `SupabaseStore`.
- After writing data, update the query cache (`setQueryData`) or refetch; do not rely on `invalidateQueries` for unmounted queries.
- UI copy: plain sentence case, active verbs, no ALL-CAPS labels, errors say what happened and how to fix it.
- Commits are made by the team members themselves; no co-author trailers.
