// App frame.
//  - phone: slim top bar (logo + person switcher) and a bottom bar with Today, Meals,
//    a raised "+ Log" button in the middle, Shop and Me
//  - desktop (lg+): the same five destinations in a side rail
// Everything secondary (targets, pantry, orders, family, settings, legal) lives on Me,
// so the bottom bar never needs a "More" menu.
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { CalendarDays, ChevronDown, Home, Plus, ShoppingBasket, UserRound, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context.tsx';
import { useActiveProfile } from './hooks.ts';
import { Logo, LogoMark } from '../components/Logo.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { LogSheet } from '../features/progress/LogSheet.tsx';

const NAV = [
  { to: '/overview', label: 'Today', icon: Home },
  { to: '/plans', label: 'Meals', icon: CalendarDays },
  { to: '/groceries', label: 'Shop', icon: ShoppingBasket },
  { to: '/me', label: 'Me', icon: UserRound },
];

/** One destination: icon in a pill when active, label underneath. */
function Destination({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink to={to} className="group flex flex-col items-center gap-1 py-1 text-xs font-semibold">
      {({ isActive }) => (
        <>
          <span className={clsx('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive ? 'bg-primary text-on-primary' : 'text-on-surface-variant group-hover:bg-on-surface/[0.06]')}>
            <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
          </span>
          <span className={isActive ? 'text-primary' : 'text-on-surface-variant'}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

/** The raised middle button, like a "record" button: log today's meals. */
function LogButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-1 text-xs font-semibold text-primary" aria-label="Log a meal">
      <span className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-mango text-on-surface shadow-e2 ring-4 ring-surface transition-transform group-active:scale-90">
        <Plus className="h-7 w-7" strokeWidth={2.6} aria-hidden />
      </span>
      Log
    </button>
  );
}

/** Top-right: who we're planning for. Tap to switch person or add someone. */
function PersonSwitcher() {
  const { profile, all } = useActiveProfile();
  const { setActiveProfileId } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!profile) return null;
  const active = all.filter((p) => !p.archived);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex min-h-[44px] items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-on-surface/[0.06]">
        <Avatar name={profile.displayName} src={profile.avatar} size={34} />
        <span className="max-w-[9rem] truncate text-sm font-semibold">{profile.displayName}</span>
        <ChevronDown className="h-4 w-4 text-on-surface-variant" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="pop absolute right-0 z-40 mt-2 w-64 rounded-ctl border border-outline-variant bg-surface-container-lowest p-1.5 shadow-e3">
          <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-on-surface-variant">Planning for</p>
          {active.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === profile.id}
              onClick={() => (setActiveProfileId(p.id), setOpen(false))}
              className={clsx('flex h-12 w-full items-center gap-3 rounded-xs px-3 text-left text-sm', p.id === profile.id ? 'bg-primary-container font-semibold text-on-primary-container' : 'hover:bg-on-surface/[0.06]')}
            >
              <Avatar name={p.displayName} src={p.avatar} size={28} />
              <span className="flex-1 truncate">{p.displayName}</span>
              {!p.onboardingComplete && <span className="text-xs text-warning">Setup</span>}
            </button>
          ))}
          <button role="menuitem" onClick={() => (setOpen(false), nav('/profiles'))} className="mt-1 flex h-11 w-full items-center gap-3 rounded-xs px-3 text-left text-sm text-primary hover:bg-on-surface/[0.06]">
            <Plus className="h-4 w-4" aria-hidden /> Add a family member
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { online } = useApp();
  const { profile } = useActiveProfile();
  const loc = useLocation();
  const [logOpen, setLogOpen] = useState(false);
  // Scroll to top on page change so a new screen never opens half-way down.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="min-h-dvh bg-surface lg:pl-24">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface-container-high focus:px-4 focus:py-2">
        Skip to content
      </a>
      {/* Side rail (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-24 flex-col items-center gap-6 border-r border-outline-variant bg-surface-container-lowest py-5 lg:flex">
        <NavLink to="/overview" aria-label="NourishCart home">
          <LogoMark className="h-10 w-10" />
        </NavLink>
        <button onClick={() => setLogOpen(true)} className="grid h-14 w-14 place-items-center rounded-2xl bg-mango shadow-e2 transition-transform active:scale-90" aria-label="Log a meal">
          <Plus className="h-7 w-7" strokeWidth={2.6} aria-hidden />
        </button>
        <nav aria-label="Main" className="flex flex-col items-center gap-4">
          {NAV.map((n) => (
            <Destination key={n.to} {...n} />
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur">
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-inverse-surface px-4 py-1.5 text-xs text-inverse-on-surface">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> You're offline. Changes will need a connection.
          </div>
        )}
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <span className="lg:hidden">
            <Logo compact />
          </span>
          <span className="hidden lg:block" />
          <PersonSwitcher />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-36 pt-2 sm:px-6 lg:pb-12">
        <Outlet />
      </main>

      {/* Bottom bar (phone): Today, Meals, + Log, Shop, Me */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface-container-lowest/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid h-20 max-w-lg grid-cols-5 items-center">
          <li><Destination {...NAV[0]} /></li>
          <li><Destination {...NAV[1]} /></li>
          <li className="flex justify-center"><LogButton onClick={() => setLogOpen(true)} /></li>
          <li><Destination {...NAV[2]} /></li>
          <li><Destination {...NAV[3]} /></li>
        </ul>
      </nav>
      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} profileId={profile?.id} />
    </div>
  );
}
