import type { Booking, BookingEvent } from '@/lib/types';
import { formatArabicDate, timeOf } from '@/lib/date';

/** Where an appointment stands, combining status, attendance and time. */
export type VisitState = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW' | 'DONE';

type StateInput = Pick<Booking, 'status' | 'endDateTime'> & { attended?: boolean; noShow?: boolean };

export function visitState(b: StateInput, nowDateTime: string): VisitState {
  if (b.status === 'CANCELLED') return 'CANCELLED';
  if (b.attended) return 'ATTENDED';
  if (b.noShow) return 'NO_SHOW';
  if (b.status === 'PENDING') return 'PENDING';
  return b.endDateTime <= nowDateTime ? 'DONE' : 'CONFIRMED';
}

export const STATE_META: Record<VisitState, { label: string; badge: string; bar: string; block: string }> = {
  PENDING: {
    label: 'بانتظار التأكيد',
    badge: 'bg-warning/15 text-warning-ink',
    bar: 'bg-warning',
    block: 'bg-warning/15 border-warning text-label',
  },
  CONFIRMED: {
    label: 'مؤكد',
    badge: 'bg-accent/12 text-accent-ink',
    bar: 'bg-accent',
    block: 'bg-accent/14 border-accent text-label',
  },
  ATTENDED: {
    label: 'حضر',
    badge: 'bg-success/15 text-success-ink',
    bar: 'bg-success',
    block: 'bg-success/15 border-success text-label',
  },
  NO_SHOW: {
    label: 'لم يحضر',
    badge: 'bg-danger/12 text-danger-ink',
    bar: 'bg-danger',
    block: 'bg-danger/12 border-danger text-label',
  },
  CANCELLED: {
    label: 'ملغى',
    badge: 'bg-fill-strong text-secondary',
    bar: 'bg-tertiary/50',
    block: 'bg-fill border-tertiary text-secondary line-through',
  },
  DONE: {
    label: 'انتهى',
    badge: 'bg-fill-strong text-secondary',
    bar: 'bg-tertiary/50',
    block: 'bg-fill-strong border-tertiary text-label',
  },
};

export function StateBadge({ state, className = '' }: { state: VisitState; className?: string }) {
  const meta = STATE_META[state];
  return <span className={`badge badge-dot ${meta.badge} ${className}`}>{meta.label}</span>;
}

const who = (e: BookingEvent, patient: string) => (e.actor === 'CLIENT' ? patient : e.name || 'العيادة');

/** One line of an appointment's history, e.g. "أكّده د. أحمد". */
export function describeEvent(e: BookingEvent): string {
  switch (e.action) {
    case 'CREATED':
      return e.actor === 'CLIENT' ? 'حجزه المريض عبر الموقع' : `أضافه ${who(e, '')}`;
    case 'CONFIRMED':
      return `أكّده ${who(e, '')}`;
    case 'DECLINED':
      return `رفض ${who(e, '')} الطلب`;
    case 'CANCELLED':
      return e.actor === 'CLIENT' ? 'ألغاه المريض' : `ألغاه ${who(e, '')}`;
    case 'RESTORED':
      return `أعاد ${who(e, '')} تفعيله`;
    case 'RESCHEDULED': {
      const by = e.actor === 'CLIENT' ? 'غيّر المريض الموعد' : `غيّر ${who(e, '')} الموعد`;
      if (!e.from || !e.to) return by;
      const fmt = (dt: string) => `${formatArabicDate(dt.slice(0, 10), { day: 'numeric', month: 'short' })} ${timeOf(dt)}`;
      return `${by}: ${fmt(e.from)} ← ${fmt(e.to)}`;
    }
    case 'ATTENDED':
      return `سجّل ${who(e, '')} الحضور`;
    case 'NO_SHOW':
      return `سجّل ${who(e, '')} عدم الحضور`;
  }
}

/** Rows of the Excel (CSV) list of appointments, header first. Used by every appointments download. */
export function appointmentRows(list: Booking[], nowDateTime: string): (string | number)[][] {
  return [
    ['التاريخ', 'الوقت', 'المريض', 'الهاتف', 'الطبيب', 'نوع الزيارة', 'الحالة', 'السعر', 'المصدر', 'سبب الزيارة', 'ملاحظة داخلية'],
    ...list.map(b => [
      b.startDateTime.slice(0, 10),
      timeOf(b.startDateTime),
      b.clientName,
      b.clientPhone,
      b.resourceName,
      b.serviceName || '',
      STATE_META[visitState(b, nowDateTime)].label,
      b.price,
      b.source === 'CLIENT' ? 'عبر الموقع' : 'العيادة',
      b.patientNote || '',
      b.notes || '',
    ]),
  ];
}

/** Ready-to-send WhatsApp text about one appointment. */
export function appointmentMessage(
  b: Pick<Booking, 'clientName' | 'startDateTime' | 'status'>,
  clinic: { clinicName?: string; address?: string; notice?: string } | null
): string {
  const date = formatArabicDate(b.startDateTime.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' });
  const time = timeOf(b.startDateTime);
  const name = clinic?.clinicName || 'العيادة';
  const lines =
    b.status === 'CANCELLED'
      ? [`مرحباً ${b.clientName}،`, `نعتذر، تعذّر تأكيد موعدك في ${name} يوم ${date} على الساعة ${time}.`, 'يرجى التواصل معنا لاختيار وقت آخر.']
      : [
          `مرحباً ${b.clientName}،`,
          `نؤكد موعدك في ${name} يوم ${date} على الساعة ${time}.`,
          clinic?.address ? `العنوان: ${clinic.address}` : '',
          clinic?.notice || '',
        ];
  return lines.filter(Boolean).join('\n');
}
