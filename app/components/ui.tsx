'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, X } from 'lucide-react';

// ───────────────────────── Sheet ─────────────────────────

let openLayers = 0;

const SheetFooterSlot = createContext<HTMLDivElement | null>(null);

/** Renders its children in the sheet's bottom bar, from anywhere inside the sheet. */
export function SheetFooter({ children }: { children: ReactNode }) {
  const slot = useContext(SheetFooterSlot);
  return slot ? createPortal(children, slot) : null;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name, and the visible title unless `header` is given */
  title: string;
  subtitle?: ReactNode;
  /** Replaces the default title block */
  header?: ReactNode;
  headerAside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  /** dialog: centered on large screens. drawer: full-height panel on the side. Both are bottom sheets on phones. */
  variant?: 'dialog' | 'drawer';
}

/** Glass sheet: slides up on phones; a centered dialog or a side drawer on larger screens. */
export function Sheet({ open, onClose, title, subtitle, header, headerAside, children, footer, size = 'md', variant = 'dialog' }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    openLayers += 1;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const target = panel?.querySelector<HTMLElement>('[data-autofocus]') || panel;
      target?.focus({ preventScroll: true });
    });

    const onKey = (e: KeyboardEvent) => {
      // A confirmation dialog on top handles its own keys
      if (document.querySelector('[role="alertdialog"]')) return;
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      openLayers = Math.max(0, openLayers - 1);
      if (openLayers === 0) document.body.style.overflow = '';
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  const drawer = variant === 'drawer';
  const width = drawer ? (size === 'lg' ? 'sm:max-w-[620px]' : 'sm:max-w-[520px]') : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end bg-black/25 dark:bg-black/55 backdrop-blur-[2px] fade ${
        drawer ? 'sm:items-stretch sm:justify-end sm:p-3' : 'sm:items-center sm:justify-center sm:p-6'
      }`}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative glass-strong outline-none w-full flex flex-col max-h-[94dvh] rounded-t-[30px] ${width} ${
          drawer ? 'anim-drawer sm:max-h-none sm:h-full sm:rounded-[28px]' : 'anim-dialog sm:max-h-[88dvh] sm:rounded-[30px]'
        }`}
      >
        <div className="sm:hidden absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1.5 rounded-full bg-fill-strong" aria-hidden />
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-6 sm:pt-5 pb-3">
          <div className="min-w-0 flex-1">
            {header ?? (
              <>
                <h2 className="text-[19px] font-semibold leading-snug">{title}</h2>
                {subtitle && <div className="text-[13.5px] text-secondary mt-0.5">{subtitle}</div>}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 -me-1.5">
            {headerAside}
            <button type="button" onClick={onClose} className="icon-btn bg-fill" aria-label="إغلاق">
              <X />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-6">
          <SheetFooterSlot.Provider value={footerSlot}>{children}</SheetFooterSlot.Provider>
        </div>
        <div
          ref={setFooterSlot}
          className="empty:hidden px-5 sm:px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-hairline"
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Form ─────────────────────────

export function Field({
  label,
  hint,
  aside,
  children,
  as = 'label',
}: {
  label: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  /** Use 'div' when the field holds several buttons (segmented controls, chips) */
  as?: 'label' | 'div';
}) {
  const Tag = as;
  return (
    <Tag className="block">
      <span className="flex items-center justify-between gap-2 mb-1.5 px-1">
        <span className="text-[13px] font-medium text-secondary">{label}</span>
        {aside}
      </span>
      {children}
      {hint && <span className="block text-[12.5px] text-tertiary mt-1.5 px-1 leading-relaxed">{hint}</span>}
    </Tag>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** Small counter bubble, e.g. pending requests */
  count?: number;
}

/** Apple-style segmented control. Used instead of on/off switches. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  full,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  size?: 'md' | 'lg';
  full?: boolean;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`segmented ${size === 'lg' ? 'segmented-lg' : ''} ${full ? 'flex w-full' : ''}`}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          data-active={value === o.value}
          onClick={() => onChange(o.value)}
          className={full ? 'flex-1' : undefined}
        >
          {o.icon}
          {o.label}
          {o.count ? (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-warning text-white text-[11px] font-bold inline-flex items-center justify-center tnum">
              {o.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-danger-ink text-[14px] bg-danger/10 rounded-2xl px-4 py-3 flex items-start gap-2 leading-relaxed">
      <AlertCircle className="w-4 h-4 shrink-0 mt-1" />
      <span>{message}</span>
    </p>
  );
}

// ───────────────────────── Display ─────────────────────────

const AVATAR_TONES = [
  'from-sky-400 to-blue-600',
  'from-violet-400 to-purple-600',
  'from-emerald-400 to-teal-600',
  'from-amber-400 to-orange-500',
  'from-pink-400 to-rose-500',
  'from-cyan-400 to-sky-600',
  'from-indigo-400 to-indigo-600',
];

/** Initials on a soft gradient. A zero-width non-joiner keeps Arabic initials as separate letters. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const words = (name || '؟').trim().split(/\s+/);
  const initials = words
    .slice(0, 2)
    .map(w => w[0])
    .join('‌');
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full bg-linear-to-br ${AVATAR_TONES[hash % AVATAR_TONES.length]} text-white font-semibold shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-[14.5px] text-secondary mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </header>
  );
}

const TILE_TONES = {
  accent: 'bg-accent/12 text-accent-ink',
  success: 'bg-success/15 text-success-ink',
  warning: 'bg-warning/15 text-warning-ink',
  violet: 'bg-violet/15 text-violet-ink',
  danger: 'bg-danger/12 text-danger-ink',
};

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'accent',
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof TILE_TONES;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-secondary">{label}</span>
        <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center ${TILE_TONES[tone]} [&>svg]:w-4 [&>svg]:h-4`}>{icon}</span>
      </div>
      <div className="mt-3">
        <div className="text-[26px] font-semibold leading-none tnum">{value}</div>
        {hint && <div className="text-[12.5px] text-tertiary mt-2">{hint}</div>}
      </div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="card card-hover p-4 text-start">
      {body}
    </button>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  bare,
}: {
  icon: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  /** Without the card wrapper, for use inside another card */
  bare?: boolean;
}) {
  return (
    <div className={`text-center px-6 ${bare ? 'py-10' : 'card py-14'}`}>
      <div className="mx-auto w-14 h-14 rounded-2xl bg-fill flex items-center justify-center text-tertiary [&>svg]:w-7 [&>svg]:h-7">{icon}</div>
      <p className="mt-4 text-[16px] font-semibold">{title}</p>
      {text && <p className="text-secondary text-[14px] mt-1 max-w-sm mx-auto leading-relaxed">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return <span aria-hidden className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

export function LoadingScreen() {
  return (
    <div className="flex-1 min-h-[70dvh] flex items-center justify-center" aria-label="جاري التحميل" role="status">
      <div className="glass-strong w-14 h-14 rounded-2xl flex items-center justify-center text-accent">
        <Spinner className="w-6 h-6" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card p-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3">
          <div className="skeleton w-12 h-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Menu ─────────────────────────

/** Small glass dropdown anchored to its trigger. Closes on outside click and Escape. */
export function Menu({
  trigger,
  children,
  align = 'end',
  width = 240,
  placement = 'bottom',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  width?: number;
  placement?: 'bottom' | 'top' | 'side';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const position =
    placement === 'side'
      ? 'bottom-0 start-full ms-3'
      : `${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} ${align === 'end' ? 'end-0' : 'start-0'}`;

  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen(v => !v) })}
      {open && (
        <div className={`absolute z-50 ${position} glass-strong rounded-[20px] p-1.5 pop`} style={{ width }} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  href,
  newTab,
  tone,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  newTab?: boolean;
  tone?: 'danger';
}) {
  const cls = `w-full flex items-center gap-3 px-3 h-10 rounded-[14px] text-[14.5px] text-start hover:bg-fill [&>svg]:w-[18px] [&>svg]:h-[18px] [&>svg]:shrink-0 ${
    tone === 'danger' ? 'text-danger-ink' : 'text-label'
  }`;
  return href ? (
    <a href={href} className={cls} role="menuitem" onClick={onClick} {...(newTab ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {icon}
      {children}
    </a>
  ) : (
    <button type="button" className={cls} role="menuitem" onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
