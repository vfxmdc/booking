import { readDb, mutateDb, newId } from '@/lib/db';
import { handle, fail, readBody, requireAdmin, str } from '@/lib/api';
import { blockRange, weeklyHours } from '@/lib/availability';
import { isDate, isTime, toMinutes } from '@/lib/date';
import type { BlockRule, WeeklyHours } from '@/lib/types';

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const db = await readDb();
    const hours: Record<string, WeeklyHours> = {};
    for (const r of db.resources) hours[r.id] = weeklyHours(db, r.id);
    return { hours, blockRules: db.blockRules.sort((a, b) => a.startDate.localeCompare(b.startDate)) };
  });
}

/** Replaces one doctor's weekly working hours: { resourceId, days: { 0: [{start, end}], … } } */
export async function PUT(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const b = await readBody(req);
    const resourceId = str(b.resourceId);
    const days = (b.days || {}) as Record<string, { start?: unknown; end?: unknown }[]>;

    const cleaned: { day: number; start: string; end: string }[] = [];
    for (let day = 0; day < 7; day++) {
      const ranges = (Array.isArray(days[day]) ? days[day] : [])
        .map(r => ({ start: str(r.start, 5), end: str(r.end, 5) }))
        .filter(r => isTime(r.start) && isTime(r.end));
      for (const r of ranges) {
        if (toMinutes(r.start) >= toMinutes(r.end)) fail(400, `وقت البداية يجب أن يسبق وقت النهاية (${r.start} – ${r.end}).`);
      }
      ranges.sort((x, y) => x.start.localeCompare(y.start));
      for (let i = 1; i < ranges.length; i++) {
        if (ranges[i].start < ranges[i - 1].end) fail(400, `الفترات متداخلة (${ranges[i - 1].start} – ${ranges[i - 1].end}).`);
      }
      cleaned.push(...ranges.map(r => ({ day, ...r })));
    }

    const hours = await mutateDb(db => {
      if (!db.resources.some(r => r.id === resourceId)) fail(404, 'الطبيب غير موجود.');
      db.availabilityRules = db.availabilityRules.filter(r => r.resourceId !== resourceId);
      db.availabilityRules.push(
        ...cleaned.map(r => ({ id: newId('rule'), resourceId, dayOfWeek: r.day, startTime: r.start, endTime: r.end, isAvailable: true }))
      );
      return weeklyHours(db, resourceId);
    });
    return { hours };
  });
}

/** Adds a holiday / closed period: { type: 'BLOCK', resourceId, title, startDate, endDate, startTime, endTime } */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = await readBody(req);
    if (b.type !== 'BLOCK') fail(400, 'طلب غير صالح.');
    const startDate = str(b.startDate, 10);
    const endDate = str(b.endDate, 10) || startDate;
    const startTime = isTime(b.startTime) ? b.startTime : '00:00';
    const endTime = isTime(b.endTime) ? b.endTime : '23:59';
    if (!isDate(startDate) || !isDate(endDate)) fail(400, 'اختر التاريخ.');
    if (endDate < startDate) fail(400, 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية.');
    if (startDate === endDate && startTime >= endTime) fail(400, 'وقت البداية يجب أن يسبق وقت النهاية.');

    return mutateDb(db => {
      const resourceId = str(b.resourceId) || 'ALL';
      if (resourceId !== 'ALL' && !db.resources.some(r => r.id === resourceId)) fail(400, 'الطبيب غير موجود.');
      const block: BlockRule = {
        id: newId('blk'),
        resourceId,
        title: str(b.title, 80) || 'عطلة',
        startDate,
        endDate,
        startTime,
        endTime,
        createdAt: new Date().toISOString(),
      };
      db.blockRules.push(block);
      const [bs, be] = blockRange(block);
      const affected = db.bookings.filter(
        x =>
          x.status !== 'CANCELLED' &&
          (resourceId === 'ALL' || x.resourceId === resourceId) &&
          x.startDateTime < be &&
          x.endDateTime > bs
      );
      void admin;
      return { blockRule: block, affected: affected.length };
    });
  });
}
