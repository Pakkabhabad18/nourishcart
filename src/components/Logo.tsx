// Wordmark: a jamun-plum bowl with a curry-leaf sprout (Nutrion's leaf), so the logo and the
// mascot read as one family.
// The name is configurable via VITE_BRAND_NAME.
export const BRAND = (import.meta.env.VITE_BRAND_NAME as string | undefined) || 'NourishCart';

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="11" fill="#4A2A6B" />
      <path d="M6.5 15h19a9.5 9.5 0 0 1-19 0Z" fill="#FFB21A" />
      <path d="M16 15c0-3 .3-5.4 1-7.4" stroke="#7FD3A1" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M17 8c2.5-2.6 5.6-2.4 6.6-.7-2 1.5-4.4 1.6-6.6.7Z" fill="#7FD3A1" />
    </svg>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={compact ? 'h-8 w-8 lg:hidden' : 'h-8 w-8'} />
      <span className="font-display text-xl font-bold tracking-tight text-primary">{BRAND}</span>
    </span>
  );
}
