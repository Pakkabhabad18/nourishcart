// Command-line entry: `npm run eval` runs the FULL evaluation and writes
//   eval-results/report.json      (everything, including per-case errors)
//   src/eval/latest-report.json   (copy shown in the app's Evaluation page)
//   EVALUATION_REPORT.md          (human-readable summary)
// Exit code 1 if any critical gate fails, so CI can block a release.
import { writeFileSync, mkdirSync } from 'node:fs';
import { runFullEvaluation } from './report.ts';
import { RECIPE_MAP } from '../data/recipes.ts';
import { INGREDIENT_MAP } from '../data/ingredients.ts';
import { CATALOGUE } from '../data/catalogue.ts';
import { renderMarkdown } from './markdown.ts';

const report = await runFullEvaluation({ recipes: RECIPE_MAP, ingredients: INGREDIENT_MAP, products: CATALOGUE }, 'full');
mkdirSync('eval-results', { recursive: true });
writeFileSync('eval-results/report.json', JSON.stringify(report, null, 2));
writeFileSync('src/eval/latest-report.json', JSON.stringify(report));
writeFileSync('EVALUATION_REPORT.md', renderMarkdown(report));
for (const g of report.gates) console.log(`${g.pass ? 'PASS' : 'FAIL'}${g.critical ? '*' : ' '} ${g.id.padEnd(3)} ${g.name} -> ${g.measured}`);
console.log(`\n${report.passed ? 'ALL GATES PASSED' : 'SOME GATES FAILED'} (${report.recommendation.profiles} synthetic users, ${report.recommendation.durationMs} ms)`);
if (report.gates.some((g) => g.critical && !g.pass)) process.exit(1);
