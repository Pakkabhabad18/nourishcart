// First run: privacy notice + consent (FR-021), then the first profile.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
        <strong>What we keep:</strong> for each person, age, height, weight, activity, what they eat, allergies, goal, nutrient targets and budget. We never ask for diagnoses, medicines, ID, exact location or payment details.
      </p>
      <p>
        <strong>Why:</strong> only to work out targets, plan meals and make the shopping list.
      </p>
      <p>
        <strong>What we don't do:</strong> no ads, no tracking, and your profile is never sent to an AI service. Voice is turned into text by your browser. If you allow it, an answer we couldn't understand is sent to an AI service that doesn't keep it or train on it. Label photos and the cook's menu are read by AI too; no profile details go with them.
      </p>
      <p>
        <strong>Your control:</strong> edit, download or delete everything from Settings.
      </p>
      <p className="text-xs">Notice version {NOTICE_VERSION}.</p>
    </div>
  );
}

export function WelcomePage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { setActiveProfileId } = useApp();
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Please type a name.');
    if (!agree) return setError('Please tick the box to agree.');
    setBusy(true);
    try {
      await store.setConsent('profile_processing', true);
      const p = await store.createProfile(name);
      setActiveProfileId(p.id);
      await qc.refetchQueries({ queryKey: qk.profiles, type: 'all' });
      nav(`/profiles/${p.id}/quick`);
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
          <h1 className="text-2xl">What should we call you?</h1>
          <div className="mt-4">
            <Field label="Your name" htmlFor="pname" hint="A first name is enough. You can add family later.">
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
            </Field>
          </div>
          {/* Short version up front; the full notice is one tap away. */}
          <label className="mt-6 flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-primary" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I agree NourishCart can use my details to plan meals and groceries. No ads, no tracking, delete anytime.</span>
          </label>
          <details className="mt-2 pl-8 text-sm">
            <summary className="cursor-pointer text-primary">Read the short privacy notice</summary>
            <div className="mt-2 rounded-ctl bg-surface-container p-4">
              <PrivacyNotice />
            </div>
          </details>
          {error && <Notice className="mt-4" tone="danger">{error}</Notice>}
          <Button type="submit" size="lg" className="mt-6 w-full" loading={busy}>
            Continue
          </Button>
          <p className="mt-4 text-center text-xs text-on-surface-variant">
            For healthy adults, 18 and over. Not medical advice. <Link to="/legal/privacy" className="link">Privacy policy</Link>, <Link to="/legal/terms" className="link">terms</Link>.
          </p>
        </div>
      </form>
    </div>
  );
}
