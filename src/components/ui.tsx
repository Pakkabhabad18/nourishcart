// Small UI kit. Native elements first (button, input, select, dialog) for accessibility.
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

// M3 common buttons: primary = filled, secondary = outlined, tonal = filled tonal, ghost = text, danger = filled error.
type Variant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.01em] transition-[background-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-40',
          size === 'sm' && 'min-h-[36px] px-4 text-sm',
          size === 'md' && 'min-h-[44px] px-6 text-sm',
          size === 'lg' && 'min-h-[52px] px-7 text-base',
          variant === 'primary' && 'bg-primary text-on-primary hover:shadow-e1 hover:brightness-110',
          variant === 'secondary' && 'border border-outline bg-transparent text-primary hover:bg-primary/[0.08]',
          variant === 'tonal' && 'bg-secondary-container text-on-secondary-container hover:shadow-e1',
          variant === 'ghost' && 'px-3 text-primary hover:bg-primary/[0.08]',
          variant === 'danger' && 'bg-error text-on-error hover:shadow-e1',
          className,
        )}
        {...rest}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  },
);

export function Card({ className, children, as: As = 'section', ...rest }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'li' } & Record<string, unknown>) {
  return (
    <As className={clsx('card', className)} {...rest}>
      {children}
    </As>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-prose">
        <h1 className="text-2xl font-normal sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-on-surface-variant">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-on-surface">
        {label}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-on-surface-variant">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-error">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; describedBy?: string }>(function Input({ invalid, describedBy, className, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={clsx('field-input', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('field-input appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2365736E' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

/** Toggle chips for multi/single choice. role=checkbox/radio semantics come from the caller. */
export function Chip({ selected, onClick, children, role = 'checkbox', disabled }: { selected: boolean; onClick: () => void; children: ReactNode; role?: 'checkbox' | 'radio'; disabled?: boolean }) {
  return (
    <button type="button" role={role} aria-checked={selected} onClick={onClick} disabled={disabled} className="chip disabled:opacity-50">
      {children}
    </button>
  );
}

export function Notice({ tone = 'info', title, children, className }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: string; children?: ReactNode; className?: string }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'danger' ? ShieldAlert : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx(
        'flex gap-3 rounded-ctl border px-4 py-3 text-sm',
        tone === 'info' && 'border-outline-variant bg-secondary-container/50 text-on-surface',
        tone === 'warn' && 'border-warning/30 bg-warning-container text-on-surface',
        tone === 'danger' && 'border-error/30 bg-error-container text-on-surface',
        tone === 'success' && 'border-primary/30 bg-secondary-container text-on-surface',
        className,
      )}
    >
      <Icon className={clsx('mt-0.5 h-[18px] w-[18px] shrink-0', tone === 'warn' ? 'text-warning' : tone === 'danger' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-primary')} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'opacity-90 [&_strong]:font-semibold')}>{children}</div>}
      </div>
    </div>
  );
}

/** Visible on every simulated product, basket and order (FR-012). */
export function SimulatedTag({ children = 'Simulated' }: { children?: ReactNode }) {
  return <span className="inline-flex items-center rounded-md border border-warning/40 bg-warning-container px-1.5 py-0.5 text-xs font-medium text-warning">{children}</span>;
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-surface-container text-on-surface-variant ring-1 ring-outline-variant',
        tone === 'good' && 'bg-secondary-container text-primary',
        tone === 'warn' && 'bg-warning-container text-warning',
        tone === 'danger' && 'bg-error-container text-error',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-6 sm:p-8">
      {icon && <div className="rounded-full bg-primary-container p-3 text-on-primary-container">{icon}</div>}
      <div className="max-w-prose">
        <h2 className="text-xl font-normal">{title}</h2>
        {children && <div className="mt-1 text-on-surface-variant">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-on-surface-variant" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Notice tone="danger" title="This section did not load">
      <p>{error instanceof Error ? error.message : 'Check your connection and try again.'}</p>
      {retry && (
        <button className="link mt-1" onClick={retry}>
          Try again
        </button>
      )}
    </Notice>
  );
}

/**
 * The signature visual: an estimate drawn as a band, not a point. Reference ticks (EAR,
 * RDA, budget limit) sit on the same scale so people see what the number means.
 */
export function RangeBar({
  min,
  max,
  band,
  value,
  ticks = [],
  valueLabel,
  tone = 'good',
  ariaLabel,
}: {
  min: number;
  max: number;
  band?: [number, number];
  value?: number;
  ticks?: { at: number; label: string }[];
  valueLabel?: string;
  tone?: 'good' | 'warn';
  ariaLabel: string;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div role="img" aria-label={ariaLabel} className={clsx('pt-7', ticks.length > 1 ? 'pb-9' : 'pb-5')}>
      <div className="relative h-2 rounded-full bg-surface-container-highest">
        {band && <div className="absolute inset-y-0 rounded-full bg-primary/25" style={{ left: pct(band[0]), width: `calc(${pct(band[1])} - ${pct(band[0])})` }} />}
        {/* Tick labels alternate between two rows so close references never collide. */}
        {[...ticks].sort((a, b) => a.at - b.at).map((t, i) => (
          <div key={t.label} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(t.at) }}>
            <span className="h-2.5 w-px bg-on-surface/40" style={{ height: i % 2 ? 26 : 14 }} />
            <span className="whitespace-nowrap text-[11px] leading-none text-on-surface-variant">{t.label}</span>
          </div>
        ))}
        {value != null && (
          <div className="range-marker absolute -top-6 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(value) }}>
            {valueLabel && <span className={clsx('num whitespace-nowrap text-xs font-semibold', tone === 'warn' ? 'text-warning' : 'text-primary')}>{valueLabel}</span>}
            <span className={clsx('mt-0.5 h-[18px] w-[18px] rounded-full border-[3px] border-surface-container-low shadow-e1', tone === 'warn' ? 'bg-warning' : 'bg-primary')} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-on-surface-variant">{label}</p>
      <p className="num mt-0.5 text-xl font-medium">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}

/** Native <dialog> sheet: focus trapping, Esc to close and inert background for free. */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onCancel={onClose}
      className={clsx('m-0 mt-auto w-full max-w-none rounded-t-xl2 bg-surface-container-low p-0 text-on-surface shadow-e3 backdrop:bg-scrim/40 sm:m-auto sm:rounded-xl2 sm:bg-surface-container-high', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <div className="mx-auto mt-3 h-1 w-8 rounded-full bg-on-surface-variant/40 sm:hidden" aria-hidden />
          <div className="flex items-center justify-between px-6 pb-2 pt-4">
            <h2 id={id} className="text-2xl font-normal">
              {title}
            </h2>
            <button onClick={onClose} className="rounded-ctl p-2 text-on-surface-variant hover:bg-on-surface/[0.06]" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-6 py-3">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pb-6 pt-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6 lg:left-20">
      {message && <div className="pointer-events-auto min-w-[280px] max-w-[560px] rounded-xs bg-inverse-surface px-4 py-3.5 text-sm text-inverse-on-surface shadow-e3">{message}</div>}
    </div>
  );
}
