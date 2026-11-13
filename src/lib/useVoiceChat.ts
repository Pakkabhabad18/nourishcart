// Two-way voice for the setup conversation:
//   speak(text)  -> reads a line aloud (Sarvam Bulbul v4 voice if set up, else the browser's
//                   speechSynthesis), resolves when it has finished
//   listen()     -> listens for one answer (SpeechRecognition), resolves with the words
// The microphone is never on while the app is talking, so it doesn't hear itself.
// Listening uses the browser's speech service (Chrome/Edge/Safari); only Nutrion's own
// questions go to /api/speak to be voiced. Firefox has no speech recognition, so the page
// falls back to typing.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpeech } from './useSpeaker.ts';

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Prefer an Indian English voice, then any English voice. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang.startsWith('en-GB')) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
}

export type VoiceState = 'idle' | 'speaking' | 'listening';

export function useVoiceChat(lang = 'en-IN') {
  const [state, setState] = useState<VoiceState>('idle');
  const [interim, setInterim] = useState('');
  const [micBlocked, setMicBlocked] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const canListen = !!recognitionCtor();
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Voices load asynchronously in Chrome; touching the list early warms it up.
  useEffect(() => {
    if (canSpeak) window.speechSynthesis.getVoices();
  }, [canSpeak]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Plays Sarvam Bulbul v4 audio for `text` if the voice service is set up; false if not. */
  const speakNatural = useCallback(async (text: string): Promise<boolean> => {
    const urls = await fetchSpeech(text, 'en');
    if (!urls) return false;
    setState('speaking');
    for (const src of urls) {
      const ok = await new Promise<boolean>((resolve) => {
        const a = new Audio(src);
        audioRef.current = a;
        a.onended = () => resolve(true);
        a.onerror = () => resolve(false);
        a.onpause = () => a.ended || resolve(false); // cancel() pauses it: stop the sequence
        a.play().catch(() => resolve(false));
      });
      if (!ok) break;
    }
    audioRef.current = null;
    setState((st) => (st === 'speaking' ? 'idle' : st));
    return true;
  }, []);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        // Natural voice first; the browser's voice is the fallback.
        void speakNatural(text).then((done) => {
          if (done) return resolve();
          speakBrowser(text, resolve);
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [speakNatural],
  );

  /** The browser's own voice, used when the natural voice isn't available. */
  function speakBrowser(text: string, resolve: () => void) {
    if (!canSpeak) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? lang;
    u.rate = 1.02;
    // Some browsers never fire `end`; don't wait forever (roughly 70 ms per character).
    const guard = window.setTimeout(done, 1500 + text.length * 70);
    function done() {
      window.clearTimeout(guard);
      setState((st) => (st === 'speaking' ? 'idle' : st));
      resolve();
    }
    u.onend = done;
    u.onerror = done;
    setState('speaking');
    window.speechSynthesis.speak(u);
  }

  /** Listens for one answer. Resolves with '' on silence, a blocked mic, or cancel. */
  const listen = useCallback(
    () =>
      new Promise<string>((resolve) => {
        const Ctor = recognitionCtor();
        if (!Ctor) return resolve('');
        const r = new Ctor();
        r.lang = lang;
        r.continuous = false; // stop at the end of the answer, like a person pausing
        r.interimResults = true; // show words while they are being said
        let finalText = '';
        r.onresult = (e) => {
          let live = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) finalText += ` ${res[0].transcript}`;
            else live += res[0].transcript;
          }
          setInterim((finalText + ' ' + live).trim());
        };
        r.onerror = (e) => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicBlocked(true);
        };
        r.onend = () => {
          rec.current = null;
          setInterim('');
          setState('idle');
          resolve(finalText.trim());
        };
        rec.current = r;
        try {
          r.start();
          setState('listening');
        } catch {
          setState('idle');
          resolve('');
        }
      }),
    [lang],
  );

  /** Stop talking and listening now (e.g. the person started typing). */
  const cancel = useCallback(() => {
    audioRef.current?.pause();
    if (canSpeak) window.speechSynthesis.cancel();
    rec.current?.stop();
    setState('idle');
  }, [canSpeak]);

  /** Finish listening early and use what was heard so far. */
  const stopListening = useCallback(() => rec.current?.stop(), []);

  useEffect(
    () => () => {
      if (canSpeak) window.speechSynthesis.cancel();
      rec.current?.abort();
    },
    [canSpeak],
  );

  return { state, interim, speak, listen, cancel, stopListening, canListen, canSpeak, micBlocked };
}
