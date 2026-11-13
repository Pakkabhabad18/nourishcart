// Wordmark: a bowl that doubles as a basket, in the M3 primary colours.
// The name is configurable via VITE_BRAND_NAME.
export const BRAND = (import.meta.env.VITE_BRAND_NAME as string | undefined) || 'NourishCart';

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="10" fill="#005BBF" />
      <path d="M7 15h18a9 9 0 0 1-18 0Z" fill="#FFFFFF" />
      <path d="M12 15c0-3.5 1.8-6 4-7.5M20 15c-.4-2.6-1.6-4.4-3.2-5.6" stroke="#B2C9FE" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={compact ? 'h-8 w-8 lg:hidden' : 'h-8 w-8'} />
      <span className="text-xl font-medium tracking-tight text-on-surface">{BRAND}</span>
    </span>
  );
}
