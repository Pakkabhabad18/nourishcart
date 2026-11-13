// Pantry (screens 16-17, FR-017/018): stock per profile, planned-use depletion estimates
// with ranges, quick corrections, snooze, and an opt-in scheduled basket rule that only
// ever prepares a draft for review.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarClock, Package, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, usePantry, useReplenishment } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Button, EmptyState, ErrorState, Field, Input, Notice, PageHeader, Select, Sheet, Spinner, Tag } from '../../components/ui.tsx';
import { INGREDIENTS } from '../../data/ingredients.ts';
import { dateShort, formatQty } from '../../lib/format.ts';
import type { PantryItem, ReplenishmentEstimate } from '../../domain/inventory/pantry.ts';
import { dayLong } from '../../lib/format.ts';

const STAPLES: [string, number][] = [['rice', 2000], ['wheat_atta', 1000], ['oil', 455], ['masala', 50], ['toor_dal', 500], ['onion', 1000]];

function statusTag(e: ReplenishmentEstimate) {
  if (e.status === 'out') return <Tag tone="danger">Likely run out</Tag>;
  if (e.status === 'due_soon') return <Tag tone="warn">Reorder soon</Tag>;
  if (e.status === 'snoozed') return <Tag>Snoozed</Tag>;
  if (e.status === 'not_in_plan') return <Tag>Not in this week’s plan</Tag>;
  return <Tag tone="good">Enough for now</Tag>;
}

function ScheduleCard({ profileId, name }: { profileId: string; name: string }) {
  const qc = useQueryClient();
  const { toast, online } = useApp();
  const rule = useQuery({ queryKey: qk.schedule(profileId), queryFn: () => store.getScheduleRule(profileId) });
  const [editing, setEditing] = useState(false);
  const [weekday, setWeekday] = useState(6);
  const [max, setMax] = useState<number | ''>('');
  const [consent, setConsent] = useState(false);
  const r = rule.data;
  async function save(enabled: boolean) {
    await store.saveScheduleRule({ profileId, enabled, weekday, maxSpendInr: max === '' ? null : max, consentAt: enabled ? new Date().toISOString() : r?.consentAt ?? null, lastPreparedAt: r?.lastPreparedAt ?? null });
    await qc.invalidateQueries({ queryKey: qk.schedule(profileId) });
    setEditing(false);
    toast(enabled ? 'Scheduled basket turned on' : 'Scheduled basket turned off');
  }
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        <div className="flex-1">
          <h2 className="font-medium">Weekly reminder</h2>
          {r?.enabled ? (
            <p className="mt-1 text-sm text-on-surface-variant">Every {dayLong(r.weekday)} your list for {name} is ready to check{r.maxSpendInr ? `, up to ₹${r.maxSpendInr}` : ''}. Nothing is ordered without you.</p>
          ) : (
            <p className="mt-1 text-sm text-on-surface-variant">Get next week's list ready on the same day each week.</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {r?.enabled ? (
          <Button size="sm" variant="secondary" onClick={() => save(false)} disabled={!online}>Turn off</Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={!online}>Set up</Button>
        )}
      </div>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Scheduled basket" footer={<><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={() => save(true)} disabled={!consent}>Turn on</Button></>}>
        <div className="space-y-4">
          <Field label="Prepare the draft on" htmlFor="wd">
            <Select id="wd" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{dayLong(d)}</option>)}
            </Select>
          </Field>
          <Field label="Maximum spend (optional)" htmlFor="max" hint="If the draft is above this, you will be asked to choose cheaper options.">
            <Input id="max" type="number" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value === '' ? '' : Number(e.target.value))} />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I want NourishCart to prepare a draft basket on this day. I understand it will not order anything without my approval.
          </label>
        </div>
      </Sheet>
    </section>
  );
}

export function PantryPage() {
  const { profile } = useActiveProfile();
  const pantry = usePantry(profile?.id);
  const est = useReplenishment(profile?.id);
  const qc = useQueryClient();
  const { toast, online } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [ingId, setIngId] = useState('');
  const [qty, setQty] = useState<number | ''>('');
  const [expiry, setExpiry] = useState('');

  if (!profile) return <EmptyState title="Add a person first" action={<Link className="link" to="/profiles">Household</Link>} />;
  if (pantry.isLoading) return <Spinner label="Loading pantry" />;
  if (pantry.error) return <ErrorState error={pantry.error} retry={() => pantry.refetch()} />;
  const items = pantry.data!;
  const refresh = () => qc.invalidateQueries({ queryKey: qk.pantry(profile.id) });

  async function upsert(ingredientId: string, quantity: number, existing?: PantryItem, extra: Partial<PantryItem> = {}) {
    const ing = INGREDIENTS.find((i) => i.id === ingredientId)!;
    const now = new Date().toISOString();
    await store.savePantryItem({
      id: existing?.id ?? crypto.randomUUID(), profileId: profile!.id, ownerUserId: existing?.ownerUserId ?? profile!.ownerUserId, ingredientId, name: ing.name,
      quantity: Math.max(0, quantity), unit: ing.unitBasis, countedAt: now, purchasedAt: existing?.purchasedAt ?? null, expiryAt: existing?.expiryAt ?? null,
      source: existing?.source ?? 'manual', confidence: 'confirmed', snoozedUntil: null, bufferDays: existing?.bufferDays ?? 2, ...extra,
    });
    await refresh();
  }
  async function addStaples() {
    for (const [id, q] of STAPLES) if (!items.some((i) => i.ingredientId === id)) await upsert(id, q);
    toast('Common staples added. Adjust the amounts to match your kitchen.');
  }
  async function submitAdd() {
    if (!ingId || qty === '' || qty < 0) return;
    const existing = items.find((i) => i.ingredientId === ingId);
    await upsert(ingId, qty, existing, { expiryAt: expiry || null });
    setAdding(false);
    setIngId('');
    setQty('');
    setExpiry('');
    toast('Pantry updated');
  }
  async function snooze(item: PantryItem) {
    await store.savePantryItem({ ...item, snoozedUntil: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    await refresh();
    toast(`${item.name} snoozed for 3 days`);
  }
  async function remove(item: PantryItem) {
    await store.deletePantryItem(item.id);
    await refresh();
    toast(`${item.name} removed`);
  }
  const selectedIng = INGREDIENTS.find((i) => i.id === ingId);
  const due = est?.filter((e) => e.status === 'due_soon' || e.status === 'out') ?? [];

  return (
    <>
      <PageHeader
        title="Pantry"
        description="Things you already have. We won't buy them again." 
        actions={<Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)} disabled={!online}>Add item</Button>}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="Nothing here yet"
          action={<div className="flex flex-wrap gap-2"><Button onClick={addStaples} disabled={!online}>Add usual staples</Button><Button variant="secondary" onClick={() => setAdding(true)} disabled={!online}>Add one item</Button></div>}
        >
          Rice, dal, oil and spices you have at home make the list shorter.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section>
            {due.length > 0 && (
              <Notice tone="warn" className="mb-4" title={`${due.length} item${due.length === 1 ? '' : 's'} may run low soon`}>
                {due.map((d) => d.name).join(', ')}. <Link to="/groceries" className="link">Prepare this week’s basket</Link>. Nothing is ordered automatically.
              </Notice>
            )}
            <ul className="card divide-y divide-outline-variant">
              {(est ?? []).map((e) => {
                const item = items.find((i) => i.id === e.itemId)!;
                return (
                  <li key={e.itemId} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{e.name}</p>
                        <p className="num text-sm text-on-surface-variant">
                          About {formatQty(e.estimatedRemaining, e.unit)} left{item.confidence === 'estimated' ? ' (estimated)' : ''}
                          {e.dailyConsumption != null && `, using ${formatQty(e.dailyConsumption, e.unit)}/day in the plan`}
                        </p>
                        {e.reorderOn && (
                          <p className="text-sm">
                            Reorder around <strong>{dateShort(e.reorderOn)}</strong> <span className="text-on-surface-variant">(between {dateShort(e.lowerBound!)} and {dateShort(e.upperBound!)}, {e.confidence} confidence)</span>
                          </p>
                        )}
                        {item.expiryAt && <p className="text-xs text-on-surface-variant">Best before {dateShort(item.expiryAt)} (entered by you)</p>}
                      </div>
                      {statusTag(e)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => (setEditing(item), setQty(item.quantity))} disabled={!online}>Update amount</Button>
                      <Button size="sm" variant="ghost" onClick={() => upsert(item.ingredientId, 0, item)} disabled={!online}>Mark as out</Button>
                      {(e.status === 'due_soon' || e.status === 'out') && <Button size="sm" variant="ghost" onClick={() => snooze(item)} disabled={!online}>Snooze 3 days</Button>}
                      <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => remove(item)} disabled={!online}>Remove</Button>
                    </div>
                    <details className="mt-2 text-xs text-on-surface-variant">
                      <summary className="cursor-pointer">Assumptions</summary>
                      <ul className="mt-1 list-disc pl-4">{e.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
          <aside className="space-y-4">
            <ScheduleCard profileId={profile.id} name={profile.displayName} />
            <Notice title="How estimates work">Remaining = last confirmed amount minus planned use since then. Planned use is not the same as what was eaten, so update amounts when you can.</Notice>
          </aside>
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add to pantry" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={submitAdd} disabled={!ingId || qty === ''}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Item" htmlFor="ing">
            <Select id="ing" value={ingId} onChange={(e) => setIngId(e.target.value)}>
              <option value="">Choose an ingredient</option>
              {INGREDIENTS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </Field>
          <Field label={`Amount${selectedIng ? ` (${selectedIng.unitBasis === 'piece' ? 'pieces' : selectedIng.unitBasis})` : ''}`} htmlFor="qty">
            <Input id="qty" type="number" min={0} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))} />
          </Field>
          <Field label="Best before (optional)" htmlFor="exp" hint="Only if you know it. We never guess expiry.">
            <Input id="exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `How much ${editing.name.toLowerCase()} is left?` : ''} footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={async () => { if (editing && qty !== '') { await upsert(editing.ingredientId, qty, editing); setEditing(null); toast('Amount confirmed'); } }}>Confirm amount</Button></>}>
        <Field label={`Amount (${editing?.unit === 'piece' ? 'pieces' : editing?.unit})`} htmlFor="eqty" hint="Confirming resets the estimate and raises its confidence.">
          <Input id="eqty" type="number" min={0} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))} />
        </Field>
        <div className={clsx('mt-3 flex flex-wrap gap-2', !editing && 'hidden')}>
          {editing && [0.25, 0.5, 1].map((f) => (
            <button key={f} className="chip" onClick={() => setQty(Math.round(editing.quantity * f))}>{f === 1 ? 'Unchanged' : `About ${f * 100}%`}</button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
