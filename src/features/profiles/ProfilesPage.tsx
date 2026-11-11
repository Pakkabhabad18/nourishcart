// Profile management (FR-002): create, rename, archive/restore, switch, continue setup.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, Plus, RotateCcw, UserRound } from 'lucide-react';
import { store } from '../../lib/store/index.ts';
import { useApp } from '../../app/context.tsx';
import { qk, useActiveProfile, useSaveBundle } from '../../app/hooks.ts';
import { Button, EmptyState, ErrorState, Field, Input, PageHeader, Sheet, Spinner, Tag } from '../../components/ui.tsx';
import { ageInYears } from '../../domain/units.ts';
import type { Profile } from '../../domain/types.ts';

export function ProfilesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { setActiveProfileId, toast, online } = useApp();
  const { profile: active, profiles, all } = useActiveProfile();
  const saveBundle = useSaveBundle();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (profiles.isLoading) return <Spinner label="Loading profiles" />;
  if (profiles.error) return <ErrorState error={profiles.error} retry={() => profiles.refetch()} />;

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const p = await store.createProfile(name);
    await qc.invalidateQueries({ queryKey: qk.profiles });
    setActiveProfileId(p.id);
    setBusy(false);
    setAdding(false);
    setName('');
    nav(`/profiles/${p.id}/setup`);
  }
  async function rename() {
    if (!renaming || !name.trim()) return;
    setBusy(true);
    const b = await store.getBundle(renaming.id);
    if (b) await saveBundle.mutateAsync({ ...b, profile: { ...b.profile, displayName: name.trim() } });
    setBusy(false);
    setRenaming(null);
    toast('Profile renamed');
  }
  async function archive(p: Profile, archived: boolean) {
    await store.setArchived(p.id, archived);
    await qc.invalidateQueries({ queryKey: qk.profiles });
    toast(archived ? `${p.displayName} archived` : `${p.displayName} restored`);
  }

  const visible = all.filter((p) => (showArchived ? p.archived : !p.archived));
  return (
    <>
      <PageHeader
        title="Profiles"
        description="Each adult has their own measurements, food rules, targets and budget. Nothing is averaged across people."
        actions={
          <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => (setName(''), setAdding(true))} disabled={!online}>
            Add adult profile
          </Button>
        }
      />
      {all.some((p) => p.archived) && (
        <div className="mb-4 flex gap-2" role="radiogroup" aria-label="Show">
          <button role="radio" aria-checked={!showArchived} className="chip" onClick={() => setShowArchived(false)}>Active</button>
          <button role="radio" aria-checked={showArchived} className="chip" onClick={() => setShowArchived(true)}>Archived</button>
        </div>
      )}
      {visible.length === 0 ? (
        <EmptyState icon={<UserRound className="h-5 w-5" />} title={showArchived ? 'No archived profiles' : 'No profiles yet'} action={!showArchived && <Button onClick={() => setAdding(true)}>Add a profile</Button>}>
          Profiles are for adults aged 18 and over.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((p) => {
            const isActive = active?.id === p.id;
            return (
              <li key={p.id} className={`card p-5 ${isActive ? 'ring-2 ring-forest/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-mint font-semibold text-forest">{p.displayName.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <h2 className="font-semibold">{p.displayName}</h2>
                      <p className="text-sm text-muted">{p.dateOfBirth ? `${ageInYears(p.dateOfBirth)} years` : 'Age not set'}</p>
                    </div>
                  </div>
                  {isActive ? <Tag tone="good">Active</Tag> : p.onboardingComplete ? null : <Tag tone="warn">Setup incomplete</Tag>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!p.archived && !isActive && (
                    <Button size="sm" onClick={() => (setActiveProfileId(p.id), toast(`Now planning for ${p.displayName}`))}>
                      Switch to {p.displayName}
                    </Button>
                  )}
                  {!p.archived && (
                    <Button size="sm" variant="secondary" onClick={() => nav(`/profiles/${p.id}/setup`)}>
                      {p.onboardingComplete ? 'Edit details' : 'Continue setup'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" aria-hidden />} onClick={() => (setName(p.displayName), setRenaming(p))}>
                    Rename
                  </Button>
                  {p.archived ? (
                    <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />} onClick={() => archive(p, false)}>
                      Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<Archive className="h-3.5 w-3.5" aria-hidden />} onClick={() => archive(p, true)}>
                      Archive
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add an adult profile" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={create} loading={busy} disabled={!name.trim()}>Create and set up</Button></>}>
        <Field label="Name" htmlFor="newname" hint="This person must be 18 or older. Children's nutrition is outside NourishCart's scope.">
          <Input id="newname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </Field>
      </Sheet>
      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title="Rename profile" footer={<><Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button><Button onClick={rename} loading={busy} disabled={!name.trim()}>Save name</Button></>}>
        <Field label="Name" htmlFor="rename">
          <Input id="rename" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        </Field>
      </Sheet>
    </>
  );
}
