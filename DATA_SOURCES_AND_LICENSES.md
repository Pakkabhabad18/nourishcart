# Data sources and licences

The register lives in code at `src/data/sources.ts` and is seeded into `data_sources`. Every food, recipe and product points at a source id. No external dataset is imported without an entry marked `permitted`.

| Source id | What | Licence / permission | Status in the app |
|---|---|---|---|
| `SAMPLE_FOODS_V1` | 47 ingredients with rounded per-100 g values | Internal sample data | **Used.** Labelled "Sample values – not for dietary prescription". Not verified against IFCT or INDB. Some values deliberately unknown. |
| `SAMPLE_RECIPES_V1` | 38 home-style recipes (South Indian, Hyderabadi/Telangana, North Indian, pan-Indian) | Internal sample data | **Used.** Typical home portions; no retention factors. |
| `SIMULATED_CATALOGUE_V1` | 90 products, fictional brands, illustrative INR prices dated 11 Nov 2026 | Internal simulated data | **Used.** Labelled simulated everywhere. Not retailer data. |
| `ICMR_NIN_2020_BRIEF` | ICMR-NIN brief note on RDA/EAR 2020 | Values cited with attribution; tables not reproduced | **Cited** for protein EAR/RDA, TEE = BMR × PAL, sedentary PAL 1.40 and reference energy rows. |
| `FAO_2004_ENERGY` | FAO/WHO/UNU Human energy requirements (2004) | Equations cited with attribution | **Cited** for Schofield BMR equations and PAL bands. |
| `IFCT_2017` | Indian Food Composition Tables 2017 | Written permission needed for electronic/product use | **Not imported.** Pending NIN permission. |
| `INDB_2024` | Indian Nutrient Databank paper and files | Paper CC BY; repository file licences not yet inspected | **Not imported.** Candidate once file licences are checked. |
| ICMR-NIN Dietary Guidelines 2024 | Food-based guidance | Product use requires prior written permission | Not reproduced. |

## Rules

- Missing values stay `null` (unknown). The UI shows "Not available" or ≥ for partial totals.
- Sample values are never shown as verified (`verified: false`, confidence `low`).
- Before replacing sample data: inspect each file's licence, keep attribution, record permission in the register, bump the data version (`DATA_VERSION` in `persistence/mappers.ts`) and re-run the golden tests.
- No scraping of IFCT/NIN pages or retailer sites.

## Third-party code

| Package | Licence |
|---|---|
| React, React Router, TanStack Query, Zod, lucide-react, clsx, Tailwind CSS, Vite, vite-plugin-pwa, Vitest, Playwright | MIT / ISC (Lucide) |
| @supabase/supabase-js (also vendored into `supabase/functions/_shared/vendor`) | MIT |
| Inter (via @fontsource-variable/inter) | SIL Open Font License 1.1 |
