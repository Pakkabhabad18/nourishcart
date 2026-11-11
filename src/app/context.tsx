// App-wide state: session, active profile, connectivity and toasts. Server data itself
// lives in TanStack Query caches (see hooks.ts), not here.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store } from '../lib/store/index.ts';
import type { Session } from '../lib/store/types.ts';
import { Toast } from '../components/ui.tsx';
import { useQueryClient } from '@tanstack/react-query';

interface AppState {
  session: Session | null;
  sessionLoading: boolean;
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
  online: boolean;
  toast: (msg: string) => void;
}

const Ctx = createContext<AppState | null>(null);

const activeKey = (uid: string) => `nourishcart.activeProfile.${uid}`;
function readActive(uid: string): string | null {
  try {
    return localStorage.getItem(activeKey(uid));
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeProfileId, setActive] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    store.getSession().then((s) => {
      setSession(s);
      if (s) setActive(readActive(s.userId));
      setSessionLoading(false);
    });
    return store.onAuthChange((s) => {
      setSession(s);
      setActive(s ? readActive(s.userId) : null);
      if (!s) qc.clear(); // never keep another account's data in memory after sign-out
    });
  }, [qc]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const setActiveProfileId = useCallback(
    (id: string | null) => {
      setActive(id);
      if (!session) return;
      try {
        if (id) localStorage.setItem(activeKey(session.userId), id);
        else localStorage.removeItem(activeKey(session.userId));
      } catch {
        /* ignore */
      }
    },
    [session],
  );

  const value = useMemo(() => ({ session, sessionLoading, activeProfileId, setActiveProfileId, online, toast: setMsg }), [session, sessionLoading, activeProfileId, setActiveProfileId, online]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Toast message={msg} onDone={() => setMsg(null)} />
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
