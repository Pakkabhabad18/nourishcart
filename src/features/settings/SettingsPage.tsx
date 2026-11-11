// Settings and privacy (screen 19, FR-021): account, consent records, export, deletion,
// install help, and the honest status of external integrations.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, Smartphone, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/context.tsx';
import { qk } from '../../app/hooks.ts';
import { store, isDemo } from '../../lib/store/index.ts';
import { Button, Field, Input, Notice, PageHeader, Sheet, Tag } from '../../components/ui.tsx';
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
      <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4 text-teal" aria-hidden /> Install the app</h2>
      {standalone ? (
        <p className="mt-1 text-sm text-muted">NourishCart is installed on this device.</p>
      ) : evt ? (
        <Button className="mt-3" size="sm" onClick={() => evt.prompt()}>Install NourishCart</Button>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li>Android (Chrome): menu ⋮, then “Install app” or “Add to Home screen”.</li>
          <li>iPhone (iOS 16.4+): Share, then “Add to Home Screen”. Notifications and background features differ on iOS.</li>
          <li>Desktop Chrome or Edge: the install icon in the address bar.</li>
        </ul>
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
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Account</h2>
          <p className="mt-1 text-sm text-muted">Signed in as <strong>{session?.email}</strong> with email codes. There is no password.</p>
          {isDemo && <p className="mt-2 text-sm text-warn">Demo mode: this account exists only in this browser.</p>}
          <Button className="mt-4" variant="secondary" icon={<LogOut className="h-4 w-4" aria-hidden />} onClick={() => store.signOut().then(() => nav('/', { replace: true }))}>
            Sign out
          </Button>
        </section>
        <InstallCard />
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold">Privacy and consent</h2>
          <div className="mt-3 rounded-ctl bg-canvas p-4"><PrivacyNotice /></div>
          <ul className="mt-4 divide-y divide-line text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">Profile processing for planning</p>
                <p className="text-muted">{active('profile_processing') ? `Given ${dateTime(active('profile_processing')!.acceptedAt)}, notice ${active('profile_processing')!.noticeVersion}` : 'Not given. Planning features will ask again.'}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!online} onClick={() => toggleConsent('profile_processing', !active('profile_processing'))}>
                {active('profile_processing') ? 'Withdraw' : 'Give consent'}
              </Button>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">Product analytics</p>
                <p className="text-muted">Off. NourishCart has no analytics installed, and health or profile data would never be included.</p>
              </div>
              <Tag>Not used</Tag>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">Retailer account linking</p>
                <p className="text-muted">Not available. Future linking will ask for separate consent first.</p>
              </div>
              <Tag>Not available</Tag>
            </li>
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-muted">Download everything stored for your account as JSON.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} onClick={exportData}>Export my data</Button>
            <Button variant="ghost" onClick={copyData}>Copy as JSON</Button>
          </div>
        </section>
        <section className="card border-danger/30 p-5">
          <h2 className="font-semibold">Delete account</h2>
          <p className="mt-1 text-sm text-muted">Permanently deletes your login, every profile, plan, basket, order record, pantry item and consent record. This cannot be undone.</p>
          <Button className="mt-4" variant="danger" icon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setDeleting(true)} disabled={!online}>Delete account</Button>
        </section>
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold">Data sources</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {DATA_SOURCES.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="max-w-prose">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-muted">{s.notes}</p>
                </div>
                <Tag tone={s.isSample ? 'warn' : s.permissionStatus === 'pending' ? 'neutral' : 'good'}>{s.isSample ? 'Sample data' : s.permissionStatus === 'pending' ? 'Not imported' : 'Cited'}</Tag>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <Notice className="mt-4">NourishCart is a general-wellness planning tool for healthy adults. It does not diagnose, treat or prevent any condition.</Notice>

      <Sheet open={deleting} onClose={() => setDeleting(false)} title="Delete your account?" footer={<><Button variant="secondary" onClick={() => setDeleting(false)}>Keep my account</Button><Button variant="danger" onClick={deleteAll} disabled={phrase !== 'DELETE'} loading={busy}>Delete everything</Button></>}>
        <p className="mb-4">This removes all data for {session?.email}. Type DELETE to confirm.</p>
        <Field label="Confirmation" htmlFor="del">
          <Input id="del" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
        </Field>
      </Sheet>
    </>
  );
}
