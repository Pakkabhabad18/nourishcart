// Material Design 3 layout:
//  - desktop (lg+): navigation rail (80 px) with pill-shaped active indicators
//  - mobile: top app bar + bottom navigation bar (80 px) with 4 destinations + More
// The profile switcher sits in the top app bar on every screen size.
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { CalendarDays, ChevronDown, FlaskConical, Home, LineChart, Menu, Package, Receipt, Settings, ShoppingBasket, Users, WifiOff, ScanLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from './context.tsx';
import { useActiveProfile } from './hooks.ts';
import { isDemo } from '../lib/store/index.ts';
import { Logo, LogoMark } from '../components/Logo.tsx';

const NAV = [
  { to: '/overview', label: 'Home', icon: Home, mobile: true },
  { to: '/nutrition', label: 'Nutrition', icon: LineChart, mobile: false },
  { to: '/plans', label: 'Plans', icon: CalendarDays, mobile: true },
  { to: '/groceries', label: 'Groceries', icon: ShoppingBasket, mobile: true },
  { to: '/scan', label: 'Scan', icon: ScanLine, mobile: true },
  { to: '/pantry', label: 'Pantry', icon: Package, mobile: true },
  { to: '/orders', label: 'Orders', icon: Receipt, mobile: false },
  { to: '/profiles', label: 'Profiles', icon: Users, mobile: false },
  { to: '/evaluation', label: 'Evaluation', icon: FlaskConical, mobile: false },
  { to: '/settings', label: 'Settings', icon: Settings, mobile: false },
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
          <button role="menuitem" onClick={() => (setOpen(false), nav('/profiles'))} className="flex h-12 w-full items-center px-4 text-left text-sm hover:bg-on-surface/[0.08]">
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
    <div className="min-h-dvh bg-surface lg:pl-20">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-surface-container-high focus:px-4 focus:py-2">
        Skip to content
      </a>
      {/* Navigation rail (desktop) */}
      <aside className="fixed inset-y-0 left-0 hidden w-20 flex-col items-center bg-surface-container-low py-4 lg:flex">
        <NavLink to="/overview" aria-label="NourishCart home" className="mb-6">
          <LogoMark className="h-9 w-9" />
        </NavLink>
        <nav aria-label="Main" className="flex flex-1 flex-col items-center gap-3">
          {NAV.map((n) => (
            <Destination key={n.to} {...n} />
          ))}
        </nav>
      </aside>

      {/* Top app bar */}
      <header className="sticky top-0 z-30 bg-surface">
        {isDemo && (
          <div className="bg-warning-container px-4 py-1.5 text-center text-xs text-on-warning-container">
            Demo mode: data stays in this browser and sign-in codes appear on screen. No email is sent and nothing is purchased.
          </div>
        )}
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-inverse-surface px-4 py-1.5 text-xs text-inverse-on-surface">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> You are offline. You can look around, but changes and checkout need a connection.
          </div>
        )}
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Logo compact />
          <ProfileSwitcher />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-32 pt-4 sm:px-6 lg:px-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Navigation bar (mobile) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 bg-surface-container pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid h-20 grid-cols-5 items-center">
          {NAV.filter((n) => n.mobile).map((n) => (
            <li key={n.to}>
              <Destination {...n} compact />
            </li>
          ))}
          <li>
            <button onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} className="group flex w-full flex-col items-center gap-1 py-1 text-xs font-medium">
              <span className={clsx('flex h-8 w-16 items-center justify-center rounded-full', moreOpen ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant')}>
                <Menu className="h-5 w-5" aria-hidden />
              </span>
              <span className={moreOpen ? 'text-on-surface' : 'text-on-surface-variant'}>More</span>
            </button>
          </li>
        </ul>
        {moreOpen && (
          <div className="absolute bottom-full right-2 mb-2 w-60 rounded-xs bg-surface-container py-2 shadow-e2">
            {NAV.filter((n) => !n.mobile).map((n) => (
              <NavLink key={n.to} to={n.to} className="flex h-12 items-center gap-3 px-4 text-sm hover:bg-on-surface/[0.08]">
                <n.icon className="h-5 w-5 text-on-surface-variant" aria-hidden /> {n.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
