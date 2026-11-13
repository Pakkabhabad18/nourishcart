// Renders the evaluation report as Markdown (EVALUATION_REPORT.md).
import type { EvalReport } from './report.ts';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function renderMarkdown(r: EvalReport): string {
  const rec = r.recommendation;
  const ex = r.extraction;
  const mt = r.matching;
  const lines: string[] = [];
  lines.push('# Evaluation report', '');
  lines.push(`Generated ${r.generatedAt} (${r.mode} run). Result: **${r.passed ? 'all gates passed' : 'some gates failed'}**.`, '');
  lines.push('Versions: ' + Object.entries(r.versions).map(([k, v]) => `${k} \`${v}\``).join(', ') + '.', '');
  lines.push('How the suite works and why each gate exists: see [EVALUATION.md](EVALUATION.md).', '');
  lines.push('## Gates', '', '| Gate | Check | Measured | Threshold | Result |', '|---|---|---|---|---|');
  for (const g of r.gates) lines.push(`| ${g.id}${g.critical ? ' (critical)' : ''} | ${g.name} | ${g.measured} | ${g.threshold} | ${g.pass ? 'Pass' : '**Fail**'} |`);
  lines.push('', '## Recommendations', '');
  lines.push(`${rec.profiles} synthetic users (every combination of 4 diet patterns × 8 allergy sets × 4 exclusion sets, 3 random bodies/activities/goals/budgets each).`, '');
  lines.push('| Measure | Value |', '|---|---|');
  lines.push(`| Users with a safe plan | ${rec.feasible} |`, `| Users told no safe plan exists (with reason) | ${rec.infeasibleWithReasons} |`, `| Plans checked | ${rec.plansChecked} |`, `| Meals checked | ${rec.mealsChecked} |`, `| Baskets checked | ${rec.basketsChecked} |`, `| Budget alternatives applied and re-checked | ${rec.alternativesChecked} |`, `| Users shown fewer than 3 options (explained) | ${rec.fewerOptionsExplained} |`);
  lines.push('', '| Diet | Users | With plan | Violations |', '|---|---|---|---|');
  for (const [d, v] of Object.entries(rec.byDiet)) lines.push(`| ${d} | ${v.profiles} | ${v.feasible} | ${v.violations} |`);
  lines.push('', `Out-of-scope check: ${rec.outOfScope.correctlyRefused}/${rec.outOfScope.total} refused (minors, pregnancy, lactation, eating disorder, kidney disease, clinical diabetes diet, bariatric surgery, other medical condition, missing weight, blank allergy answer).`);
  lines.push('', '## Voice and text intake', '');
  lines.push(`${ex.cases} labelled descriptions (typed, spoken without punctuation, Hinglish, adversarial).`, '');
  lines.push(`Overall precision ${pct(ex.overall.precision)}, recall ${pct(ex.overall.recall)}, F1 ${pct(ex.overall.f1)}. Critical errors: **${ex.criticalErrors}**. Safe over-restrictions: ${ex.safeOverRestrictions}.`, '');
  lines.push('| Field | Correct | Missed (asked later) | Wrong | Invented | Precision | Recall |', '|---|---|---|---|---|---|---|');
  for (const [f, s] of Object.entries(ex.fields)) if (s.correct + s.missed + s.wrong + s.hallucinated > 0) lines.push(`| ${f} | ${s.correct} | ${s.missed} | ${s.wrong} | ${s.hallucinated} | ${pct(s.precision)} | ${pct(s.recall)} |`);
  const errs = ex.perCase.filter((c) => c.errors.length || c.critical.length);
  if (errs.length) {
    lines.push('', 'Cases with errors:', '');
    for (const c of errs) lines.push(`- \`${c.id}\` (${c.style}): ${c.errors.map((e) => `${e.kind} ${e.field} (got ${JSON.stringify(e.got)}, expected ${JSON.stringify(e.expected)})`).join('; ')}${c.critical.length ? `. **Critical:** ${c.critical.join('; ')}` : ''}${c.safeOverRestriction.length ? `. Safe over-restriction: ${c.safeOverRestriction.join('; ')}` : ''}`);
  }
  const hx = r.extractionHeldout;
  lines.push('', '### Held-out descriptions', '');
  lines.push(`${hx.cases} descriptions written after the rule reader was finished and never used to tune it. Precision ${pct(hx.overall.precision)}, recall ${pct(hx.overall.recall)}, F1 ${pct(hx.overall.f1)}. Critical errors: **${hx.criticalErrors}**. The drop in recall from the development set shows the rules are tuned to phrasing they have seen; missed details are asked as follow-up questions, so they cost time, not safety. This gap is what the AI reader is for (see EVALUATION.md, section 5).`);
  lines.push('', '## Store product matching', '');
  lines.push(`${mt.cases} labelled product titles. Accuracy ${pct(mt.accuracy)}, precision when mapped ${pct(mt.precisionWhenMapped)}, correct refusals ${mt.correctlyRefused}/${mt.shouldNotMap}, pack sizes ${mt.packCorrect}/${mt.packCases}, safety markers missed ${mt.markerMisses}/${mt.markerChecks}, false alarms ${mt.markerFalseAlarms}.`);
  if (mt.failures.length) {
    lines.push('', 'Failures:', '');
    for (const f of mt.failures) lines.push(`- \`${f.id}\` “${f.title}”: expected ${f.expected}, got ${f.got}. ${f.note}`);
  }
  const c = r.cart;
  lines.push('', '## Store cart (Instamart sandbox)', '');
  lines.push(`One sandbox Instamart cart per person (${c.carts} carts, ${c.lines} basket lines). The sandbox sells our catalogue plus every labelled look-alike title, including traps. Each item placed is checked against hand labels, not the matcher. Items placed ${c.itemsPlaced} (${pct(c.itemsPlaced / Math.max(1, c.lines))} of lines), left for the person ${c.linesSkipped}, unsafe ${c.unsafeItems}, wrong product ${c.wrongProduct}, short quantity ${c.underCovered}.`);
  if (c.examples.length) {
    lines.push('', 'Examples:', '');
    for (const e of c.examples) lines.push(`- ${e}`);
  }
  lines.push('');
  return lines.join('\n');
}
