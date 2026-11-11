// Layout: desktop sidebar + top profile bar; mobile top bar + bottom tab bar (PRD 11.3).
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { CalendarDays, ChevronDown, Home, LineChart, Menu, Package, Receipt, Settings, ShoppingBasket, Users, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context.tsx';
import { useActiveProfile } from './hooks.ts';
import { isDemo } from '../lib/store/index.ts';
import { Logo } from '../components/Logo.tsx';

const NAV = [
  { to: '/overview', label: 'Overview', short: 'Home', icon: Home, mobile: true },
  { to: '/nutrition', label: 'Nutrition', short: 'Nutrition', icon: LineChart, mobile: false },
  { to: '/plans', label: 'Meal plans', short: 'Plan', icon: CalendarDays, mobile: true },
  { to: '/groceries', label: 'Groceries', short: 'Shop', icon: ShoppingBasket, mobile: true },
  { to: '/pantry', label: 'Pantry', short: 'Pantry', icon: Package, mobile: true },
  { to: '/orders', label: 'Orders', short: 'Orders', icon: Receipt, mobile: false },
  { to: '/profiles', label: 'Profiles', short: 'Profiles', icon: Users, mobile: false },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: Settings, mobile: false },
];

function ProfileSwitcher() {
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
  const active = all.filter((p) => !p.archived);
  if (!profile) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-[44px] items-center gap-2 rounded-ctl border border-line bg-surface px-2.5 py-1.5 text-left hover:border-teal-300"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-mint text-sm font-semibold text-forest" aria-hidden>
          {profile.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="text-xs text-muted">Planning for</span>
          <span className="text-sm font-medium">{profile.displayName}</span>
        </span>
        <span className="text-sm font-medium sm:hidden">{profile.displayName}</span>
        <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-40 mt-2 w-64 p-1.5 shadow-lg">
          {active.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === profile.id}
              onClick={() => {
                setActiveProfileId(p.id);
                setOpen(false);
              }}
              className={clsx('flex w-full items-center gap-2 rounded-ctl px-3 py-2.5 text-left text-sm hover:bg-canvas', p.id === profile.id && 'bg-mint font-medium text-forest')}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-surface text-xs ring-1 ring-line">{p.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 truncate">{p.displayName}</span>
              {!p.onboardingComplete && <span className="text-xs text-warn">Setup</span>}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button role="menuitem" onClick={() => (setOpen(false), nav('/profiles'))} className="w-full rounded-ctl px-3 py-2.5 text-left text-sm text-forest hover:bg-canvas">
            Manage profiles
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { online } = useApp();
  const loc = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [loc.pathname]);
  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-ctl focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => clsx('flex min-h-[42px] items-center gap-3 rounded-ctl px-3 text-[0.9375rem] transition-colors', isActive ? 'bg-mint font-medium text-forest' : 'text-ink/80 hover:bg-canvas')}
            >
              <n.icon className="h-[18px] w-[18px]" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <p className="px-5 pb-5 text-xs leading-relaxed text-muted">General wellness planning for healthy adults. Not medical advice. Groceries and orders are simulated.</p>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        {isDemo && (
          <div className="bg-warn-bg px-4 py-1.5 text-center text-xs text-warn">
            Demo mode: data stays in this browser and sign-in codes appear on screen. No email is sent and nothing is purchased.
          </div>
        )}
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-xs text-white">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> You are offline. You can look around, but changes and checkout need a connection.
          </div>
        )}
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="hidden lg:block" />
          <ProfileSwitcher />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => n.mobile).map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} className={({ isActive }) => clsx('flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'font-medium text-forest' : 'text-muted')}>
                <n.icon className="h-5 w-5" aria-hidden />
                {n.short}
              </NavLink>
            </li>
          ))}
          <li>
            <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className={clsx('flex min-h-[58px] w-full flex-col items-center justify-center gap-0.5 text-[11px]', moreOpen ? 'text-forest' : 'text-muted')}>
              <Menu className="h-5 w-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
        {moreOpen && (
          <div className="absolute bottom-full right-2 mb-2 w-56 rounded-card border border-line bg-surface p-1.5 shadow-lg">
            {NAV.filter((n) => !n.mobile).map((n) => (
              <NavLink key={n.to} to={n.to} className="flex min-h-[44px] items-center gap-3 rounded-ctl px-3 text-sm hover:bg-canvas">
                <n.icon className="h-[18px] w-[18px] text-muted" aria-hidden /> {n.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
