import { readDb, mutateDb, canonPhone, generateAccessCode, newId } from '@/lib/db';
import { handle, fail, readBody, str, int } from '@/lib/api';
import { getAdmin, getPatient, rateLimited } from '@/lib/auth';
import { durationFor, generateSlots, servicesFor, validateSlot } from '@/lib/availability';
import { addEvent, patientView } from '@/lib/bookings';
import { addMinutes, isDate, isDateTime, nowIn } from '@/lib/date';
import type { Booking, Client } from '@/lib/types';

export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const db = await readDb();
    const serverTime = new Date().toISOString();
    const admin = await getAdmin();

    if (admin) {
      let list = db.bookings;
      const from = sp.get('from');
      const to = sp.get('to');
      const clientId = sp.get('clientId');
      const resourceId = sp.get('resourceId');
      const status = sp.get('status');
      const since = sp.get('since');
      if (isDate(from)) list = list.filter(b => b.startDateTime.slice(0, 10) >= from);
      if (isDate(to)) list = list.filter(b => b.startDateTime.slice(0, 10) <= to);
      if (clientId) list = list.filter(b => b.clientId === clientId);
      if (resourceId) list = list.filter(b => b.resourceId === resourceId);
      if (status) list = list.filter(b => b.status === status);
      if (since) list = list.filter(b => b.updatedAt > since);
      list.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
      return { bookings: list, serverTime };
    }

    const patient = await getPatient(db);
    if (!patient) fail(401, 'يجب تسجيل الدخول.');
    const mine = db.bookings
      .filter(b => b.clientId === patient.id)
      .sort((a, b) => b.startDateTime.localeCompare(a.startDateTime));
    return { bookings: mine.map(patientView), serverTime };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    const admin = await getAdmin();
    return admin ? createByStaff(b, admin.name) : createByPatient(b);
  });
}

/** Clinic staff: any patient (or a new one typed in), optional custom time outside working hours. */
async function createByStaff(b: Record<string, unknown>, adminName: string) {
  return mutateDb(db => {
    const resource = db.resources.find(r => r.id === str(b.resourceId)) ?? fail(400, 'اختر الطبيب.');
    const service = b.serviceId ? (db.services.find(s => s.id === b.serviceId) ?? null) : null;

    let client: Client | undefined;
    const newClient = b.newClient as { name?: unknown; phone?: unknown } | undefined;
    if (newClient) {
      const name = str(newClient.name, 80);
      const phone = str(newClient.phone, 30);
      if (name.length < 2) fail(400, 'أدخل اسم المريض.');
      client = phone ? db.clients.find(c => canonPhone(c.phone) === canonPhone(phone) && canonPhone(phone).length >= 9) : undefined;
      if (!client) {
        client = {
          id: newId('cli'),
          name,
          phone,
          email: '',
          accessCode: generateAccessCode(db.clients.map(c => c.accessCode)),
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        };
        db.clients.push(client);
      }
    } else {
      client = db.clients.find(c => c.id === str(b.clientId)) ?? fail(400, 'اختر المريض.');
    }

    const start = str(b.start, 16);
    if (!isDateTime(start)) fail(400, 'اختر التاريخ والوقت.');
    const duration = int(b.durationMinutes, durationFor(resource, service), 5, 480);
    const end = addMinutes(start, duration);
    const error = validateSlot(db, { resourceId: resource.id, start, end, mode: b.custom ? 'admin-custom' : 'admin' });
    if (error) fail(409, error);

    const now = new Date().toISOString();
    const booking: Booking = {
      id: newId('bk'),
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      resourceId: resource.id,
      resourceName: resource.name,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? null,
      bookingMode: 'TIME_SLOT',
      startDateTime: start,
      endDateTime: end,
      status: b.status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
      notes: str(b.notes, 1000),
      patientNote: '',
      price: b.price !== undefined && b.price !== '' ? int(b.price, 0, 0, 10_000_000) : (service?.price ?? resource.price),
      attended: false,
      source: 'ADMIN',
      createdByAdmin: adminName,
      createdAt: now,
      updatedAt: now,
    };
    addEvent(booking, { action: 'CREATED', actor: 'ADMIN', name: adminName });
    db.bookings.push(booking);
    return { booking, client: { id: client.id, name: client.name, accessCode: client.accessCode } };
  });
}

/** Patients: only free slots from the official grid, for themselves, within the booking rules. */
async function createByPatient(b: Record<string, unknown>) {
  const patient = await getPatient();
  if (!patient) fail(401, 'يجب تسجيل الدخول لحجز موعد.');
  if (rateLimited(`book:${patient.id}`, 10, 3600)) fail(429, 'محاولات كثيرة. حاول لاحقاً.');

  return mutateDb(db => {
    const me = db.clients.find(c => c.id === patient.id && c.status === 'ACTIVE') ?? fail(401, 'يجب تسجيل الدخول لحجز موعد.');
    const resource = db.resources.find(r => r.id === str(b.resourceId) && r.isActive) ?? fail(400, 'اختر الطبيب.');
    const options = servicesFor(db, resource.id);
    const service = b.serviceId ? (options.find(s => s.id === b.serviceId) ?? fail(400, 'نوع الزيارة غير صالح.')) : null;
    if (!service && options.length > 0) fail(400, 'اختر نوع الزيارة.');

    const start = str(b.start, 16);
    if (!isDateTime(start)) fail(400, 'اختر الوقت.');
    const duration = durationFor(resource, service);
    const slot = generateSlots(db, resource.id, start.slice(0, 10), { duration }).slots.find(s => s.start === start);
    if (!slot) fail(409, 'هذا الوقت غير متاح للحجز.');
    if (!slot.isAvailable) {
      fail(409, slot.reason === 'BOOKED' ? 'عذراً، تم حجز هذا الموعد للتو. اختر وقتاً آخر.' : 'هذا الموعد لم يعد متاحاً.');
    }
    const error = validateSlot(db, { resourceId: resource.id, start, end: slot.end, mode: 'patient' });
    if (error) fail(409, error);

    const now = nowIn(db.settings.timezone);
    const upcoming = db.bookings.filter(x => x.clientId === me.id && x.status !== 'CANCELLED' && x.endDateTime > now.dateTime);
    if (upcoming.length >= db.settings.maxUpcomingPerPatient) {
      fail(409, `لديك ${upcoming.length} مواعيد قادمة بالفعل. ألغِ موعداً منها أو اتصل بالعيادة.`);
    }

    const iso = new Date().toISOString();
    const booking: Booking = {
      id: newId('bk'),
      clientId: me.id,
      clientName: me.name,
      clientPhone: me.phone,
      resourceId: resource.id,
      resourceName: resource.name,
      serviceId: service?.id ?? null,
      serviceName: service?.name ?? null,
      bookingMode: 'TIME_SLOT',
      startDateTime: start,
      endDateTime: slot.end,
      status: db.settings.requireApproval ? 'PENDING' : 'CONFIRMED',
      notes: '',
      patientNote: str(b.patientNote, 300),
      price: service?.price ?? resource.price,
      attended: false,
      source: 'CLIENT',
      createdAt: iso,
      updatedAt: iso,
    };
    addEvent(booking, { action: 'CREATED', actor: 'CLIENT' });
    db.bookings.push(booking);
    return { booking: patientView(booking) };
  });
}
