// First run: privacy notice + consent (FR-021), then the first profile.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { store } from '../../lib/store/index.ts';
import { NOTICE_VERSION } from '../../lib/store/types.ts';
import { useApp } from '../../app/context.tsx';
import { qk } from '../../app/hooks.ts';
import { Button, Field, Input, Notice } from '../../components/ui.tsx';
import { Logo } from '../../components/Logo.tsx';

export function PrivacyNotice() {
  return (
    <div className="space-y-3 text-sm text-on-surface-variant">
      <p>
        <strong>What we collect:</strong> for each profile, date of birth, height, weight, activity, food pattern, allergies, food exclusions, goal and grocery budget. We do not ask for diagnoses, medication, government ID, exact location or payment details.
      </p>
      <p>
        <strong>Why:</strong> only to estimate reference nutrition needs, build meal plans and prepare simulated grocery baskets for you.
      </p>
      <p>
        <strong>What we do not do:</strong> no advertising, no analytics on health or profile data, and no sending of your profile to any AI service.
      </p>
      <p>
        <strong>Your control:</strong> you can edit or archive profiles, export your data and delete your account at any time from Settings.
      </p>
      <p className="text-xs">Notice version {NOTICE_VERSION}.</p>
    </div>
  );
}

export function WelcomePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { setActiveProfileId, toast } = useApp();
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!agree) return setError('Please accept the privacy notice to continue.');
    if (!name.trim()) return setError('Give this profile a name, for example your first name.');
    setBusy(true);
    try {
      await store.setConsent('profile_processing', true);
      const p = await store.createProfile(name);
      setActiveProfileId(p.id);
      await qc.refetchQueries({ queryKey: qk.profiles, type: 'all' });
      toast('Profile created');
      nav(`/profiles/${p.id}/setup`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-surface-container px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-xl" noValidate>
        <Logo />
        <div className="card mt-6 p-6 sm:p-8">
          <h1 className="text-2xl font-normal">Before you add any personal details</h1>
          <div className="mt-4 rounded-ctl bg-surface-container p-4">
            <PrivacyNotice />
          </div>
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-primary" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read the notice and agree that NourishCart may process profile details for meal and grocery planning.</span>
          </label>
          <hr className="my-6 border-outline-variant" />
          <h2 className="text-lg font-medium">Who are you planning for first?</h2>
          <p className="mt-1 text-sm text-on-surface-variant">You can add more adults later. Each person gets their own targets and budget.</p>
          <div className="mt-4">
            <Field label="Profile name" htmlFor="pname" hint="A first name or nickname is enough.">
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
            </Field>
          </div>
          {error && <Notice className="mt-4" tone="danger">{error}</Notice>}
          <Button type="submit" size="lg" className="mt-6 w-full" loading={busy}>
            Create profile and continue
          </Button>
        </div>
        <Notice className="mt-4">NourishCart plans for healthy adults aged 18 and over. It is not a medical service.</Notice>
      </form>
    </div>
  );
}
