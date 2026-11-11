// Small UI kit. Native elements first (button, input, select, dialog) for accessibility.
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, X } from 'lucide-react';
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-ctl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' && 'min-h-[36px] px-3 text-sm',
          size === 'md' && 'min-h-[44px] px-4 text-base',
          size === 'lg' && 'min-h-[50px] px-5 text-lg',
          variant === 'primary' && 'bg-forest text-white hover:bg-forest-700',
          variant === 'secondary' && 'border border-line bg-surface text-ink hover:border-teal-300 hover:bg-forest-50',
          variant === 'ghost' && 'text-forest hover:bg-forest-50',
          variant === 'danger' && 'bg-danger text-white hover:brightness-95',
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
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">
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
        tone === 'info' && 'border-line bg-forest-50 text-ink',
        tone === 'warn' && 'border-warn/30 bg-warn-bg text-ink',
        tone === 'danger' && 'border-danger/30 bg-danger-bg text-ink',
        tone === 'success' && 'border-teal/30 bg-mint text-ink',
        className,
      )}
    >
      <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-teal')} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-muted [&_strong]:text-ink')}>{children}</div>}
      </div>
    </div>
  );
}

/** Visible on every simulated product, basket and order (FR-012). */
export function SimulatedTag({ children = 'Simulated' }: { children?: ReactNode }) {
  return <span className="inline-flex items-center rounded-md border border-warn/40 bg-warn-bg px-1.5 py-0.5 text-xs font-medium text-warn">{children}</span>;
}

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-canvas text-muted ring-1 ring-line',
        tone === 'good' && 'bg-mint text-forest',
        tone === 'warn' && 'bg-warn-bg text-warn',
        tone === 'danger' && 'bg-danger-bg text-danger',
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-6 sm:p-8">
      {icon && <div className="rounded-full bg-mint p-2.5 text-forest">{icon}</div>}
      <div className="max-w-prose">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children && <div className="mt-1 text-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-muted" role="status">
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
      <div className="relative h-2.5 rounded-full bg-canvas ring-1 ring-line">
        {band && <div className="absolute inset-y-0 rounded-full bg-teal-300/60" style={{ left: pct(band[0]), width: `calc(${pct(band[1])} - ${pct(band[0])})` }} />}
        {/* Tick labels alternate between two rows so close references never collide. */}
        {[...ticks].sort((a, b) => a.at - b.at).map((t, i) => (
          <div key={t.label} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(t.at) }}>
            <span className="h-2.5 w-px bg-ink/40" style={{ height: i % 2 ? 26 : 14 }} />
            <span className="whitespace-nowrap text-[11px] leading-none text-muted">{t.label}</span>
          </div>
        ))}
        {value != null && (
          <div className="range-marker absolute -top-6 flex -translate-x-1/2 flex-col items-center" style={{ left: pct(value) }}>
            {valueLabel && <span className={clsx('num whitespace-nowrap text-xs font-semibold', tone === 'warn' ? 'text-warn' : 'text-forest')}>{valueLabel}</span>}
            <span className={clsx('mt-0.5 h-[18px] w-[18px] rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(23,79,67,.25)]', tone === 'warn' ? 'bg-warn' : 'bg-forest')} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-0.5 text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
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
      className={clsx('m-0 mt-auto w-full max-w-none rounded-t-card bg-surface p-0 text-ink backdrop:bg-ink/30 sm:m-auto sm:rounded-card', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id={id} className="text-lg font-semibold">
              {title}
            </h2>
            <button onClick={onClose} className="rounded-ctl p-2 text-muted hover:bg-canvas" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
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
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6">
      {message && <div className="pointer-events-auto rounded-ctl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">{message}</div>}
    </div>
  );
}
