// Me: the person's own space, like the "You" tab in fitness apps.
//  - photo (tap to change; shrunk on the phone before saving), name and who they are
//  - streak and badges
//  - family members
//  - links to targets, pantry, orders, settings, how we test, and the legal pages
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, Camera, ChevronRight, FileText, FlaskConical, LineChart, LogOut, Package, Receipt, Settings, ShieldCheck, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { useActiveProfile, useBundle, useCalculation, useCheckins, useSaveBundle } from '../../app/hooks.ts';
import { useApp } from '../../app/context.tsx';
import { store } from '../../lib/store/index.ts';
import { Avatar, photoToAvatar } from '../../components/Avatar.tsx';
import { Notice, Select, Spinner } from '../../components/ui.tsx';
import { badges, dayKey, streak } from '../../domain/progress/progress.ts';

export const RELATIONS: [string, string][] = [
  ['me', 'Me'],
  ['partner', 'Partner'],
  ['parent', 'Parent'],
  ['sibling', 'Brother or sister'],
  ['child_adult', 'Grown-up child'],
  ['flatmate', 'Flatmate'],
  ['other', 'Someone else'],
];

function Row({ to, icon: Icon, label, hint }: { to: string; icon: typeof Settings; label: string; hint?: string }) {
  return (
    <li>
      <Link to={to} className="flex min-h-[56px] items-center gap-4 px-4 py-3 hover:bg-on-surface/[0.04]">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-container text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">{label}</span>
          {hint && <span className="block text-sm text-on-surface-variant">{hint}</span>}
        </span>
        <ChevronRight className="h-5 w-5 text-on-surface-variant" aria-hidden />
      </Link>
    </li>
  );
}

export function MePage() {
  const { profile, all } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const calc = useCalculation(profile?.id);
  const checkins = useCheckins(profile?.id);
  const save = useSaveBundle();
  const { toast, session } = useApp();
  const nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!profile || bundle.isLoading) return <Spinner />;
  const b = bundle.data!;
  const today = dayKey(new Date());
  const s = streak(checkins.data ?? [], today);
  const list = badges(checkins.data ?? [], today, calc.data?.record.personal?.proteinG.value ?? null);
  const family = all.filter((p) => !p.archived);

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      const avatar = await photoToAvatar(f);
      await save.mutateAsync({ ...b, profile: { ...b.profile, avatar } });
      toast('Photo updated');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not use that photo.');
    }
  }

  return (
    <div className="space-y-5">
      {/* Who */}
      <section className="rise flex flex-col items-center pt-2 text-center">
        <button onClick={() => file.current?.click()} className="relative" aria-label="Change photo">
          <Avatar name={profile.displayName} src={profile.avatar} size={104} ring />
          <span className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-primary text-on-primary shadow-e2">
            <Camera className="h-4 w-4" aria-hidden />
          </span>
        </button>
        <input ref={file} type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} aria-label="Choose a photo" />
        <h1 className="mt-3 text-3xl">{profile.displayName}</h1>
        <label className="mt-2 flex items-center gap-2 text-sm text-on-surface-variant">
          <span>This is</span>
          <Select
            className="h-10 w-auto py-1"
            value={profile.relation ?? (family[0]?.id === profile.id ? 'me' : '')}
            onChange={(e) => save.mutate({ ...b, profile: { ...b.profile, relation: e.target.value || null } })}
          >
            <option value="">Choose</option>
            {RELATIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </label>
        {err && <Notice tone="warn" className="mt-3">{err}</Notice>}
      </section>

      {/* Streak + badges */}
      <section className="rise rise-1 card p-5" aria-labelledby="badges-h">
        <div className="flex items-center justify-between">
          <h2 id="badges-h" className="text-lg">Your progress</h2>
          <span className="font-display text-lg font-bold text-tertiary">🔥 {s.days}-day streak</span>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-3">
          {list.map((x) => (
            <li key={x.id} className={clsx('flex flex-col items-center rounded-ctl p-3 text-center', x.earned ? 'pop bg-mango-soft' : 'bg-surface-container opacity-60')}>
              <Award className={clsx('h-8 w-8', x.earned ? 'text-tertiary' : 'text-outline')} aria-hidden />
              <span className="mt-1 text-sm font-semibold">{x.title}</span>
              <span className="text-xs text-on-surface-variant">{x.detail}</span>
              <span className="sr-only">{x.earned ? 'Earned' : 'Not yet'}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Family */}
      <section className="rise rise-2 card p-5" aria-labelledby="fam-h">
        <div className="flex items-center justify-between">
          <h2 id="fam-h" className="text-lg">Family</h2>
          <Link to="/profiles" className="text-sm font-semibold text-primary">Manage</Link>
        </div>
        <ul className="mt-3 flex flex-wrap gap-4">
          {family.map((p) => (
            <li key={p.id} className="flex w-16 flex-col items-center gap-1 text-center">
              <Avatar name={p.displayName} src={p.avatar} size={52} ring={p.id === profile.id} />
              <span className="w-full truncate text-xs font-medium">{p.displayName}</span>
            </li>
          ))}
          <li>
            <button onClick={() => nav('/profiles?add=1')} className="flex w-16 flex-col items-center gap-1">
              <span className="grid h-[52px] w-[52px] place-items-center rounded-full border-2 border-dashed border-outline text-2xl text-primary">+</span>
              <span className="text-xs font-medium text-primary">Add</span>
            </button>
          </li>
        </ul>
      </section>

      <nav aria-label="More" className="card overflow-hidden">
        <ul className="divide-y divide-outline-variant">
          <Row to="/nutrition" icon={LineChart} label="My targets" hint="Goal, calories, protein, nutrients" />
          <Row to="/pantry" icon={Package} label="Pantry" hint="What you have at home" />
          <Row to="/orders" icon={Receipt} label="Orders" />
          <Row to="/profiles" icon={Users} label="Family" hint="Add or edit people" />
          <Row to="/settings" icon={Settings} label="Settings" hint="Privacy, your data, install the app" />
          <Row to="/evaluation" icon={FlaskConical} label="How we test" hint="Every safety check, with numbers" />
        </ul>
      </nav>

      <nav aria-label="Legal" className="card overflow-hidden">
        <ul className="divide-y divide-outline-variant">
          <Row to="/legal/privacy" icon={ShieldCheck} label="Privacy policy" />
          <Row to="/legal/terms" icon={FileText} label="Terms of use" />
          <Row to="/legal/health" icon={FileText} label="Health disclaimer" />
        </ul>
      </nav>

      <div className="flex flex-col items-center gap-1 pb-4 text-sm text-on-surface-variant">
        <span>{session?.email}</span>
        <button onClick={() => store.signOut().then(() => nav('/', { replace: true }))} className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-error hover:bg-error/[0.06]">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );
}
