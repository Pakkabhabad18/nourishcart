# Evaluation report

Generated 2026-11-13T21:36:25.103Z (full run). Result: **all gates passed**.

Versions: personalTargets `personal-targets-1.0.0`, conversation `conversation-1.0.0`, planner `planner-1.0.0`, optimiser `optimiser-1.0.0`, extractor `rules-1.0.0`, matcher `matcher-1.0.0`, data `sample-foods-1.0.0+recipes-1.0.0+catalogue-2026-11-11`, energyMethod `energy.fao2004_schofield_pal@1.0.0`.

How the suite works and why each gate exists: see [EVALUATION.md](EVALUATION.md).

## Gates

| Gate | Check | Measured | Threshold | Result |
|---|---|---|---|---|
| S1 (critical) | No food outside the person’s diet pattern (e.g. egg for a vegetarian) | 0 in 28,581 meals (95% upper bound 0.01%) | 0 | Pass |
| S2 (critical) | No allergen the person declared | 0 in 28,581 meals | 0 | Pass |
| S3 (critical) | No strictly excluded food | 0 in 28,581 meals | 0 | Pass |
| S4 (critical) | No basket product that breaks diet or allergy rules (incl. label allergens, out of stock) | 0 in 1152 baskets | 0 | Pass |
| S5 (critical) | Budget alternatives keep every rule and keep the plan valid | 0 broken of 2193 applied | 0 | Pass |
| N1 | Each day within ±10% of the energy estimate (independent recount) | 8064/8064 days (100.0%) | 100% | Pass |
| N2 | Each day meets the protein planning floor (EAR) | 8064/8064 days | 100% | Pass |
| N3 | App nutrition totals agree with the independent recount (±1 kcal) | 0 mismatches | 0 | Pass |
| N4 (critical) | Missing nutrient data never shown as complete | 0 cases | 0 | Pass |
| G1 | Basket covers every ingredient need and totals add up | 0 failures | 0 | Pass |
| G2 (critical) | Over-budget baskets are always flagged (hard budget never silently exceeded) | 0 errors | 0 | Pass |
| R1 | Same input gives the same plans | 0/38 reruns differed | 0 | Pass |
| R2 | Plan options are never duplicates; fewer than three is explained | 0 duplicates; 0 profiles shown fewer options with a reason | 0 duplicates | Pass |
| R3 | When no safe plan exists, the reason is shown (rules never relaxed) | 0 silent failures; 0 explained refusals | 0 silent | Pass |
| C1 (critical) | Minors, pregnancy and clinical cases get no personal targets | 11/11 refused | 100% | Pass |
| V1 (critical) | No unsafe misreading (diet too lenient, allergy or condition missed, “none” invented) | 0 in 40 descriptions | 0 | Pass |
| V2 | Field precision (filled values that are right) | 99.3% | ≥ 95% | Pass |
| V3 | Field recall (stated values that were captured; the rest are asked) | 99.7% | ≥ 85% | Pass |
| V4 (critical) | No unsafe misreading on held-out descriptions (never used to tune the reader) | 0 in 27; recall 65.5% (missed details are asked) | 0 | Pass |
| M1 (critical) | No egg/meat/fish/allergen marker missed in a product title | 0 in 72 titles | 0 | Pass |
| M2 | Precision when a product is mapped | 100.0% | ≥ 95% | Pass |
| M3 | Processed/different products correctly left unmapped | 100.0% | ≥ 90% | Pass |
| M4 | Pack size read correctly | 52/52 | ≥ 95% | Pass |
| M5 (critical) | Store carts contain nothing that breaks the person’s rules (checked against hand labels) | 0 of 7,852 items in 384 carts | 0 | Pass |
| M6 | Store cart items are the right product and enough of it | 0 wrong, 0 short | 0 | Pass |
| M7 | Basket lines placed in the store cart (the rest are listed for the person to add) | 95.3% | ≥ 80% | Pass |
| A1 (critical) | No invented product or planted price survives the page checks (simulated fooled AI answers) | 0 of 54 fake readings kept | 0 | Pass |
| A2 | Genuine product cards are kept by the page checks | 43/43 | 100% | Pass |
| A3 (critical) | No chosen product breaks diet or allergy rules (hand labels, every diet x allergy set) | 0 of 410 picks | 0 | Pass |
| A4 | Chosen product and pack count are the cheapest way to cover the need (brute force) | 0 of 480 differ | 0 | Pass |
| T1 (critical) | Calories never below the floor (sex floor or resting energy) or past the 20% cut / 15% surplus caps, whatever is typed | 0 of 720 targets | 0 | Pass |
| T2 (critical) | Protein target never below the EAR floor or above 2 g/kg | 0 of 720 targets | 0 | Pass |
| T3 | Plans made for a goal still pass every day's calorie and protein checks | 180/180 plans, 0 people without a plan | 100% | Pass |
| T4 | "Best for your goal" reaches at least 90% of the protein target | 91.7% | ≥ 75% | Pass |
| T5 | Asking for more iron or calcium raises it in the plan (same person, with vs without) | iron 30/30, +16.3%; calcium 29/30, +20.3% | ≥ 80% raised | Pass |
| V5 (critical) | Setup conversation: no stated allergy lost, no false "no allergies", every doctor-managed condition out of scope | 0 in 24 conversations | 0 | Pass |
| V6 | Setup conversation: fields correct (14 per person) | 100.0% dev; held-out first run 71.4% | ≥ 95% dev | Pass |
| V7 | Setup conversation finished without tap-to-answer help | 16/16 dev; held-out first run 3/8 | ≥ 90% dev | Pass |
| L1 (critical) | Ingredient word lists find exactly the hand-labelled allergens and animal ingredients | 24/24 labels exact | 100% | Pass |
| L2 (critical) | An unreadable or cut-off label never says "fine" for anyone | 0 of 264 | 0 | Pass |

## Recommendations

384 synthetic users (every combination of 4 diet patterns × 8 allergy sets × 4 exclusion sets, 3 random bodies/activities/goals/budgets each).

| Measure | Value |
|---|---|
| Users with a safe plan | 384 |
| Users told no safe plan exists (with reason) | 0 |
| Plans checked | 1152 |
| Meals checked | 28581 |
| Baskets checked | 1152 |
| Budget alternatives applied and re-checked | 2193 |
| Users shown fewer than 3 options (explained) | 0 |

| Diet | Users | With plan | Violations |
|---|---|---|---|
| vegan | 12 | 12 | 0 |
| vegetarian | 76 | 76 | 0 |
| eggetarian | 17 | 17 | 0 |
| non_vegetarian | 279 | 279 | 0 |

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

### Held-out descriptions

27 descriptions written after the rule reader was finished and never used to tune it. Precision 93.1%, recall 65.5%, F1 76.9%. Critical errors: **0**. The drop in recall from the development set shows the rules are tuned to phrasing they have seen; missed details are asked as follow-up questions, so they cost time, not safety. This gap is what the AI reader is for (see EVALUATION.md, section 5).

## Store product matching

72 labelled product titles. Accuracy 100.0%, precision when mapped 100.0%, correct refusals 19/19, pack sizes 52/52, safety markers missed 0/27, false alarms 0.

## Store cart (Instamart sandbox)

One sandbox Instamart cart per person (384 carts, 8236 basket lines). The sandbox sells our catalogue plus every labelled look-alike title, including traps. Each item placed is checked against hand labels, not the matcher. Items placed 7852 (95.3% of lines), left for the person 384, unsafe 0, wrong product 0, short quantity 0.

## Shopping agent (price comparison)

Saved Zepto and Instamart search pages (real, labelled by hand) plus pages with planted text. Fooled-AI readings that survived the page checks: **0 of 54**. Genuine cards wrongly rejected: 0 of 43. Unsafe products chosen across every diet and allergy set: **0 of 410**. Picks that differ from a brute-force cheapest: 0 of 480. The live AI reader is scored separately (`npm run eval:listings`).

## Label scan

24 test labels. Word lists matched the hand-labelled facts on 24/24. Unreadable labels that still said "fine" for someone: **0 of 264**. The live photo path is scored separately (`npm run eval:labels`).
