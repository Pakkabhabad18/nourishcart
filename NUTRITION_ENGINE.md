# Nutrition engine

Code: `src/domain/nutrition/`. Pure TypeScript, no UI, no network. The same files run in the browser (demo mode) and in Edge Functions (`supabase/functions/_shared/core`, synced by `npm run sync:functions`).

Scope: healthy adults aged 18+. General wellness planning, not diagnosis or treatment.

## Status in one line

Energy is a **provisional demo method** (published FAO/WHO/UNU equations, not the ICMR-NIN 2020 adult BMR method). Protein uses the ICMR-NIN 2020 EAR for planning. No macro targets are set. Nutrient data is illustrative sample data. **Nothing here has been reviewed by a qualified nutrition professional yet.**

## Pipeline

```
ProfileBundle
  -> validateProfileForNutrition()   eligible | incomplete | out_of_scope
  -> estimateEnergyRequirement()     BMR × PAL, point + range
  -> estimateProteinRequirement()    EAR (plan floor), RDA and cereal-diet note (context)
  -> estimateMacroRanges()           not_configured (by design)
  -> calculateTargets()              immutable CalculationRecord with method ids and limitations
```

## 1. Eligibility (`eligibility.ts`)

Rejects missing or impossible input; never fills in a default.

| Check | Rule |
|---|---|
| Date of birth | required; age in completed years; under 18 → out of scope |
| Height | required, 120–230 cm (typo guard, not a health judgement) |
| Weight | required, 30–250 kg |
| Body-type input | required; "prefer not to say" allowed (neutral range path) |
| Occupation, everyday movement | required |
| Exercise intensity | required when workouts per week > 0 |
| Allergies | the user must select allergies or explicitly confirm none; blank is not "none" |
| Health scope | pregnancy, lactation, eating disorder, kidney disease, diabetes needing a clinical diet, recent bariatric surgery or another medically managed diet → out of scope with a referral message. Only the scope status is stored, never the condition. |

## 2. Energy (`energy.ts`, `methods.ts`)

`TEE = BMR × PAL` (the ICMR-NIN 2020 framing).

**BMR**: Schofield equations as used in FAO/WHO/UNU (2004) *Human energy requirements*, Table 5.2, kcal/day, W in kg. Checked against https://www.fao.org/3/y5686e/y5686e07.htm on 11 Nov 2026.

| Age | Male | Female |
|---|---|---|
| 18–29 | 15.057 W + 692.2 | 14.818 W + 486.6 |
| 30–59 | 11.472 W + 873.1 | 8.126 W + 845.6 |
| 60+ | 11.711 W + 587.7 | 9.082 W + 658.5 |

**PAL** = occupation anchor + everyday movement + exercise increment, capped at 2.40 (FAO Table 5.3 says higher values are hard to sustain).

| Input | Values | Basis |
|---|---|---|
| Occupation anchor | sedentary 1.40, light 1.55, moderate 1.75, heavy 2.05 | 1.40 is the sedentary PAL ICMR-NIN 2020 adopted. Others are product choices inside FAO bands (1.40–1.69, 1.70–1.99, 2.00–2.40). |
| Movement | low +0, medium +0.05, high +0.10 | Product assumption |
| Exercise | hours/day × (PAR − 1) / 24, PAR light 3, moderate 4.5, vigorous 6.5 | Product assumption (factorial approach) |

So a desk worker who trains three times a week stays "sedentary or light": gym frequency alone never sets the class.

**Range shown to the user**: point × 0.88 to point × 1.10. The lower bound reflects the ICMR-NIN note that some international equations overestimate Indian BMR by 10–12%. We do **not** apply a blanket correction to the point estimate (PRD 7.3 gate).

"Prefer not to say": both equations are computed; the planning value is their midpoint and the range spans both. Confidence is "low".

**ICMR-NIN 2020 reference context** is shown alongside but never used as the target: reference man 65 kg (2,110 / 2,710 / 3,470 kcal for sedentary / moderate / heavy work), reference woman 55 kg (1,660 / 2,130 / 2,720).

**Goal adjustment**: always 0. Weight management stays near maintenance and shows a professional-review notice. No deficits, surpluses or rapid-loss promises.

## 3. Protein (`protein.ts`)

| Field | Value | Use |
|---|---|---|
| `earG` | 0.66 g/kg/day | Planning floor: every day of every plan must reach it |
| `rdaG` | 0.83 g/kg/day | Context only (assumes high-quality protein) |
| `cerealBasedContextG` | 1.0 g/kg/day | Context only; not a "vegetarian multiplier" |

Actual body weight is used. Muscle/fitness goals change food choice (more protein per kcal) but **no sports-performance target** is applied.

TUL is not used anywhere as a target. No TUL values are stored yet.

## 4. Macros

`estimateMacroRanges()` returns `not_configured`. Plans report carbs, fat and fibre they contain, but no split is prescribed until a reviewed policy exists (PRD 7.4).

## 5. Recipe aggregation (`src/domain/recipes/aggregate.ts`)

```
total = Σ amount_g × value_per_100g / 100 × retention_factor
```

- Pieces convert to grams only through `gramsPerPiece` (egg 50 g, banana 118 g).
- A nutrient with no value for an ingredient is **unknown**, never zero. The total is then "partial" (shown as ≥) with the known share; if no ingredient has a value, "Not available".
- Macronutrients use no retention factor. Micronutrients without a retention factor are flagged approximate (≈). The sample recipe set has no retention factors, so iron and calcium are always ≈.

## 6. Plan validation (`src/domain/planning/plan.ts`)

A plan is valid only if every meal passes the diet/allergy/exclusion filter and every day has energy within ±10% of the planning estimate and protein ≥ EAR. If no valid plan exists, the user gets the reasons; rules are never relaxed.

## 7. Calculation record

Every result stores: calculator id and version, method status, input snapshot, equation id, coefficient set id, activity mapping id, BMR, PAL breakdown, TEE, range, goal adjustment, protein references, BMI (context only), confidence, sources, `reviewedBy: null`, limitations and disclaimers. Records are immutable (`calculation_runs` has no update policy) and written only by Edge Functions in Supabase mode.

## 8. Tests

`src/domain/__tests__/nutrition.test.ts` covers unit conversions, validation (missing, impossible, minors, clinical scope, blank allergies), the Schofield coefficients, PAL mapping and cap, determinism, the neutral path, EAR/RDA separation and the ineligible path. `planning.test.ts` covers aggregation, missing data and plan validation.

## 9. Expert review checklist (before any public advice)

- [ ] Extract the ICMR-NIN 2020 adult BMR method (equations, coefficients, age bands) from the full report and replace or confirm `energy.fao2004_schofield_pal`.
- [ ] Review the PAL anchors, movement adjustment and exercise PAR values against Indian activity data.
- [ ] Confirm the display range (−12% / +10%) wording.
- [ ] Decide a reviewed fat / essential-fatty-acid policy before showing macro targets.
- [ ] Decide whether and how protein quality affects planning for cereal-based diets.
- [ ] Define a sports-nutrition policy (or confirm none) for the muscle/fitness goal.
- [ ] Replace sample food values with a licensed dataset (see `DATA_SOURCES_AND_LICENSES.md`), add retention factors, and re-run golden tests.
- [ ] Add micronutrient EAR/RDA/TUL references with citations if coverage is to be judged.
- [ ] Review scope-exclusion wording and referral text.
- [ ] Record reviewer name and date in `methods.ts` (`reviewedBy`) and bump the method version.
