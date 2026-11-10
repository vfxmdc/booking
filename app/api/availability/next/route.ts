import { readDb } from '@/lib/db';
import { handle, fail } from '@/lib/api';
import { durationFor, nextAvailable } from '@/lib/availability';
import { isDate, todayIn } from '@/lib/date';

// GET ?resourceId=&serviceId=&from=YYYY-MM-DD → first free appointment for patients
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const db = await readDb();
    const resource = db.resources.find(r => r.id === sp.get('resourceId') && r.isActive) ?? fail(404, 'الطبيب غير موجود.');
    const service = db.services.find(s => s.id === sp.get('serviceId')) ?? null;
    const from = sp.get('from');
    const next = nextAvailable(db, resource.id, isDate(from) ? from : todayIn(db.settings.timezone), durationFor(resource, service));
    if (!next) return { next: null };
    const { bookingId: _b, ...slot } = next.slot;
    void _b;
    return { next: { date: next.date, slot } };
  });
}
