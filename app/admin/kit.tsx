'use client';

import { useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight, Globe, MessageSquareText, Phone, Search, StickyNote } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useAdmin } from './admin-context';
import { StateBadge, STATE_META, appointmentMessage, visitState } from '@/app/components/status';
import { api, telLink, whatsappLink } from '@/lib/web';
import { formatArabicDate, formatMoney, timeOf } from '@/lib/date';
import type { Booking } from '@/lib/types';

type Outcome = 'NONE' | 'ATTENDED' | 'NO_SHOW';

/** Confirm / decline / cancel / attendance with toasts, undo and a refresh of every open page. */
export function useBookingActions() {
  const { settings, toast, confirm } = useApp();
  const { refresh } = useAdmin();

  const send = useCallback(
    (id: string, body: Record<string, unknown>) =>
      api<{ booking: Booking }>(`/api/bookings/${id}`, { method: 'PATCH', body }).then(r => r.booking),
    []
  );

  const attempt = useCallback(
    async (fn: () => Promise<Booking>): Promise<Booking | null> => {
      try {
        return await fn();
      } catch (err) {
        toast((err as Error).message, 'error');
        return null;
      } finally {
        refresh();
      }
    },
    [toast, refresh]
  );

  const restore = useCallback(
    (id: string, status: Booking['status']) =>
      attempt(async () => {
        const b = await send(id, { status, custom: true });
        toast('تمت استعادة الموعد');
        return b;
      }),
    [attempt, send, toast]
  );

  const confirmBooking = useCallback(
    (b: Booking) =>
      attempt(async () => {
        const u = await send(b.id, { status: 'CONFIRMED' });
        toast(
          `تم تأكيد موعد ${u.clientName}`,
          u.clientPhone
            ? {
                action: {
                  label: 'إبلاغ عبر واتساب',
                  onClick: () => window.open(whatsappLink(u.clientPhone, appointmentMessage(u, settings)), '_blank', 'noopener'),
                },
              }
            : undefined
        );
        return u;
      }),
    [attempt, send, toast, settings]
  );

  const declineBooking = useCallback(
    async (b: Booking) => {
      const ok = await confirm({
        title: 'رفض طلب الموعد؟',
        message: `${b.clientName} · ${formatArabicDate(b.startDateTime.slice(0, 10))} ${timeOf(b.startDateTime)}\nسيظهر للمريض أن الطلب لم يُقبل، ويصبح الوقت متاحاً من جديد.`,
        confirmLabel: 'رفض الطلب',
        tone: 'danger',
      });
      if (!ok) return null;
      return attempt(async () => {
        const u = await send(b.id, { status: 'CANCELLED' });
        toast('تم رفض الطلب', { action: { label: 'تراجع', onClick: () => void restore(b.id, 'PENDING') } });
        return u;
      });
    },
    [attempt, confirm, restore, send, toast]
  );

  const setOutcome = useCallback(
    (b: Booking, outcome: Outcome) =>
      attempt(async () => {
        const u = await send(b.id, { outcome });
        if (outcome === 'ATTENDED') {
          toast(`تم تسجيل حضور ${b.clientName}`, {
            action: { label: 'تراجع', onClick: () => void attempt(() => send(b.id, { outcome: 'NONE' })) },
          });
        }
        return u;
      }),
    [attempt, send, toast]
  );

  return { confirmBooking, declineBooking, setOutcome };
}

/** ‹ Today › pill. In RTL, "previous" points right. */
export function DateStepper({
  onPrev,
  onNext,
  onToday,
  todayLabel = 'اليوم',
  todayDisabled,
  prevLabel = 'السابق',
  nextLabel = 'التالي',
}: {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  todayLabel?: string;
  todayDisabled?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}) {
  return (
    <div className="glass rounded-full p-1 flex items-center">
      <button type="button" onClick={onPrev} className="icon-btn !w-9 !h-9" aria-label={prevLabel} title={prevLabel}>
        <ChevronRight />
      </button>
      <button
        type="button"
        onClick={onToday}
        disabled={todayDisabled}
        className="h-9 px-3.5 rounded-full text-[14px] font-semibold hover:bg-fill disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {todayLabel}
      </button>
      <button type="button" onClick={onNext} className="icon-btn !w-9 !h-9" aria-label={nextLabel} title={nextLabel}>
        <ChevronLeft />
      </button>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 text-tertiary absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="input h-10 rounded-full ps-10 text-[14px]"
      />
    </div>
  );
}

/** Matches a booking against a name / phone query. */
export function matchesQuery(b: Booking, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    b.clientName.toLowerCase().includes(q) ||
    (b.serviceName || '').toLowerCase().includes(q) ||
    (digits.length >= 3 && (b.clientPhone || '').replace(/\D/g, '').includes(digits))
  );
}

/** One appointment in a list: time, patient, visit type and quick actions. */
export function BookingRow({
  booking: b,
  now,
  today,
  highlight,
  busy,
  onOpen,
  onConfirm,
  onToggleAttended,
}: {
  booking: Booking;
  /** Clinic "now", "YYYY-MM-DDTHH:mm" */
  now: string;
  today: string;
  highlight?: boolean;
  busy?: boolean;
  onOpen: () => void;
  onConfirm?: () => void;
  onToggleAttended?: () => void;
}) {
  const state = visitState(b, now);
  const cancelled = state === 'CANCELLED';
  const canRecord = !cancelled && b.startDateTime.slice(0, 10) <= today;
  const dim = cancelled || state === 'DONE' || state === 'NO_SHOW';

  return (
    <div className={`row flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 ${highlight ? 'bg-accent/[0.06]' : ''}`}>
      <button type="button" onClick={onOpen} className={`flex-1 min-w-0 flex items-start gap-3 sm:gap-4 text-start ${dim ? 'opacity-60' : ''}`}>
        <div className="w-[50px] shrink-0 text-center pt-0.5">
          <div className="text-[16px] font-semibold tnum leading-tight">{timeOf(b.startDateTime)}</div>
          <div className="text-[12px] text-tertiary tnum">{timeOf(b.endDateTime)}</div>
        </div>
        <span className={`w-[3px] self-stretch rounded-full shrink-0 ${STATE_META[state].bar}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[15.5px] font-semibold ${cancelled ? 'line-through' : ''}`}>{b.clientName}</span>
            <StateBadge state={state} />
            {b.source === 'CLIENT' && <Globe className="w-3.5 h-3.5 text-tertiary" aria-label="حجز عبر الموقع" />}
          </div>
          <div className="text-[13px] text-secondary mt-0.5 flex flex-wrap gap-x-2">
            <span>{b.serviceName || 'موعد'}</span>
            <span className="text-tertiary">·</span>
            <span className="tnum">{formatMoney(b.price)}</span>
            {b.clientPhone && (
              <>
                <span className="text-tertiary hidden sm:inline">·</span>
                <span className="num hidden sm:inline">{b.clientPhone}</span>
              </>
            )}
          </div>
          {b.patientNote && (
            <p className="mt-1.5 text-[13px] text-secondary flex items-start gap-1.5 leading-relaxed">
              <MessageSquareText className="w-3.5 h-3.5 mt-[3px] text-accent shrink-0" />
              {b.patientNote}
            </p>
          )}
          {b.notes && (
            <p className="mt-1 text-[13px] text-warning-ink flex items-start gap-1.5 leading-relaxed">
              <StickyNote className="w-3.5 h-3.5 mt-[3px] shrink-0" />
              {b.notes}
            </p>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1.5 shrink-0 no-print">
        {state === 'PENDING' && onConfirm ? (
          <button type="button" onClick={onConfirm} disabled={busy} className="btn btn-sm btn-tinted">
            <Check />
            تأكيد
          </button>
        ) : canRecord && onToggleAttended ? (
          <button
            type="button"
            onClick={onToggleAttended}
            disabled={busy}
            aria-pressed={Boolean(b.attended)}
            title={b.attended ? 'تراجع عن تسجيل الحضور' : 'تسجيل الحضور'}
            aria-label={b.attended ? 'تراجع عن تسجيل الحضور' : 'تسجيل الحضور'}
            className={`icon-btn ${b.attended ? 'bg-success text-white hover:!bg-success' : 'bg-success/12 text-success-ink hover:!bg-success/20'}`}
          >
            <Check />
          </button>
        ) : null}
        {b.clientPhone && !cancelled && (
          <a href={telLink(b.clientPhone)} className="icon-btn bg-fill hidden sm:inline-flex" title="اتصال" aria-label={`اتصال بـ ${b.clientName}`}>
            <Phone />
          </a>
        )}
      </div>
    </div>
  );
}

/** Floating "unsaved changes" bar for settings forms. */
export function SaveBar({
  show,
  saving,
  onSave,
  onDiscard,
  label = 'حفظ التغييرات',
}: {
  show: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  label?: string;
}) {
  if (!show) return null;
  return (
    <div className="fixed z-30 inset-x-3 bottom-[calc(max(12px,env(safe-area-inset-bottom))+74px)] md:bottom-6 md:start-[108px] md:end-6 no-print">
      <div className="max-w-[620px] mx-auto glass-strong rounded-full ps-5 pe-2 py-2 flex items-center justify-between gap-3 toast-in">
        <span className="text-[14px] font-medium truncate">لديك تغييرات غير محفوظة</span>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={onDiscard} disabled={saving} className="btn btn-sm btn-plain">
            تراجع
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="btn btn-sm btn-primary">
            {saving ? 'جاري الحفظ…' : label}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A titled glass section used on settings pages. */
export function SettingsSection({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="section-title">{title}</h2>
          {description && <p className="text-[13.5px] text-secondary mt-0.5 leading-relaxed">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
