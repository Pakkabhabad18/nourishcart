// Simulated catalogue browser (screen 12). Every product is labelled as simulated and
// shows pack, price, unit price, availability and when it was last checked.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CAT } from '../../lib/catalog.ts';
import { Input, Notice, PageHeader, Select, SimulatedTag, Tag } from '../../components/ui.tsx';
import { formatInr, formatQty } from '../../lib/format.ts';
import { unitPrice } from '../../domain/units.ts';
import { ALLERGEN_LABELS, productRejection } from '../../domain/diet.ts';
import { useActiveProfile, useBundle } from '../../app/hooks.ts';
import { restrictionsOf } from '../../domain/planning/plan.ts';
import { PROVIDERS } from '../../domain/commerce/adapter.ts';

const GROUPS: Record<string, string> = { cereal: 'Grains and flours', millet: 'Millets', pulse: 'Dals and pulses', dairy: 'Dairy', egg: 'Eggs', meat: 'Meat', fish: 'Fish', vegetable: 'Vegetables', fruit: 'Fruit', nut_seed: 'Nuts and seeds', fat: 'Oils and ghee', condiment: 'Spices', soy: 'Soy' };

export function CataloguePage() {
  const { profile } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [onlyMine, setOnlyMine] = useState(true);
  const restrictions = bundle.data?.preferences.dietPattern ? restrictionsOf(bundle.data) : null;
  const items = useMemo(
    () =>
      CAT.products
        .map((p) => ({ p, ing: CAT.ingredients.get(p.ingredientId)! }))
        .filter(({ p, ing }) => (!group || ing.foodGroup === group) && (`${p.title} ${p.brand} ${ing.name} ${ing.localNames.join(' ')}`.toLowerCase().includes(q.toLowerCase())))
        .map((x) => ({ ...x, blocked: restrictions ? productRejection(x.p, x.ing, restrictions) : null }))
        .filter((x) => !onlyMine || !x.blocked),
    [q, group, onlyMine, restrictions],
  );
  return (
    <>
      <Link to="/groceries" className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Groceries
      </Link>
      <PageHeader title="Product catalogue" description={<>Fictional brands and illustrative prices for planning. <SimulatedTag>Not live retailer data</SimulatedTag></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px]">
        <Input aria-label="Search products" placeholder="Search, e.g. toor dal, paneer, ragi" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Category" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      {restrictions && (
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Only show products allowed for {profile?.displayName}
        </label>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ p, ing, blocked }) => {
          const up = unitPrice(p.priceInr, p.packQty, p.packUnit);
          return (
            <li key={p.id} className={`card p-4 ${!p.available ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-on-surface-variant">{p.brand}</p>
                  <p className="font-medium">{p.title}</p>
                </div>
                <SimulatedTag />
              </div>
              <p className="num mt-2 text-lg font-medium">{formatInr(p.priceInr)} <span className="text-sm font-normal text-on-surface-variant">{formatQty(p.packQty, p.packUnit)}, {formatInr(up.value)}{up.label}</span></p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Tag>{p.tier}</Tag>
                {!p.available && <Tag tone="danger">Out of stock</Tag>}
                {[...ing.allergens, ...p.allergens].map((a) => <Tag key={a} tone="warn">{ALLERGEN_LABELS[a]}</Tag>)}
                {blocked && <Tag tone="danger">Not for {profile?.displayName}</Tag>}
              </div>
              <p className="mt-2 text-xs text-on-surface-variant">Maps to {ing.name}. Checked {new Date(p.lastCheckedAt).toLocaleDateString('en-IN')}.</p>
            </li>
          );
        })}
      </ul>
      {items.length === 0 && <Notice>No products match. Try another search or category.</Notice>}
      <section className="mt-8">
        <h2 className="text-lg font-medium">Retailers</h2>
        <ul className="mt-3 divide-y divide-outline-variant rounded-card border border-outline-variant bg-surface">
          {PROVIDERS.map((p) => (
            <li key={p.code} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span className="font-medium">{p.displayName}</span>
              <span className="text-on-surface-variant">{p.status}</span>
              <Tag tone={p.enabled ? 'good' : 'neutral'}>{p.enabled ? 'Active (simulated)' : 'Not connected'}</Tag>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
