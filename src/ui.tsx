import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, LoaderCircle } from 'lucide-react';
export function Button({
  variant = 'secondary',
  busy = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`button ${variant} ${className}`}
    >
      {busy && <LoaderCircle size={16} className="ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Surface({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={`ui-surface ${className}`}>
      {children}
    </div>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return <span className={`ui-badge tone-${tone}`}>{children}</span>;
}
export function InlineNotice({
  title,
  children,
  kind = 'info',
}: {
  title: string;
  children?: ReactNode;
  kind?: 'info' | 'error' | 'success';
}) {
  const Icon = kind === 'error' ? AlertCircle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div
      className={`form-message ${kind}`}
      role={kind === 'error' ? 'alert' : kind === 'success' ? 'status' : undefined}
    >
      <Icon size={19} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={host}
      role="group"
      aria-label={label}
      className={`filter-tabs ui-segments ${className}`}
      onKeyDown={(event) => {
        if (!options.length) return;
        const index = options.findIndex((o) => o.value === value);
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % options.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = options.length - 1;
        else return;
        event.preventDefault();
        onChange(options[next].value);
        host.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className={value === o.value ? 'selected' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
