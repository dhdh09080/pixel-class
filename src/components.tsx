import {
  useEffect,
  useMemo,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  Children,
  Fragment,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react';
import { X, ArrowUpRight, Check, ExternalLink } from 'lucide-react';
import type { Appearance, ProjectStatus } from '../shared/types';
import { statusLabels } from '../shared/types';
import { characterCanvas, type Direction } from './game/character';
// Bounded value-keyed cache avoids rerendering identical sprites after every state refresh.
const avatarImages = new Map<string, string>();
function avatarImage(appearance: Appearance, direction: Direction = 'down') {
  const key = JSON.stringify([appearance, direction]);
  let source = avatarImages.get(key);
  if (!source) {
    source = characterCanvas(appearance, direction).toDataURL();
    if (avatarImages.size >= 128) avatarImages.delete(avatarImages.keys().next().value!);
    avatarImages.set(key, source);
  }
  return source;
}
export function Avatar({
  appearance,
  size = 60,
  className = '',
  direction = 'down',
  decorative = false,
}: {
  appearance: Appearance;
  size?: number;
  className?: string;
  direction?: Direction;
  decorative?: boolean;
}) {
  const image = useMemo(() => avatarImage(appearance, direction), [appearance, direction]);
  return (
    <img
      className={`avatar ${className}`}
      src={image}
      width={size * 0.75}
      height={size}
      alt={decorative ? '' : '나의 픽셀 캐릭터'}
    />
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  const requestClose = () => {
    if (closing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return latestClose.current();
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setClosing(false);
      latestClose.current();
    }, 180);
  };
  useEffect(() => {
    const el = dialog.current;
    const opener = document.activeElement;
    el?.showModal();
    return () => {
      clearTimeout(closeTimer.current);
      el?.close();
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        !document.querySelector('dialog[open]')
      )
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'wide' : ''} ${closing ? 'is-closing' : ''}`}
      aria-labelledby={headingId}
      aria-describedby={subtitle ? `${headingId}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < Math.floor(bounds.left) ||
            e.clientX > Math.ceil(bounds.right) ||
            e.clientY < Math.floor(bounds.top) ||
            e.clientY > Math.ceil(bounds.bottom))
        )
          requestClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">PIXEL CLASS</p>
          <h2 id={headingId}>{title}</h2>
          {subtitle && (
            <p className="muted" id={`${headingId}-description`}>
              {subtitle}
            </p>
          )}
        </div>
        <button className="icon-button" onClick={requestClose} aria-label="닫기">
          <X size={21} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function Status({ status }: { status: ProjectStatus }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="프로젝트 진행률"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function Empty({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  let attached = false;
  const attach = (node: ReactNode): ReactNode =>
    Children.map(node, (child) => {
      if (!isValidElement(child)) return child;
      const element = child as ReactElement<Record<string, unknown>>;
      if (!attached && ['input', 'textarea', 'select'].includes(String(element.type))) {
        attached = true;
        return cloneElement(element, {
          id,
          'aria-labelledby': `${id}-label`,
          'aria-describedby':
            [
              element.props['aria-describedby'],
              hint ? `${id}-hint` : '',
              error ? `${id}-error` : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined,
          'aria-invalid': error ? true : element.props['aria-invalid'],
        });
      }
      if (element.type === Fragment || element.props.children)
        return cloneElement(element, {}, attach(element.props.children as ReactNode));
      return child;
    });
  const controls = attach(children);
  return (
    <label className={`field ${error ? 'field-error' : ''}`} htmlFor={attached ? id : undefined}>
      <span id={`${id}-label`}>{label}</span>
      {controls}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="field-error-message">
          {error}
        </small>
      )}
    </label>
  );
}
export function External({ href, children }: { href: string; children: ReactNode }) {
  return /^https?:\/\//.test(href) ? (
    <a className="text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={14} />
    </a>
  ) : null;
}
export function CheckRow({
  done,
  text,
  onChange,
  disabled = false,
}: {
  done: boolean;
  text: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`check-row ${done ? 'done' : ''}`}
      onClick={onChange}
      disabled={disabled}
      aria-pressed={done}
    >
      <span className="checkbox">{done && <Check size={13} />}</span>
      <span>{text}</span>
    </button>
  );
}
export function MoreButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="more-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export const date = (value: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
