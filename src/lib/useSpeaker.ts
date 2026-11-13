// Speech output with real controls: play, pause, resume, stop.
//  1. Natural Indian voices from Sarvam Bulbul v4 Flash through /api/speak (mp3 chunks),
//     played with an <audio> element, which pauses and resumes reliably on every phone.
//  2. If the voice service isn't set up or fails, the browser's own voice (speechSynthesis).
//     Some Android browsers can't pause speechSynthesis; there, Pause stops and Resume
//     starts the current sentence again.
import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeakLang = 'en' | 'hi' | 'te';
export type SpeakerState = 'idle' | 'loading' | 'playing' | 'paused';

const BCP47: Record<SpeakLang, string> = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' };
let serverVoice: 'unknown' | 'yes' | 'no' = 'unknown';

/** Asks /api/speak for audio. Returns playable URLs, or null if we should use the browser voice. */
export async function fetchSpeech(text: string, lang: SpeakLang): Promise<string[] | null> {
  if (serverVoice === 'no') return null;
  try {
    const r = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: lang }), signal: AbortSignal.timeout(15000) });
    if (r.status === 503 || r.status === 404) {
      serverVoice = 'no'; // not configured here: stop asking for this session
      return null;
    }
    if (!r.ok) return null;
    const j = (await r.json()) as { audios?: string[] };
    if (!j.audios?.length) return null;
    serverVoice = 'yes';
    return j.audios.map((b64) => `data:audio/mpeg;base64,${b64}`);
  } catch {
    return null;
  }
}

function browserVoice(lang: SpeakLang): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis?.getVoices() ?? [];
  const code = BCP47[lang];
  return all.find((v) => v.lang === code) ?? all.find((v) => v.lang.startsWith(code.slice(0, 2))) ?? null;
}

export function useSpeaker() {
  const [state, setState] = useState<SpeakerState>('idle');
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);
  const mode = useRef<'audio' | 'browser' | null>(null);
  const last = useRef<{ text: string; lang: SpeakLang } | null>(null);
  const run = useRef(0); // bumps on stop so late callbacks are ignored

  const stop = useCallback(() => {
    run.current++;
    queue.current = [];
    audio.current?.pause();
    audio.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    mode.current = null;
    setState('idle');
  }, []);

  const playNext = useCallback((id: number) => {
    const src = queue.current.shift();
    if (!src || id !== run.current) {
      if (id === run.current) setState('idle');
      return;
    }
    const a = new Audio(src);
    audio.current = a;
    a.onended = () => playNext(id);
    a.onerror = () => playNext(id);
    a.play().then(() => setState('playing')).catch(() => setState('idle'));
  }, []);

  const playBrowser = useCallback((text: string, lang: SpeakLang, id: number) => {
    if (!('speechSynthesis' in window)) return setState('idle');
    mode.current = 'browser';
    const u = new SpeechSynthesisUtterance(text);
    const v = browserVoice(lang);
    if (v) u.voice = v;
    u.lang = v?.lang ?? BCP47[lang];
    u.onend = () => id === run.current && setState('idle');
    u.onerror = () => id === run.current && setState('idle');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setState('playing');
  }, []);

  /** Starts reading `text` from the beginning. */
  const play = useCallback(
    async (text: string, lang: SpeakLang) => {
      stop();
      const id = run.current;
      last.current = { text, lang };
      setState('loading');
      const urls = await fetchSpeech(text, lang);
      if (id !== run.current) return;
      if (urls) {
        mode.current = 'audio';
        queue.current = urls;
        playNext(id);
      } else playBrowser(text, lang, id);
    },
    [playBrowser, playNext, stop],
  );

  const pause = useCallback(() => {
    if (mode.current === 'audio') audio.current?.pause();
    else if (mode.current === 'browser') {
      window.speechSynthesis.pause();
      // Some Android browsers ignore pause(); then stop, and Resume starts again.
      window.setTimeout(() => {
        if (!window.speechSynthesis.paused) window.speechSynthesis.cancel();
      }, 250);
    }
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    if (mode.current === 'audio' && audio.current) {
      audio.current.play().then(() => setState('playing')).catch(() => setState('idle'));
    } else if (mode.current === 'browser') {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setState('playing');
      } else if (last.current) playBrowser(last.current.text, last.current.lang, run.current);
    }
  }, [playBrowser]);

  useEffect(() => stop, [stop]);

  return { state, play, pause, resume, stop };
}
