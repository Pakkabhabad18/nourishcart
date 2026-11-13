// Email OTP sign-in (FR-001): email -> "check your email" -> 6-digit code -> session.
// Generic messages only: the UI never reveals whether an address already has an account.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { store, isDemo } from '../../lib/store/index.ts';
import { EMAIL_RE } from '../../lib/store/types.ts';
import { useApp } from '../../app/context.tsx';
import { Button, Field, Input, Notice } from '../../components/ui.tsx';
import { Logo } from '../../components/Logo.tsx';
import { DEMO_MAIL_EVENT, demoInbox, type DemoMail } from '../../lib/store/demoStore.ts';

const COOLDOWN = 60;

function DemoInbox({ email }: { email: string }) {
  const [mails, setMails] = useState<DemoMail[]>(() => demoInbox());
  useEffect(() => {
    const on = () => setMails(demoInbox());
    window.addEventListener(DEMO_MAIL_EVENT, on);
    return () => window.removeEventListener(DEMO_MAIL_EVENT, on);
  }, []);
  const mine = mails.filter((m) => m.to === email.trim().toLowerCase()).slice(0, 1);
  if (mine.length === 0) return null;
  return (
    <aside aria-label="Demo inbox" className="mt-6 rounded-card border border-dashed border-warning/50 bg-warning-container p-4">
      <p className="text-sm font-medium text-warning">Demo inbox (simulated email, not sent)</p>
      {mine.map((m) => (
        <div key={m.id} className="mt-3 rounded-ctl border border-outline-variant bg-surface p-4">
          <p className="text-xs text-on-surface-variant">To {m.to}</p>
          <p className="mt-1 text-sm font-medium">Your NourishCart sign-in code</p>
          <p className="num mt-2 text-2xl font-normal tracking-[0.3em]">{m.code}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Expires in 10 minutes. Do not share this code.</p>
        </div>
      ))}
    </aside>
  );
}

export function SignInPage() {
  const { session } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  if (session) return <Navigate to="/overview" replace />;

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address, like name@example.com.');
    setBusy(true);
    const r = await store.requestOtp(email);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      if (r.retryAfterSec) {
        setCooldown(r.retryAfterSec);
        setStep('code');
      }
      return;
    }
    setCooldown(COOLDOWN);
    setCode('');
    setStep('code');
  }

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    const r = await store.verifyOtp(email, clean);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      setCode('');
      codeRef.current?.focus();
      return;
    }
    nav('/overview', { replace: true });
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-surface-container px-5 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="inline-block">
          <Logo />
        </Link>
        <div className="card mt-6 p-6 sm:p-8">
          {step === 'email' ? (
            <form onSubmit={send} noValidate>
              <h1 className="text-2xl font-normal">Sign in or create an account</h1>
              <p className="mt-1.5 text-on-surface-variant">We will email you a 6-digit code. No password needed.</p>
              <div className="mt-6">
                <Field label="Email address" htmlFor="email" error={error}>
                  <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error} describedBy={error ? 'email-error' : undefined} placeholder="name@example.com" required />
                </Field>
              </div>
              <Button type="submit" size="lg" className="mt-5 w-full" loading={busy} icon={<Mail className="h-4 w-4" aria-hidden />}>
                Email me a code
              </Button>
              <p className="mt-5 text-xs text-on-surface-variant">
                By continuing you agree to use NourishCart for general wellness planning. You will see the privacy notice before entering any personal details.
              </p>
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <h1 className="text-2xl font-normal">Check your email</h1>
              <p className="mt-1.5 text-on-surface-variant">
                If <strong className="text-on-surface">{email.trim()}</strong> can receive email, a 6-digit code is on its way. It expires in 10 minutes.
              </p>
              <div className="mt-6">
                <Field label="6-digit code" htmlFor="code" error={error} hint="You can paste the whole code.">
                  <Input
                    ref={codeRef}
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    invalid={!!error}
                    describedBy={error ? 'code-error' : 'code-hint'}
                    className="num text-center text-2xl tracking-[0.5em]"
                    placeholder="••••••"
                  />
                </Field>
              </div>
              <Button type="submit" size="lg" className="mt-5 w-full" loading={busy} disabled={code.length !== 6}>
                Verify and continue
              </Button>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <button type="button" className="link" onClick={() => (setStep('email'), setError(null))}>
                  Use a different email
                </button>
                <button type="button" className="link disabled:text-on-surface-variant disabled:no-underline" disabled={cooldown > 0 || busy} onClick={() => send()}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
              <p className="mt-4 text-xs text-on-surface-variant">Not in your inbox? Check spam or promotions. Codes work once.</p>
            </form>
          )}
        </div>
        {isDemo && step === 'code' && <DemoInbox email={email} />}
        {isDemo && step === 'email' && (
          <Notice className="mt-6" tone="warn" title="Demo mode">
            This preview has no email server. Use any address; the code will appear on screen.
          </Notice>
        )}
      </div>
    </div>
  );
}
