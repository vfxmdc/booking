import { mutateDb, readDb } from '@/lib/db';
import { handle, fail, readBody, str, int } from '@/lib/api';
import { getAdmin, getPatient, rateLimited } from '@/lib/auth';
import { durationFor, generateSlots, validateSlot } from '@/lib/availability';
import { addEvent, patientChangeBlocker, patientView } from '@/lib/bookings';
import { addMinutes, isDateTime, minutesBetween, nowIn } from '@/lib/date';
import type { BookingAction, BookingStatus } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };
type Body = Record<string, unknown>;

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const db = await readDb();
    const booking = db.bookings.find(b => b.id === id);
    if (await getAdmin(db)) {
      if (!booking) fail(404, 'الموعد غير موجود.');
      return { booking };
    }
    const patient = await getPatient(db);
    if (!patient) fail(401, 'يجب تسجيل الدخول.');
    if (!booking || booking.clientId !== patient.id) fail(404, 'الموعد غير موجود.');
    return { booking: patientView(booking) };
  });
}

/** What a status change means in the appointment history. */
function statusAction(before: BookingStatus, after: BookingStatus): BookingAction | null {
  if (before === after) return null;
  if (after === 'CANCELLED') return before === 'PENDING' ? 'DECLINED' : 'CANCELLED';
  if (before === 'CANCELLED') return 'RESTORED';
  return after === 'CONFIRMED' ? 'CONFIRMED' : null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const b = await readBody(req);
    const admin = await getAdmin();
    if (!admin) return updateByPatient(id, b);

    return mutateDb(db => {
      const booking = db.bookings.find(x => x.id === id) ?? fail(404, 'الموعد غير موجود.');
      const before = {
        status: booking.status,
        start: booking.startDateTime,
        resourceId: booking.resourceId,
        attended: Boolean(booking.attended),
        noShow: Boolean(booking.noShow),
      };
      const by = { actor: 'ADMIN' as const, name: admin.name };

      if (b.status === 'CONFIRMED' || b.status === 'PENDING' || b.status === 'CANCELLED') booking.status = b.status;
      if (booking.status === 'CANCELLED' && before.status !== 'CANCELLED') booking.cancelledBy = 'ADMIN';

      // Visit outcome: { outcome: ATTENDED | NO_SHOW | NONE }, or the older { attended: boolean }
      const outcome = typeof b.outcome === 'string' ? b.outcome : b.attended !== undefined ? (b.attended ? 'ATTENDED' : 'NONE') : null;
      if (outcome === 'ATTENDED' || outcome === 'NO_SHOW' || outcome === 'NONE') {
        if (outcome !== 'NONE') {
          if (booking.status === 'CANCELLED') fail(409, 'هذا الموعد ملغى. أعد تفعيله أولاً.');
          if (booking.startDateTime.slice(0, 10) > nowIn(db.settings.timezone).date) fail(409, 'يمكن تسجيل الحضور ابتداءً من يوم الموعد.');
          if (booking.status === 'PENDING') booking.status = 'CONFIRMED';
        }
        booking.attended = outcome === 'ATTENDED';
        booking.noShow = outcome === 'NO_SHOW';
      }

      if (b.notes !== undefined) booking.notes = str(b.notes, 1000);
      if (b.price !== undefined && b.price !== '') booking.price = int(b.price, booking.price, 0, 10_000_000);

      if (b.clientId && b.clientId !== booking.clientId) {
        const client = db.clients.find(c => c.id === b.clientId) ?? fail(400, 'المريض غير موجود.');
        booking.clientId = client.id;
        booking.clientName = client.name;
        booking.clientPhone = client.phone;
      }

      const reschedule = b.start !== undefined || b.resourceId !== undefined || b.serviceId !== undefined || b.durationMinutes !== undefined;
      if (reschedule || (before.status === 'CANCELLED' && booking.status !== 'CANCELLED')) {
        const resource = db.resources.find(r => r.id === (str(b.resourceId) || booking.resourceId)) ?? fail(400, 'الطبيب غير موجود.');
        const serviceId = b.serviceId !== undefined ? str(b.serviceId) || null : booking.serviceId;
        const service = serviceId ? (db.services.find(s => s.id === serviceId) ?? null) : null;
        const start = b.start !== undefined ? str(b.start, 16) : booking.startDateTime;
        if (!isDateTime(start)) fail(400, 'وقت غير صالح.');
        const keepLength = b.durationMinutes === undefined && b.serviceId === undefined && b.resourceId === undefined;
        const duration = keepLength
          ? minutesBetween(booking.startDateTime, booking.endDateTime)
          : int(b.durationMinutes, durationFor(resource, service), 5, 480);
        const end = addMinutes(start, duration);
        if (booking.status !== 'CANCELLED') {
          const error = validateSlot(db, {
            resourceId: resource.id,
            start,
            end,
            excludeBookingId: booking.id,
            mode: b.custom ? 'admin-custom' : 'admin',
          });
          if (error) fail(409, error);
        }
        booking.resourceId = resource.id;
        booking.resourceName = resource.name;
        if (b.serviceId !== undefined) {
          booking.serviceId = service?.id ?? null;
          booking.serviceName = service?.name ?? null;
          if (b.price === undefined) booking.price = service?.price ?? resource.price;
        }
        booking.startDateTime = start;
        booking.endDateTime = end;
      }

      const action = statusAction(before.status, booking.status);
      if (action) addEvent(booking, { action, ...by });
      if (booking.startDateTime !== before.start || booking.resourceId !== before.resourceId) {
        addEvent(booking, { action: 'RESCHEDULED', ...by, from: before.start, to: booking.startDateTime });
      }
      if (booking.attended && !before.attended) addEvent(booking, { action: 'ATTENDED', ...by });
      if (booking.noShow && !before.noShow) addEvent(booking, { action: 'NO_SHOW', ...by });

      booking.updatedByAdmin = admin.name;
      booking.updatedAt = new Date().toISOString();
      return { booking };
    });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const admin = await getAdmin();
    if (!admin) return updateByPatient(id, { status: 'CANCELLED' });
    return mutateDb(db => {
      const booking = db.bookings.find(x => x.id === id) ?? fail(404, 'الموعد غير موجود.');
      if (booking.status !== 'CANCELLED') {
        const action = booking.status === 'PENDING' ? 'DECLINED' : 'CANCELLED';
        booking.status = 'CANCELLED';
        booking.cancelledBy = 'ADMIN';
        booking.updatedByAdmin = admin.name;
        addEvent(booking, { action, actor: 'ADMIN', name: admin.name });
      }
      return { booking };
    });
  });
}

/** Patients may cancel or move their own upcoming appointment, before the clinic deadline. */
async function updateByPatient(id: string, b: Body) {
  const patient = await getPatient();
  if (!patient) fail(401, 'يجب تسجيل الدخول.');

  if (b.status === 'CANCELLED') {
    return mutateDb(db => {
      const booking = db.bookings.find(x => x.id === id && x.clientId === patient.id) ?? fail(404, 'الموعد غير موجود.');
      const blocker = patientChangeBlocker(db, booking, 'cancel');
      if (blocker) fail(409, blocker);
      booking.status = 'CANCELLED';
      booking.cancelledBy = 'CLIENT';
      addEvent(booking, { action: 'CANCELLED', actor: 'CLIENT' });
      return { booking: patientView(booking) };
    });
  }

  if (typeof b.start === 'string') {
    if (rateLimited(`move:${patient.id}`, 10, 3600)) fail(429, 'محاولات كثيرة. حاول لاحقاً.');
    const start = str(b.start, 16);
    if (!isDateTime(start)) fail(400, 'اختر الوقت.');
    return mutateDb(db => {
      const booking = db.bookings.find(x => x.id === id && x.clientId === patient.id) ?? fail(404, 'الموعد غير موجود.');
      const blocker = patientChangeBlocker(db, booking, 'change');
      if (blocker) fail(409, blocker);
      if (start === booking.startDateTime) return { booking: patientView(booking) };
      const resource = db.resources.find(r => r.id === booking.resourceId && r.isActive);
      if (!resource) fail(409, 'لا يمكن تغيير هذا الموعد عبر الموقع حالياً. يرجى الاتصال بالعيادة.');
      const service = booking.serviceId ? (db.services.find(s => s.id === booking.serviceId) ?? null) : null;
      const duration = durationFor(resource, service);
      const slot = generateSlots(db, resource.id, start.slice(0, 10), { duration, excludeBookingId: booking.id }).slots.find(
        s => s.start === start
      );
      if (!slot || !slot.isAvailable) fail(409, 'هذا الوقت لم يعد متاحاً. اختر وقتاً آخر.');
      const error = validateSlot(db, { resourceId: resource.id, start, end: slot.end, excludeBookingId: booking.id, mode: 'patient' });
      if (error) fail(409, error);

      const from = booking.startDateTime;
      booking.startDateTime = start;
      booking.endDateTime = slot.end;
      booking.attended = false;
      booking.noShow = false;
      if (db.settings.requireApproval) booking.status = 'PENDING';
      addEvent(booking, { action: 'RESCHEDULED', actor: 'CLIENT', from, to: start });
      return { booking: patientView(booking) };
    });
  }

  return fail(403, 'يمكنك فقط إلغاء موعدك أو تغيير وقته.');
}
