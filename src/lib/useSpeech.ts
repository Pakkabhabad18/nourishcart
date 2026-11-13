// Voice input using the browser's built-in speech recognition (Web Speech API).
// Chrome/Edge/Safari send audio to the browser vendor's speech service; nothing goes to
// NourishCart servers or to any AI model. Firefox has no support, so the UI falls back to typing.
import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings: the API is not in TypeScript's DOM lib yet.
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

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechStatus = 'idle' | 'listening' | 'unsupported' | 'denied' | 'error';

/**
 * `onFinal` receives each finished phrase; `interim` is the phrase still being spoken.
 * English (India) is used so Indian names, food words and accents are recognised better.
 */
export function useSpeech(onFinal: (text: string) => void, lang = 'en-IN') {
  const [status, setStatus] = useState<SpeechStatus>(() => (getCtor() ? 'idle' : 'unsupported'));
  const [interim, setInterim] = useState('');
  const rec = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return setStatus('unsupported');
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true; // keep listening across pauses until the person taps stop
    r.interimResults = true; // show words as they are spoken
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => setStatus(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' || e.error === 'aborted' ? 'idle' : 'error');
    r.onend = () => {
      setInterim('');
      setStatus((s) => (s === 'listening' ? 'idle' : s));
    };
    rec.current = r;
    try {
      r.start();
      setStatus('listening');
    } catch {
      setStatus('error');
    }
  }, [lang]);

  useEffect(() => () => rec.current?.abort(), []);

  return { status, interim, start, stop, supported: status !== 'unsupported' };
}
