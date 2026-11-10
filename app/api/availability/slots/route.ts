import { readDb } from '@/lib/db';
import { handle, fail } from '@/lib/api';
import { getAdmin, getPatient } from '@/lib/auth';
import { durationFor, generateSlots } from '@/lib/availability';
import { isDate } from '@/lib/date';

// GET ?resourceId=&date=YYYY-MM-DD&serviceId=&exclude=<bookingId being edited>
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const resourceId = sp.get('resourceId') || '';
    const date = sp.get('date') || '';
    if (!resourceId || !isDate(date)) fail(400, 'resourceId and date are required');

    const db = await readDb();
    const resource = db.resources.find(r => r.id === resourceId);
    if (!resource) fail(404, 'الطبيب غير موجود.');
    const service = db.services.find(s => s.id === sp.get('serviceId')) ?? null;
    const isAdmin = Boolean(await getAdmin(db));
    let exclude = sp.get('exclude') || undefined;
    if (exclude && !isAdmin) {
      const patient = await getPatient(db);
      if (!patient || !db.bookings.some(b => b.id === exclude && b.clientId === patient.id)) exclude = undefined;
    }

    const result = generateSlots(db, resourceId, date, {
      duration: durationFor(resource, service),
      forAdmin: isAdmin,
      excludeBookingId: exclude,
    });
    if (!isAdmin) result.slots = result.slots.map(s => ({ ...s, bookingId: undefined }));
    return result;
  });
}
