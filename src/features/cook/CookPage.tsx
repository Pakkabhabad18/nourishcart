// Today's menu for the cook: dishes and exact amounts from the selected plan, in English,
// Telugu or Hindi, to read aloud or send on WhatsApp. The translation is AI (api/cook.js);
// checkTranslation() makes sure every quantity survived, otherwise the English note is shown.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, MessageCircle, Volume2 } from 'lucide-react';
import { useActiveProfile, useSelectedPlan } from '../../app/hooks.ts';
import { useApp } from '../../app/context.tsx';
import { Button, Chip, EmptyState, Notice, PageHeader, Spinner } from '../../components/ui.tsx';
import { CAT } from '../../lib/catalog.ts';
import { buildMenu, checkTranslation, englishNote, LANGUAGE_NAMES, SPEECH_LANG, type CookLanguage } from '../../domain/cook/note.ts';
import { applyPatchToPlan } from '../../domain/pipeline.ts';
import { useBundle } from '../../app/hooks.ts';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function CookPage() {
  const nav = useNavigate();
  const { toast } = useApp();
  const { profile } = useActiveProfile();
  const bundle = useBundle(profile?.id);
  const { plan, isLoading } = useSelectedPlan(profile?.id);
  const [day, setDay] = useState(() => (new Date().getDay() + 6) % 7); // Monday = 0
  const [lang, setLang] = useState<CookLanguage>('te');
  const [text, setText] = useState<string | null>(null);
  const [shownLang, setShownLang] = useState<CookLanguage>('en');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const english = useMemo(() => {
    if (!plan || !bundle.data) return null;
    const draft = applyPatchToPlan(plan.draft, plan.patch, bundle.data, CAT);
    return englishNote(buildMenu(draft, day, CAT), DAY_NAMES[day]);
  }, [plan, bundle.data, day]);

  if (!profile) return null;
  if (isLoading || bundle.isLoading) return <Spinner label="Loading the plan" />;
  if (!plan || !english) return <EmptyState title="Choose a meal plan first" action={<Button onClick={() => nav('/plans')}>Go to meal plans</Button>}>The note is made from your selected plan.</EmptyState>;

  async function make() {
    setNotice(null);
    if (lang === 'en') {
      setText(english);
      setShownLang('en');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/cook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: english, language: lang }) });
      const j = (await r.json()) as { content?: string };
      const out = (j.content ?? '').replace(/\*\*/g, '').trim();
      const c = checkTranslation(english!, out);
      if (r.ok && c.ok) {
        setText(out);
        setShownLang(lang);
      } else {
        setText(english);
        setShownLang('en');
        setNotice(r.ok ? `The ${LANGUAGE_NAMES[lang]} version changed some quantities (${[...c.missing, ...c.extra].join(', ')}), so here is the English note instead.` : `The ${LANGUAGE_NAMES[lang]} translator isn't available right now, so here is the English note.`);
      }
    } catch {
      setText(english);
      setShownLang('en');
      setNotice('Translation failed, so here is the English note.');
    } finally {
      setBusy(false);
    }
  }

  function speak() {
    if (!text || !('speechSynthesis' in window)) return toast('This browser cannot read text aloud.');
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[shownLang];
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(SPEECH_LANG[shownLang].slice(0, 2)));
    if (voice) u.voice = voice;
    else if (shownLang !== 'en') toast(`No ${LANGUAGE_NAMES[shownLang]} voice on this device; it may sound wrong. Try Chrome on Android.`);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Menu for the cook" description="The day's dishes with exact amounts, in the language your cook prefers. Read it out, or send it on WhatsApp." />
      <section className="card space-y-4 p-5">
        <div>
          <p className="text-sm font-medium">Day</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAY_NAMES.map((d, i) => (
              <Chip key={d} role="radio" selected={day === i} onClick={() => { setDay(i); setText(null); }}>{d.slice(0, 3)}</Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Language</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(LANGUAGE_NAMES) as CookLanguage[]).map((l) => (
              <Chip key={l} role="radio" selected={lang === l} onClick={() => { setLang(l); setText(null); }}>{LANGUAGE_NAMES[l]}</Chip>
            ))}
          </div>
        </div>
        <Button onClick={make} loading={busy}>Make the note</Button>
        {lang !== 'en' && <p className="text-xs text-on-surface-variant">Translated by AI (on Groq); only the menu is sent. Every quantity is checked against the English version before it's shown.</p>}
      </section>

      {notice && <Notice tone="warn">{notice}</Notice>}
      {text && (
        <section className="card p-5">
          <p className="whitespace-pre-line leading-relaxed" lang={SPEECH_LANG[shownLang]}>{text}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="tonal" icon={<Volume2 className="h-4 w-4" aria-hidden />} onClick={speak}>Read aloud</Button>
            <a className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-secondary-container px-5 text-sm font-medium text-on-secondary-container" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp
            </a>
            <Button variant="ghost" icon={<Copy className="h-4 w-4" aria-hidden />} onClick={async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed'); } }}>Copy</Button>
          </div>
          {shownLang !== 'en' && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-primary">English version</summary>
              <p className="mt-1 whitespace-pre-line text-on-surface-variant">{english}</p>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
