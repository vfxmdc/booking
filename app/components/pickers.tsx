'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DAY_SHORT, WEEK_ORDER, addDays, dayOfWeek, formatArabicDate, localDateStr, monthLabel, shiftMonth } from '@/lib/date';

/**
 * Glass dropdowns that replace the browser's native <select> list and date popup.
 * The panel is portalled to <body> with fixed positioning, so sheets with scrolling bodies never clip it.
 */

function usePopover() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const panelH = panelRef.current?.offsetHeight ?? 320;
    const up = r.bottom + panelH + 12 > window.innerHeight && r.top > panelH + 12;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: r.width, up });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!panelRef.current?.contains(n) && !triggerRef.current?.contains(n)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close only the popover, not the sheet underneath
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onMove = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place]);

  return { open, setOpen, triggerRef, panelRef, pos };
}

function Panel({
  open,
  pos: p,
  ref,
  minWidth,
  children,
  role,
}: {
  open: boolean;
  pos: { top: number; left: number; width: number; up: boolean } | null;
  ref: React.Ref<HTMLDivElement>;
  minWidth: number;
  children: ReactNode;
  role: string;
}) {
  if (!open || typeof document === 'undefined') return null;
  const width = Math.max(p?.width ?? minWidth, minWidth);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1000;
  // RTL: align the panel's right edge with the trigger's right edge, kept on screen
  const right = p ? Math.min(Math.max(8, vw - (p.left + p.width)), Math.max(8, vw - width - 8)) : 8;
  return createPortal(
    <div
      ref={ref}
      role={role}
      dir="rtl"
      className="fixed z-[120] glass-strong rounded-[20px] p-1.5 pop"
      style={{
        width,
        maxWidth: 'calc(100vw - 16px)',
        right,
        top: p ? (p.up ? undefined : p.top) : -9999,
        bottom: p && p.up ? window.innerHeight - p.top : undefined,
        visibility: p ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body
  );
}

// ───────────────────────── Select ─────────────────────────

export interface SelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  className = '',
  placeholder = 'اختر…',
  ariaLabel,
  minWidth = 200,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  minWidth?: number;
}) {
  const { open, setOpen, triggerRef, panelRef, pos } = usePopover();
  const listRef = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  // Show the chosen option when the list opens
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? listRef.current?.querySelector<HTMLElement>('button');
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus({ preventScroll: true });
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`input flex items-center justify-between gap-2 text-start cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          open ? 'border-accent/60 shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent)]' : ''
        } ${className}`}
      >
        <span className={`truncate ${current ? '' : 'text-tertiary'}`}>{current?.label ?? placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-tertiary shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <Panel open={open} pos={pos} ref={panelRef} minWidth={minWidth} role="listbox">
        <div ref={listRef} onKeyDown={onListKey} className="max-h-[min(320px,50vh)] overflow-y-auto overscroll-contain">
          {options.map(o => {
            const selected = o.value === value;
            return (
              <button
                key={String(o.value)}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`w-full flex items-center justify-between gap-3 px-3 min-h-10 py-2 rounded-[14px] text-[14.5px] text-start outline-none hover:bg-fill focus-visible:bg-fill ${
                  selected ? 'text-accent-ink font-semibold' : 'text-label'
                }`}
              >
                <span className="min-w-0">{o.label}</span>
                {selected && <Check className="w-4 h-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

// ───────────────────────── Date picker ─────────────────────────

/** Days of a month view, starting on Saturday (the clinic's week). null = padding cell. */
export function monthCells(month: string): (string | null)[] {
  const first = `${month}-01`;
  const lead = WEEK_ORDER.indexOf(dayOfWeek(first));
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  className = '',
  ariaLabel,
}: {
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { open, setOpen, triggerRef, panelRef, pos } = usePopover();
  const today = localDateStr();
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const [lastOpen, setLastOpen] = useState(false);
  // Each time it opens, start on the chosen month
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setMonth((value || today).slice(0, 7));
  }

  const allowed = (d: string) => (!min || d >= min) && (!max || d <= max);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(v => !v)}
        className={`input flex items-center justify-between gap-2 text-start cursor-pointer disabled:opacity-50 ${
          open ? 'border-accent/60 shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_16%,transparent)]' : ''
        } ${className}`}
      >
        <span className={`truncate ${value ? '' : 'text-tertiary'}`}>
          {value ? formatArabicDate(value, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'اختر التاريخ'}
        </span>
        <CalendarDays className="w-4 h-4 text-tertiary shrink-0" />
      </button>
      <Panel open={open} pos={pos} ref={panelRef} minWidth={300} role="dialog">
        <div className="p-2">
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="icon-btn w-8 h-8" aria-label="الشهر السابق" onClick={() => setMonth(m => shiftMonth(m, -1))}>
              <ChevronRight />
            </button>
            <span className="text-[14.5px] font-semibold">{monthLabel(month)}</span>
            <button type="button" className="icon-btn w-8 h-8" aria-label="الشهر التالي" onClick={() => setMonth(m => shiftMonth(m, 1))}>
              <ChevronLeft />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEK_ORDER.map(d => (
              <span key={d} className="text-[11px] text-tertiary font-medium py-1">
                {DAY_SHORT[d]}
              </span>
            ))}
            {monthCells(month).map((d, i) => {
              if (!d) return <span key={i} />;
              const selected = d === value;
              const ok = allowed(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!ok}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`h-9 rounded-xl text-[14px] tnum font-medium ${
                    selected
                      ? 'bg-accent text-white shadow-[0_6px_16px_-8px_var(--accent)]'
                      : !ok
                        ? 'text-tertiary opacity-40'
                        : d === today
                          ? 'text-accent-ink bg-accent/10 hover:bg-accent/20'
                          : 'hover:bg-fill'
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-hairline">
            <button
              type="button"
              className="btn btn-sm btn-ghost text-accent-ink"
              disabled={!allowed(today)}
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
            >
              اليوم
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
              إغلاق
            </button>
          </div>
        </div>
      </Panel>
    </>
  );
}
