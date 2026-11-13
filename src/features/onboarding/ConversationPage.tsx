// Setup as a conversation. The app asks one question at a time, out loud if the person
// chose voice, listens for the answer, says back what it understood and moves on.
// Answers can also be typed or tapped. All reading is done by the conversation engine
// (domain/intake/conversation.ts); this page only runs the turns and the voice.
//
// Turn loop (voice on):  speak question -> listen -> read answer -> speak "got it" + next question
// If the answer isn't understood it asks again with an example; after two misses, and if the
// person turned the AI reader on, the answer is also read by the AI and checked by our rules.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUp, Check, Keyboard, Mic, Pencil, Volume2, VolumeX } from 'lucide-react';
import { clsx } from 'clsx';
import { useBundle, useSaveBundle } from '../../app/hooks.ts';
import { useApp } from '../../app/context.tsx';
import { Button, ErrorState, Notice, Spinner } from '../../components/ui.tsx';
import { answer, emptyConversation, nextQuestion, progress, QUESTIONS, reopen, summaryRows, toBundle, type ConvState, type QKey } from '../../domain/intake/conversation.ts';
import { validateProfileForNutrition } from '../../domain/nutrition/eligibility.ts';
import { INGREDIENT_MAP } from '../../data/ingredients.ts';
import { useVoiceChat } from '../../lib/useVoiceChat.ts';
import { Nutrion, type NutrionMood } from '../../components/Nutrion.tsx';
import { AI_CONSENT_KEY, readWithAi } from '../../lib/aiIntake.ts';

type Msg = { from: 'app' | 'me'; text: string };
const food = (id: string) => INGREDIENT_MAP.get(id)?.name ?? id;

function aiAllowed(): boolean {
  try {
    return localStorage.getItem(AI_CONSENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function ConversationPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { setActiveProfileId } = useApp();
  const q = useBundle(id);
  const save = useSaveBundle();
  const voice = useVoiceChat();
  const [now] = useState(() => new Date());
  const [mode, setMode] = useState<'start' | 'chat' | 'summary'>('start');
  const [voiceOn, setVoiceOn] = useState(false);
  const [conv, setConv] = useState<ConvState>(emptyConversation);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState(aiAllowed);
  // Refs mirror state for the async voice loop, which outlives a single render.
  const convRef = useRef(conv);
  convRef.current = conv;
  const voiceRef = useRef(voiceOn);
  voiceRef.current = voiceOn;
  const endRef = useRef<HTMLDivElement>(null);
  const turnId = useRef(0); // bumps on every new turn so a stale listen() result is ignored

  useEffect(() => {
    if (q.data) setActiveProfileId(q.data.profile.id);
  }, [q.data, setActiveProfileId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, voice.interim, mode]);

  const name = q.data?.profile.displayName ?? '';
  const current = mode === 'chat' ? nextQuestion(conv) : null;

  /** Say a line (if voice is on), then listen for the answer to `key`. */
  async function sayAndListen(line: string, key: QKey | null) {
    const turn = ++turnId.current;
    setMsgs((m) => [...m, { from: 'app', text: line }]);
    if (!voiceRef.current) return;
    await voice.speak(line);
    if (turn !== turnId.current || !key || !voice.canListen) return;
    const heard = await voice.listen();
    if (turn !== turnId.current) return;
    if (heard) void handle(key, heard);
  }

  async function begin(withVoice: boolean) {
    setVoiceOn(withVoice);
    voiceRef.current = withVoice;
    setMode('chat');
    const first = nextQuestion(convRef.current)!;
    await sayAndListen(`Hi ${name}! I'll ask a few quick questions to plan your meals. Answer in your own words. ${QUESTIONS[first].ask}`, first);
  }

  /** One turn: read the answer, reply, and move to the next question or the summary. */
  async function handle(key: QKey, said: string) {
    const answerText = said.trim();
    if (!answerText) return;
    voice.cancel();
    setText('');
    setError(null);
    setMsgs((m) => [...m, { from: 'me', text: answerText }]);
    let r = answer(convRef.current, key, answerText);
    // Not understood twice: ask the AI reader (if turned on), with the question for context.
    if (r.understood == null && (r.state.misses[key] ?? 0) >= 2 && aiAllowed()) {
      setThinking(true);
      const ai = await readWithAi(`${QUESTIONS[key].ask} ${answerText}`, now);
      setThinking(false);
      if (ai) r = answer(convRef.current, key, answerText, ai.merged);
    }
    setConv(r.state);
    convRef.current = r.state;

    // Under 18: stop here, plans are for adults only.
    if (r.state.e.ageYears && r.state.e.ageYears.value < 18) {
      turnId.current++;
      setMsgs((m) => [...m, { from: 'app', text: 'Sorry, NourishCart only plans meals for adults, 18 and over.' }]);
      if (voiceRef.current) void voice.speak('Sorry, NourishCart only plans meals for adults, 18 and over.');
      return;
    }

    const next = nextQuestion(r.state);
    if (r.refusal) return sayAndListen(`${r.refusal} ${QUESTIONS[key].ask}`, key);
    if (r.understood == null) {
      const misses = r.state.misses[key] ?? 0;
      const line = misses >= 2 && QUESTIONS[key].choices ? `${QUESTIONS[key].retry} You can also tap an option below.` : `Sorry, I didn't catch that. ${QUESTIONS[key].retry}`;
      return sayAndListen(line, key);
    }
    const also = r.alsoFilled.length ? ' I noted the other details too.' : '';
    if (!next) {
      setMode('summary');
      turnId.current++;
      const line = `${r.understood}${also} That's everything. Please check the list and tap "Looks right".`;
      setMsgs((m) => [...m, { from: 'app', text: line }]);
      if (voiceRef.current) void voice.speak(line);
      return;
    }
    return sayAndListen(`${r.understood}${also} ${QUESTIONS[next].ask}`, next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (current) void handle(current, text);
  }

  async function micTap() {
    if (!current) return;
    if (voice.state === 'listening') return voice.stopListening();
    // Turning voice on mid-chat, or answering after a silence.
    setVoiceOn(true);
    voiceRef.current = true;
    voice.cancel();
    const turn = ++turnId.current;
    const heard = await voice.listen();
    if (turn === turnId.current && heard) void handle(current, heard);
  }

  function change(k: QKey) {
    const s = reopen(convRef.current, k);
    setConv(s);
    convRef.current = s;
    setMode('chat');
    void sayAndListen(QUESTIONS[nextQuestion(s)!].ask, nextQuestion(s));
  }

  const draft = useMemo(() => (q.data ? toBundle(conv, q.data, now) : null), [conv, q.data, now]);

  async function finish() {
    if (!draft) return;
    const elig = validateProfileForNutrition(draft, now);
    if (elig.status === 'incomplete') return setError(elig.invalid.map((i) => i.message).join(' ') || 'Some answers are missing.');
    voice.cancel();
    await save.mutateAsync({ ...draft, profile: { ...draft.profile, onboardingStep: 6, onboardingComplete: true } });
    nav('/nutrition?calculate=1');
  }

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error('Profile not found')} />;

  const p = progress(conv);
  const mood: NutrionMood = mode === 'summary' ? 'happy' : thinking ? 'thinking' : voice.state === 'speaking' ? 'talking' : voice.state === 'listening' ? 'listening' : 'idle';

  if (mode === 'start') {
    return (
      <div className="mx-auto max-w-md pt-6 text-center">
        <Nutrion mood="happy" size={120} className="mx-auto" />
        <h1 className="mt-4 text-3xl">Hi {name}, I'm Nutrion!</h1>
        <p className="mt-2 text-on-surface-variant">Let's set you up. I'll ask about 12 short questions, one at a time. Takes about two minutes.</p>
        <div className="mt-8 flex flex-col gap-3">
          {voice.canListen && (
            <Button size="lg" icon={<Mic className="h-5 w-5" aria-hidden />} onClick={() => begin(true)}>
              Talk with me
            </Button>
          )}
          <Button size="lg" variant={voice.canListen ? 'secondary' : 'primary'} icon={<Keyboard className="h-5 w-5" aria-hidden />} onClick={() => begin(false)}>
            Type my answers
          </Button>
          <button className="mt-2 text-sm text-primary" onClick={() => nav(`/profiles/${id}/setup`)}>
            Use a form instead
          </button>
        </div>
        <label className="mt-8 flex cursor-pointer items-start gap-3 text-left text-sm text-on-surface-variant">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            checked={aiOn}
            onChange={(e) => {
              setAiOn(e.target.checked);
              try {
                localStorage.setItem(AI_CONSENT_KEY, e.target.checked ? 'yes' : 'no');
              } catch {
                /* private mode: not remembered */
              }
            }}
          />
          <span>If I'm not understood, let AI read my answer. Only that answer is sent, never my name. Our rules still check it.</span>
        </label>
        {!voice.canListen && <p className="mt-4 text-sm text-on-surface-variant">Voice works in Chrome, Edge and Safari.</p>}
      </div>
    );
  }

  const listening = voice.state === 'listening';
  const choices = current ? QUESTIONS[current].choices : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col">
      {/* Progress and sound toggle */}
      {mode === 'chat' && (
      <div className="sticky top-16 z-10 -mx-4 bg-surface px-4 pb-3 pt-1">
        <div className="flex items-center gap-3">
          <Nutrion mood={mood} size={44} />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label="Questions answered">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(p.done / p.total) * 100}%` }} />
          </div>
          <button
            onClick={() => {
              if (voiceOn) voice.cancel();
              setVoiceOn(!voiceOn);
            }}
            aria-label={voiceOn ? 'Turn voice off' : 'Turn voice on'}
            className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant hover:bg-on-surface/[0.08]"
          >
            {voiceOn ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>
      )}

      {mode === 'summary' && <Nutrion mood="happy" size={72} className="mx-auto mb-2" />}
      {mode === 'summary' && <h1 className="mb-1 text-center text-2xl">Check your answers</h1>}
      {mode === 'summary' && <p className="mb-4 text-center text-on-surface-variant">Tap the pencil to change anything.</p>}
      {/* Chat (hidden once everything is answered, so the summary is the focus) */}
      <ol hidden={mode === 'summary'} className="flex flex-col gap-3 pb-4" aria-live="polite">
        {msgs.map((m, i) => (
          <li key={i} className={clsx('rise max-w-[85%] rounded-[20px] px-4 py-2.5', m.from === 'app' ? 'self-start rounded-bl-md bg-primary-container text-on-primary-container' : 'self-end rounded-br-md bg-primary text-on-primary')}>
            {m.text}
          </li>
        ))}
        {listening && voice.interim && <li className="max-w-[85%] self-end rounded-[20px] rounded-br-md bg-primary/60 px-4 py-2.5 text-on-primary">{voice.interim}</li>}
        {thinking && <li className="self-start text-sm text-on-surface-variant">Nutrion is thinking…</li>}
      </ol>

      {mode === 'summary' && draft && (
        <section className="card mb-4 p-4" aria-label="Your answers">
          <ul className="divide-y divide-outline-variant">
            {summaryRows(conv, { food }).map((r) => (
              <li key={r.key} className="flex items-center gap-3 py-2.5">
                <span className="w-28 shrink-0 text-sm text-on-surface-variant">{r.label}</span>
                <span className="flex-1">{r.value}</span>
                <button onClick={() => change(r.key)} className="grid h-9 w-9 place-items-center rounded-full text-primary hover:bg-primary/[0.08]" aria-label={`Change ${r.label.toLowerCase()}`}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {error && <Notice tone="warn" className="mt-3">{error}</Notice>}
          <Button className="mt-4 w-full" size="lg" icon={<Check className="h-5 w-5" aria-hidden />} onClick={finish} loading={save.isPending}>
            Looks right
          </Button>
        </section>
      )}
      <div ref={endRef} />

      {/* Answer bar: quick replies, text box and mic */}
      {mode === 'chat' && current && (
        <div className="sticky bottom-24 z-10 -mx-4 bg-surface px-4 pb-2 pt-2 lg:bottom-0">
          {choices && (
            <div className="mb-2 flex flex-wrap gap-2">
              {choices.map((c) => (
                <button key={c.label} className="chip" onClick={() => handle(current, c.say)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="conv-answer">Your answer</label>
            <input
              id="conv-answer"
              className="field-input flex-1"
              placeholder={listening ? 'Listening…' : 'Type your answer'}
              value={text}
              onChange={(e) => {
                if (voice.state !== 'idle') voice.cancel();
                setText(e.target.value);
              }}
              autoComplete="off"
            />
            {text.trim() ? (
              <button type="submit" aria-label="Send" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                <ArrowUp className="h-5 w-5" aria-hidden />
              </button>
            ) : (
              voice.canListen && (
                <button
                  type="button"
                  onClick={micTap}
                  aria-label={listening ? 'Stop listening' : 'Answer by voice'}
                  aria-pressed={listening}
                  className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-full', listening ? 'mic-live bg-error text-on-error' : 'bg-primary text-on-primary')}
                >
                  <Mic className="h-5 w-5" aria-hidden />
                </button>
              )
            )}
          </form>
          {voice.micBlocked && <p className="mt-2 text-xs text-error">The microphone is blocked. Allow it in the browser's site settings, or type.</p>}
          {voice.state === 'speaking' && <p className="mt-2 text-xs text-on-surface-variant">Speaking… start typing or tap the mic to answer now.</p>}
        </div>
      )}
    </div>
  );
}
