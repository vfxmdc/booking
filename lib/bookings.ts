import type { Booking, BookingEvent, DBData } from './types';
import { NOUNS, addMinutes, arCount, nowIn } from './date';

/** What a patient may see about their own booking (internal notes and history stay private). */
export function patientView(b: Booking) {
  const lastClose = b.log?.findLast(e => e.action === 'CANCELLED' || e.action === 'DECLINED');
  return {
    id: b.id,
    resourceId: b.resourceId,
    resourceName: b.resourceName,
    serviceId: b.serviceId,
    serviceName: b.serviceName,
    startDateTime: b.startDateTime,
    endDateTime: b.endDateTime,
    status: b.status,
    price: b.price,
    patientNote: b.patientNote || '',
    attended: b.attended || false,
    noShow: b.noShow || false,
    cancelledBy: b.cancelledBy,
    /** The clinic turned down this request */
    declined: b.status === 'CANCELLED' && lastClose?.action === 'DECLINED',
  };
}

export type PatientBooking = ReturnType<typeof patientView>;

/** Appends an entry to the appointment's history and bumps updatedAt. */
export function addEvent(b: Booking, event: Omit<BookingEvent, 'at'>) {
  const at = new Date().toISOString();
  b.log = [...(b.log ?? []), { at, ...event }].slice(-40);
  b.updatedAt = at;
}

/** null if the patient may still cancel or move the appointment online, otherwise the reason. */
export function patientChangeBlocker(db: DBData, b: Booking, kind: 'cancel' | 'change' = 'cancel'): string | null {
  if (b.status === 'CANCELLED') return 'هذا الموعد ملغى بالفعل.';
  if (b.attended) return 'تمت هذه الزيارة بالفعل.';
  const now = nowIn(db.settings.timezone);
  if (b.startDateTime <= now.dateTime) return 'لا يمكن تعديل موعد بدأ أو انتهى.';
  const hours = db.settings.cancelNoticeHours;
  if (addMinutes(now.dateTime, hours * 60) > b.startDateTime) {
    const what = kind === 'cancel' ? 'الإلغاء' : 'تغيير الموعد';
    return `يمكن ${what} عبر الموقع حتى ${arCount(hours, NOUNS.hour)} قبل الموعد. يرجى الاتصال بالعيادة.`;
  }
  return null;
}
