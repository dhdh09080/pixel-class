import {
  useEffect,
  useMemo,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from 'react';
import { X, ArrowUpRight, Check, ExternalLink } from 'lucide-react';
import type { Appearance, ProjectStatus } from '../shared/types';
import { statusLabels } from '../shared/types';
import { characterCanvas } from './game/character';
export function Avatar({
  appearance,
  size = 60,
  className = '',
}: {
  appearance: Appearance;
  size?: number;
  className?: string;
}) {
  const image = useMemo(() => characterCanvas(appearance).toDataURL(), [appearance]);
  return (
    <img
      className={`avatar ${className}`}
      src={image}
      width={size * 0.75}
      height={size}
      alt="흰색 안전모와 남색 작업복을 입은 나의 캐릭터"
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
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">PIXEL CLASS</p>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="닫기">
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
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span id={`${id}-label`}>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            'aria-labelledby': `${id}-label`,
            'aria-describedby': hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
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
