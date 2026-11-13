# Evaluation report

Generated 2026-11-13T08:25:15.142Z (full run). Result: **all gates passed**.

Versions: planner `planner-1.0.0`, optimiser `optimiser-1.0.0`, extractor `rules-1.0.0`, matcher `matcher-1.0.0`, data `sample-foods-1.0.0+recipes-1.0.0+catalogue-2026-11-11`, energyMethod `energy.fao2004_schofield_pal@1.0.0`.

How the suite works and why each gate exists: see [EVALUATION.md](EVALUATION.md).

## Gates

| Gate | Check | Measured | Threshold | Result |
|---|---|---|---|---|
| S1 (critical) | No food outside the person’s diet pattern (e.g. egg for a vegetarian) | 0 in 28,021 meals (95% upper bound 0.01%) | 0 | Pass |
| S2 (critical) | No allergen the person declared | 0 in 28,021 meals | 0 | Pass |
| S3 (critical) | No strictly excluded food | 0 in 28,021 meals | 0 | Pass |
| S4 (critical) | No basket product that breaks diet or allergy rules (incl. label allergens, out of stock) | 0 in 1143 baskets | 0 | Pass |
| S5 (critical) | Budget alternatives keep every rule and keep the plan valid | 0 broken of 2180 applied | 0 | Pass |
| N1 | Each day within ±10% of the energy estimate (independent recount) | 8001/8001 days (100.0%) | 100% | Pass |
| N2 | Each day meets the protein planning floor (EAR) | 8001/8001 days | 100% | Pass |
| N3 | App nutrition totals agree with the independent recount (±1 kcal) | 0 mismatches | 0 | Pass |
| N4 (critical) | Missing nutrient data never shown as complete | 0 cases | 0 | Pass |
| G1 | Basket covers every ingredient need and totals add up | 0 failures | 0 | Pass |
| G2 (critical) | Over-budget baskets are always flagged (hard budget never silently exceeded) | 0 errors | 0 | Pass |
| R1 | Same input gives the same plans | 0/38 reruns differed | 0 | Pass |
| R2 | Plan options are never duplicates; fewer than three is explained | 0 duplicates; 7 profiles shown fewer options with a reason | 0 duplicates | Pass |
| R3 | When no safe plan exists, the reason is shown (rules never relaxed) | 0 silent failures; 0 explained refusals | 0 silent | Pass |
| C1 (critical) | Minors, pregnancy and clinical cases get no personal targets | 11/11 refused | 100% | Pass |
| V1 (critical) | No unsafe misreading (diet too lenient, allergy or condition missed, “none” invented) | 0 in 40 descriptions | 0 | Pass |
| V2 | Field precision (filled values that are right) | 99.3% | ≥ 95% | Pass |
| V3 | Field recall (stated values that were captured; the rest are asked) | 99.7% | ≥ 85% | Pass |
| M1 (critical) | No egg/meat/fish/allergen marker missed in a product title | 0 in 72 titles | 0 | Pass |
| M2 | Precision when a product is mapped | 100.0% | ≥ 95% | Pass |
| M3 | Processed/different products correctly left unmapped | 100.0% | ≥ 90% | Pass |
| M4 | Pack size read correctly | 52/52 | ≥ 95% | Pass |

## Recommendations

384 synthetic users (every combination of 4 diet patterns × 8 allergy sets × 4 exclusion sets, 3 random bodies/activities/goals/budgets each).

| Measure | Value |
|---|---|
| Users with a safe plan | 384 |
| Users told no safe plan exists (with reason) | 0 |
| Plans checked | 1143 |
| Meals checked | 28021 |
| Baskets checked | 1143 |
| Budget alternatives applied and re-checked | 2180 |
| Users shown fewer than 3 options (explained) | 7 |

| Diet | Users | With plan | Violations |
|---|---|---|---|
| vegan | 96 | 96 | 0 |
| vegetarian | 96 | 96 | 0 |
| eggetarian | 96 | 96 | 0 |
| non_vegetarian | 96 | 96 | 0 |

Out-of-scope check: 11/11 refused (minors, pregnancy, lactation, eating disorder, kidney disease, clinical diabetes diet, bariatric surgery, other medical condition, missing weight, blank allergy answer).

## Voice and text intake

40 labelled descriptions (typed, spoken without punctuation, Hinglish, adversarial).

Overall precision 99.3%, recall 99.7%, F1 99.5%. Critical errors: **0**. Safe over-restrictions: 2.

| Field | Correct | Missed (asked later) | Wrong | Invented | Precision | Recall |
|---|---|---|---|---|---|---|
| ageYears | 37 | 0 | 0 | 0 | 100.0% | 100.0% |
| sex | 38 | 0 | 0 | 0 | 100.0% | 100.0% |
| heightCm | 38 | 0 | 0 | 0 | 100.0% | 100.0% |
| weightKg | 38 | 0 | 0 | 0 | 100.0% | 100.0% |
| occupation | 13 | 0 | 0 | 0 | 100.0% | 100.0% |
| movement | 5 | 0 | 0 | 0 | 100.0% | 100.0% |
| workoutsPerWeek | 7 | 0 | 0 | 0 | 100.0% | 100.0% |
| workoutMinutes | 5 | 0 | 0 | 0 | 100.0% | 100.0% |
| intensity | 4 | 0 | 0 | 0 | 100.0% | 100.0% |
| dietPattern | 37 | 0 | 1 | 0 | 97.4% | 97.4% |
| allergies | 7 | 0 | 0 | 1 | 87.5% | 100.0% |
| noAllergies | 6 | 0 | 0 | 0 | 100.0% | 100.0% |
| hardExclusions | 4 | 0 | 0 | 0 | 100.0% | 100.0% |
| goal | 16 | 0 | 0 | 0 | 100.0% | 100.0% |
| budgetInr | 11 | 0 | 0 | 0 | 100.0% | 100.0% |
| budgetPeriod | 11 | 0 | 0 | 0 | 100.0% | 100.0% |
| clinicalFlags | 5 | 0 | 0 | 0 | 100.0% | 100.0% |
| noClinical | 5 | 0 | 0 | 0 | 100.0% | 100.0% |

Cases with errors:

- `u29-other-person` (adversarial): wrong dietPattern (got "vegetarian", expected "non_vegetarian"); hallucinated allergies (got ["peanut"], expected undefined). Safe over-restriction: diet read as vegetarian, stated non_vegetarian; extra allergy: peanut

## Store product matching

72 labelled product titles. Accuracy 100.0%, precision when mapped 100.0%, correct refusals 19/19, pack sizes 52/52, safety markers missed 0/27, false alarms 0.
