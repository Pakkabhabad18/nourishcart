// Settings and privacy (screen 19, FR-021): account, consent records, export, deletion,
// install help, and the honest status of external integrations.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, Smartphone, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/context.tsx';
import { qk } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Button, Field, Input, PageHeader, Sheet, Tag } from '../../components/ui.tsx';
import { PrivacyNotice } from '../profiles/WelcomePage.tsx';
import { dateTime } from '../../lib/format.ts';
import { DATA_SOURCES } from '../../data/sources.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function InstallCard() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  useEffect(() => {
    const on = (e: Event) => (e.preventDefault(), setEvt(e as BeforeInstallPromptEvent));
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-medium"><Smartphone className="h-4 w-4 text-primary" aria-hidden /> Install the app</h2>
      {standalone ? (
        <p className="mt-1 text-sm text-on-surface-variant">NourishCart is installed on this device.</p>
      ) : evt ? (
        <Button className="mt-3" size="sm" onClick={() => evt.prompt()}>Install NourishCart</Button>
      ) : (
        <p className="mt-1 text-sm text-on-surface-variant">Android: browser menu ⋮ → Install app. iPhone: Share → Add to Home Screen.</p>
      )}
    </section>
  );
}

export function SettingsPage() {
  const { session, toast, online } = useApp();
  const qc = useQueryClient();
  const nav = useNavigate();
  const consents = useQuery({ queryKey: qk.consents, queryFn: () => store.listConsents(), enabled: !!session });
  const [deleting, setDeleting] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);

  async function exportData() {
    const data = await store.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nourishcart-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Export downloaded');
  }
  async function copyData() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(await store.exportData(), null, 2));
      toast('Your data was copied as JSON');
    } catch {
      toast('Copy is not allowed here. Use Export instead.');
    }
  }
  async function toggleConsent(purpose: 'profile_processing' | 'analytics', accepted: boolean) {
    await store.setConsent(purpose, accepted);
    await qc.invalidateQueries({ queryKey: qk.consents });
    toast(accepted ? 'Consent recorded' : 'Consent withdrawn');
  }
  async function deleteAll() {
    setBusy(true);
    try {
      await store.deleteAccount();
      nav('/', { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Deletion failed');
    } finally {
      setBusy(false);
    }
  }
  const active = (p: string) => consents.data?.find((c) => c.purpose === p && !c.withdrawnAt);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <section className="card p-5">
          <h2 className="font-medium">Account</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{session?.email}</p>
          <Button className="mt-3" variant="secondary" icon={<LogOut className="h-4 w-4" aria-hidden />} onClick={() => store.signOut().then(() => nav('/', { replace: true }))}>
            Sign out
          </Button>
        </section>
        <InstallCard />
        <section className="card p-5">
          <h2 className="font-medium">Privacy</h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-on-surface-variant">{active('profile_processing') ? `You agreed on ${dateTime(active('profile_processing')!.acceptedAt)}.` : "You haven't agreed yet. Planning will ask again."}</p>
            <Button size="sm" variant="secondary" disabled={!online} onClick={() => toggleConsent('profile_processing', !active('profile_processing'))}>
              {active('profile_processing') ? 'Withdraw' : 'Agree'}
            </Button>
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-primary">Read the privacy notice</summary>
            <div className="mt-2 rounded-ctl bg-surface-container p-4"><PrivacyNotice /></div>
          </details>
        </section>
        <section className="card p-5">
          <h2 className="font-medium">Your data</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} onClick={exportData}>Download my data</Button>
            <Button variant="ghost" onClick={copyData}>Copy as text</Button>
          </div>
          <div className="mt-5 border-t border-outline-variant pt-4">
            <p className="text-sm text-on-surface-variant">Deleting removes your login and everything you saved. It can't be undone.</p>
            <Button className="mt-3" variant="danger" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setDeleting(true)} disabled={!online}>Delete account</Button>
          </div>
        </section>
        <details className="card p-5 text-sm">
          <summary className="cursor-pointer font-medium">Where our numbers come from</summary>
          <ul className="mt-2 divide-y divide-outline-variant">
            {DATA_SOURCES.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="max-w-prose">
                  <p className="font-medium">{x.title}</p>
                  <p className="text-on-surface-variant">{x.notes}</p>
                </div>
                <Tag tone={x.isSample ? 'warn' : x.permissionStatus === 'pending' ? 'neutral' : 'good'}>{x.isSample ? 'Sample data' : x.permissionStatus === 'pending' ? 'Not imported' : 'Cited'}</Tag>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-on-surface-variant">NourishCart is for healthy adults planning everyday meals. It doesn't diagnose or treat any condition.</p>
        </details>
      </div>

      <Sheet open={deleting} onClose={() => setDeleting(false)} title="Delete your account?" footer={<><Button variant="secondary" onClick={() => setDeleting(false)}>Keep my account</Button><Button variant="danger" onClick={deleteAll} disabled={phrase !== 'DELETE'} loading={busy}>Delete everything</Button></>}>
        <p className="mb-4">This removes all data for {session?.email}. Type DELETE to confirm.</p>
        <Field label="Confirmation" htmlFor="del">
          <Input id="del" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
        </Field>
      </Sheet>
    </>
  );
}
