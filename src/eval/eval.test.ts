// CI gate: the quick evaluation must pass every critical gate.
import { runFullEvaluation } from './report.ts';
import { CAT } from '../test/fixtures.ts';

test('evaluation gates (quick mode)', async () => {
  const r = await runFullEvaluation(CAT, 'quick');
  console.log('cart', JSON.stringify({ ...r.cart }));
  const failed = r.gates.filter((g) => !g.pass);
  for (const g of r.gates) console.log(`${g.pass ? 'PASS' : 'FAIL'} ${g.id} ${g.name}: ${g.measured}`);
  console.log('extraction failures', JSON.stringify(r.extraction.perCase.filter((c) => c.errors.length || c.critical.length).map((c) => ({ id: c.id, crit: c.critical, err: c.errors.map((e) => `${e.kind}:${e.field}=${JSON.stringify(e.got)}/${JSON.stringify(e.expected)}`) }))));
  console.log('matcher failures', JSON.stringify(r.matching.failures));
  console.log('violations', JSON.stringify(r.recommendation.violationExamples.slice(0, 5)), 'duration', r.recommendation.durationMs);
  expect(failed.filter((g) => g.critical).map((g) => g.id)).toEqual([]);
}, 300_000);
