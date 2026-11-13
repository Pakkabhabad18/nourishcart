// Material Design 3 layout:
//  - desktop (lg+): navigation rail with the four main destinations
//  - phone: top app bar + bottom bar with the same four destinations, no "More" button
// The account menu (top right) switches person and holds the secondary pages.
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { CalendarDays, ChevronDown, FlaskConical, Home, LineChart, Package, Receipt, Settings, ShoppingBasket, Users, WifiOff, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context.tsx';
import { useActiveProfile } from './hooks.ts';
import { Logo, LogoMark } from '../components/Logo.tsx';

// Four main destinations follow the weekly loop: see today, plan the week, shop, check a packet.
// Everything else (targets, pantry, orders, household, settings) lives in the account menu
// at the top right, so the bottom bar never needs a "More" button.
const NAV = [
  { to: '/overview', label: 'Today', icon: Home },
  { to: '/plans', label: 'Meals', icon: CalendarDays },
  { to: '/groceries', label: 'Shop', icon: ShoppingBasket },
  { to: '/scan', label: 'Scan', icon: ScanLine },
];

// Secondary pages, reached from the account menu on every screen size.
const MENU = [
  { to: '/nutrition', label: 'My targets', icon: LineChart },
  { to: '/pantry', label: 'Pantry', icon: Package },
  { to: '/orders', label: 'Orders', icon: Receipt },
  { to: '/profiles', label: 'Household', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/evaluation', label: 'How we test', icon: FlaskConical },
];

/** One rail / bar destination: icon inside a pill indicator, label underneath. */
function Destination({ to, label, icon: Icon, compact }: { to: string; label: string; icon: typeof Home; compact?: boolean }) {
  return (
    <NavLink to={to} className="group flex flex-col items-center gap-1 py-1 text-xs font-medium">
      {({ isActive }) => (
        <>
          <span className={clsx('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant group-hover:bg-on-surface/[0.08]', compact && 'w-16')}>
            <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
          </span>
          <span className={isActive ? 'text-on-surface' : 'text-on-surface-variant'}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

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
        className="flex min-h-[44px] items-center gap-2 rounded-full bg-surface-container-high py-1 pl-1 pr-3 text-left hover:bg-surface-container-highest"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-medium text-on-primary" aria-hidden>
          {profile.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-sm font-medium">{profile.displayName}</span>
        <ChevronDown className="h-4 w-4 text-on-surface-variant" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-xs bg-surface-container py-2 shadow-e2">
          <p className="px-4 pb-1 pt-1 text-xs text-on-surface-variant">Planning for</p>
          {active.map((p) => (
            <button
              key={p.id}
              role="menuitemradio"
              aria-checked={p.id === profile.id}
              onClick={() => {
                setActiveProfileId(p.id);
                setOpen(false);
              }}
              className={clsx('flex h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-on-surface/[0.08]', p.id === profile.id && 'bg-secondary-container text-on-secondary-container')}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-container text-xs text-on-primary-container">{p.displayName.slice(0, 1).toUpperCase()}</span>
              <span className="flex-1 truncate">{p.displayName}</span>
              {!p.onboardingComplete && <span className="text-xs text-warning">Setup</span>}
            </button>
          ))}
          <div className="my-1 h-px bg-outline-variant" />
          {MENU.map((m) => (
            <button key={m.to} role="menuitem" onClick={() => (setOpen(false), nav(m.to))} className="flex h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-on-surface/[0.08]">
              <m.icon className="h-5 w-5 text-on-surface-variant" aria-hidden /> {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { online } = useApp();
  const loc = useLocation();
  // Scroll to top on page change so a new screen never opens half-way down.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="min-h-dvh bg-surface lg:pl-24">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface-container-high focus:px-4 focus:py-2">
        Skip to content
      </a>
      {/* Navigation rail (desktop): the same four destinations as the phone bar. */}
      <aside className="fixed inset-y-0 left-0 hidden w-24 flex-col items-center bg-surface-container-low py-4 lg:flex">
        <NavLink to="/overview" aria-label="NourishCart home" className="mb-6">
          <LogoMark className="h-9 w-9" />
        </NavLink>
        <nav aria-label="Main" className="flex flex-1 flex-col items-center gap-4">
          {NAV.map((n) => (
            <Destination key={n.to} {...n} />
          ))}
        </nav>
      </aside>

      {/* Top app bar: logo and the account menu. Only the offline notice can appear above it. */}
      <header className="sticky top-0 z-30 bg-surface">
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-inverse-surface px-4 py-1.5 text-xs text-inverse-on-surface">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> You're offline. Changes will need a connection.
          </div>
        )}
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Logo compact />
          <ProfileSwitcher />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-32 pt-2 sm:px-6 lg:px-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Navigation bar (phone): four tabs, no overflow menu. */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 bg-surface-container pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid h-20 grid-cols-4 items-center">
          {NAV.map((n) => (
            <li key={n.to}>
              <Destination {...n} compact />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
