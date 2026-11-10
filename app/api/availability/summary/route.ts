import { readDb } from '@/lib/db';
import { handle, fail } from '@/lib/api';
import { daySummary, durationFor } from '@/lib/availability';
import { addDays, daysBetween, isDate } from '@/lib/date';

// GET ?month=YYYY-MM  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD  [&resourceId=&serviceId=]
// Public: only counts (booked / total slots per day), never patient data.
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    let from = sp.get('from') || '';
    let to = sp.get('to') || '';
    const month = sp.get('month');
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      from = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    }
    if (!isDate(from) || !isDate(to) || to < from) fail(400, 'month or from/to required');
    if (daysBetween(from, to) > 62) fail(400, 'range too large');

    const db = await readDb();
    const resourceId = sp.get('resourceId') || undefined;
    const resource = resourceId ? db.resources.find(r => r.id === resourceId) : undefined;
    const service = db.services.find(s => s.id === sp.get('serviceId')) ?? null;
    const duration = resource ? durationFor(resource, service) : undefined;
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(daySummary(db, d, resourceId, duration));
    return { days };
  });
}
