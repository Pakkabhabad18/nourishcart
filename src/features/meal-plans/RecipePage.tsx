// Recipe detail: ingredients for the chosen servings, nutrient estimates with coverage,
// provenance and steps.
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { CAT } from '../../lib/catalog.ts';
import { aggregateRecipeNutrition, calculateNutrientCoverage, NUTRIENT_META } from '../../domain/recipes/aggregate.ts';
import { EmptyState, Notice, Tag } from '../../components/ui.tsx';
import { ALLERGEN_LABELS } from '../../domain/diet.ts';
import { formatQty, servingsLabel, SLOT_LABEL } from '../../lib/format.ts';
import { DATA_SOURCES } from '../../data/sources.ts';

export function RecipePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const r = id ? CAT.recipes.get(id) : undefined;
  if (!r) return <EmptyState title="Recipe not found" action={<Link className="link" to="/plans">Back to plans</Link>} />;
  const servings = Number(params.get('servings')) || 1;
  const totals = aggregateRecipeNutrition(r, CAT.ingredients, servings);
  const coverage = calculateNutrientCoverage(totals);
  const allergens = [...new Set(r.ingredients.flatMap((ri) => CAT.ingredients.get(ri.ingredientId)?.allergens ?? []))];
  const src = DATA_SOURCES.find((s) => s.id === r.sourceId);
  return (
    <article className="mx-auto max-w-3xl">
      <Link to="/plans" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Meal plan
      </Link>
      <h1 className="text-3xl font-semibold">{r.name}</h1>
      {r.localNames.length > 0 && <p className="mt-1 text-muted">Also called {r.localNames.join(', ')}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-muted"><Clock className="h-4 w-4" aria-hidden />{r.prepMinutes} min</span>
        {r.slots.map((s) => <Tag key={s}>{SLOT_LABEL[s]}</Tag>)}
        {allergens.map((a) => <Tag key={a} tone="warn">Contains {ALLERGEN_LABELS[a].toLowerCase()}</Tag>)}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Ingredients for {servingsLabel(servings)}</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {r.ingredients.map((ri) => {
              const ing = CAT.ingredients.get(ri.ingredientId)!;
              return (
                <li key={ri.ingredientId} className="flex justify-between gap-3 py-2">
                  <span>{ing.name}{ri.optional && <span className="text-muted"> (optional)</span>}</span>
                  <span className="num text-muted">{formatQty(ri.amount * servings, ing.unitBasis)}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Estimated nutrition for {servingsLabel(servings)}</h2>
          <table className="mt-3 w-full text-sm">
            <tbody className="divide-y divide-line">
              {coverage.map((c) => (
                <tr key={c.key}>
                  <td className="py-2 text-muted">{c.label}</td>
                  <td className="num py-2 text-right font-medium">
                    {c.status === 'unknown' ? 'Not available' : `${c.status === 'partial' ? '≥' : ''}${c.approximate ? '≈' : ''}${totals[c.key].value} ${NUTRIENT_META[c.key].unit}`}
                  </td>
                  <td className="py-2 pl-3 text-right text-xs text-muted">{c.status === 'complete' ? '' : `${Math.round(c.knownShare * 100)}% data`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">Method</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {r.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>
      <Notice className="mt-4" title="About these numbers">
        {src?.attribution}. {src?.notes} Recipe version {r.version}, confidence {r.confidence}.
      </Notice>
    </article>
  );
}
