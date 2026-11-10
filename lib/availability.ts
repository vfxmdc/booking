import type { AvailabilityRule, BlockRule, DBData, DaySummary, DayStatus, PublicDoctor, Resource, Service, TimeSlot, WeeklyHours } from './types';
import { addDays, addMinutes, dayOfWeek, fromMinutes, isDateTime, nowIn, timeOf, toMinutes } from './date';

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && aEnd > bStart;

/** A doctor's own weekly rules, or the shared ('ALL') rules if they have none. */
export function effectiveRules(db: DBData, resourceId: string): AvailabilityRule[] {
  const own = db.availabilityRules.filter(r => r.resourceId === resourceId);
  const rules = own.length ? own : db.availabilityRules.filter(r => r.resourceId === 'ALL');
  return rules.filter(r => r.isAvailable);
}

export function weeklyHours(db: DBData, resourceId: string): WeeklyHours {
  const hours: WeeklyHours = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of effectiveRules(db, resourceId)) hours[r.dayOfWeek]?.push({ start: r.startTime, end: r.endTime });
  for (const day of Object.keys(hours)) hours[Number(day)].sort((a, b) => a.start.localeCompare(b.start));
  return hours;
}

export function blockRange(b: BlockRule): [string, string] {
  const end = !b.endTime || b.endTime === '23:59' ? '24:00' : b.endTime;
  return [`${b.startDate}T${b.startTime || '00:00'}`, `${b.endDate}T${end}`];
}

export function blocksFor(db: DBData, resourceId: string) {
  return db.blockRules.filter(b => b.resourceId === 'ALL' || b.resourceId === resourceId);
}

export function publicDoctor(db: DBData, r: Resource): PublicDoctor {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    location: r.location,
    slotDurationMinutes: r.slotDurationMinutes,
    price: r.price,
    hours: weeklyHours(db, r.id),
  };
}

export function activeDoctors(db: DBData): Resource[] {
  return db.resources.filter(r => r.isActive && r.bookingMode === 'TIME_SLOT');
}

export function servicesFor(db: DBData, resourceId: string): Service[] {
  return db.services.filter(s => !s.resourceId || s.resourceId === resourceId);
}

export function durationFor(resource: Resource, service?: Service | null): number {
  return Math.max(5, Number(service?.durationMinutes) || resource.slotDurationMinutes || 30);
}

interface SlotOptions {
  duration?: number;
  excludeBookingId?: string;
  /** Staff may book right up to the current time; patients need the minimum notice. */
  forAdmin?: boolean;
}

export function generateSlots(db: DBData, resourceId: string, date: string, opts: SlotOptions = {}) {
  const resource = db.resources.find(r => r.id === resourceId);
  const result: { slots: TimeSlot[]; dayStatus: DayStatus; holidayTitle?: string } = { slots: [], dayStatus: 'OPEN' };
  if (!resource || !resource.isActive || resource.bookingMode !== 'TIME_SLOT') {
    result.dayStatus = 'CLOSED';
    return result;
  }

  const now = nowIn(db.settings.timezone);
  if (!opts.forAdmin && (date < now.date || date > addDays(now.date, db.settings.bookingWindowDays))) {
    result.dayStatus = 'OUT_OF_WINDOW';
    return result;
  }

  const step = Math.max(5, resource.slotDurationMinutes || 30);
  const duration = opts.duration || step;
  const rules = effectiveRules(db, resourceId)
    .filter(r => r.dayOfWeek === dayOfWeek(date))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (rules.length === 0) {
    result.dayStatus = 'CLOSED';
    return result;
  }

  const blocks = blocksFor(db, resourceId);
  const blockRanges = blocks.map(blockRange);
  const bookings = db.bookings.filter(
    b => b.resourceId === resourceId && b.status !== 'CANCELLED' && b.id !== opts.excludeBookingId
  );
  const cutoff = opts.forAdmin ? now.dateTime : addMinutes(now.dateTime, db.settings.minNoticeMinutes);

  const seen = new Set<number>();
  for (const rule of rules) {
    const ruleEnd = toMinutes(rule.endTime);
    for (let t = toMinutes(rule.startTime); t + duration <= ruleEnd; t += step) {
      if (seen.has(t)) continue;
      seen.add(t);
      const start = `${date}T${fromMinutes(t)}`;
      const end = `${date}T${fromMinutes(t + duration)}`;
      let reason: TimeSlot['reason'];
      let bookingId: string | undefined;
      if (blockRanges.some(([bs, be]) => overlaps(start, end, bs, be))) reason = 'BLOCKED';
      else {
        const hit = bookings.find(b => overlaps(start, end, b.startDateTime, b.endDateTime));
        if (hit) {
          reason = 'BOOKED';
          bookingId = hit.id;
        } else if (opts.forAdmin ? end <= cutoff : start < cutoff) reason = 'PAST';
      }
      result.slots.push({
        start,
        end,
        startTimeStr: fromMinutes(t),
        endTimeStr: fromMinutes(t + duration),
        isAvailable: !reason,
        reason,
        bookingId,
      });
    }
  }
  result.slots.sort((a, b) => a.start.localeCompare(b.start));

  if (result.slots.length > 0 && result.slots.every(s => s.reason === 'BLOCKED')) {
    result.dayStatus = 'HOLIDAY';
    const [dayStart, dayEnd] = [`${date}T00:00`, `${date}T24:00`];
    result.holidayTitle = blocks.find(b => overlaps(dayStart, dayEnd, ...blockRange(b)))?.title;
  }
  return result;
}

/**
 * Bookable vs. taken slots on one day, as patients see it (booking window and minimum notice apply).
 * Public: counts only, never who booked.
 */
export function daySummary(db: DBData, date: string, resourceId?: string, duration?: number): DaySummary {
  const doctors = activeDoctors(db).filter(r => !resourceId || r.id === resourceId);
  let total = 0;
  let booked = 0;
  let status: DaySummary['status'] = 'CLOSED';
  let holiday: string | undefined;
  for (const doctor of doctors) {
    const day = generateSlots(db, doctor.id, date, { duration });
    if (day.dayStatus === 'HOLIDAY') {
      holiday ??= day.holidayTitle;
      if (status === 'CLOSED') status = 'HOLIDAY';
      continue;
    }
    if (day.dayStatus !== 'OPEN') continue;
    status = 'OPEN';
    const bookable = day.slots.filter(s => s.reason !== 'BLOCKED' && s.reason !== 'PAST');
    total += bookable.length;
    booked += bookable.filter(s => s.reason === 'BOOKED').length;
  }
  return status === 'HOLIDAY' && holiday ? { date, total, booked, status, holiday } : { date, total, booked, status };
}

/** First date (from `fromDate`) that still has a free slot for patients. */
export function nextAvailable(db: DBData, resourceId: string, fromDate: string, duration?: number) {
  const now = nowIn(db.settings.timezone);
  const start = fromDate > now.date ? fromDate : now.date;
  for (let i = 0; i <= db.settings.bookingWindowDays; i++) {
    const date = addDays(start, i);
    if (date > addDays(now.date, db.settings.bookingWindowDays)) break;
    const slot = generateSlots(db, resourceId, date, { duration }).slots.find(s => s.isAvailable);
    if (slot) return { date, slot };
  }
  return null;
}

export type SlotMode = 'patient' | 'admin' | 'admin-custom';

/** Returns an Arabic error message, or null if the time can be booked. */
export function validateSlot(
  db: DBData,
  args: { resourceId: string; start: string; end: string; excludeBookingId?: string; mode: SlotMode }
): string | null {
  const { resourceId, start, end, excludeBookingId, mode } = args;
  const resource = db.resources.find(r => r.id === resourceId);
  if (!resource) return 'الطبيب غير موجود.';
  if (!resource.isActive && mode === 'patient') return 'الحجز متوقف حالياً لدى هذا الطبيب.';
  if (!isDateTime(start) || !isDateTime(end.replace('T24:00', 'T23:59')) || start >= end) return 'وقت غير صالح.';

  const now = nowIn(db.settings.timezone);
  if (mode === 'patient') {
    if (start < addMinutes(now.dateTime, db.settings.minNoticeMinutes)) return 'هذا الموعد لم يعد متاحاً للحجز.';
    if (start.slice(0, 10) > addDays(now.date, db.settings.bookingWindowDays)) {
      return `يمكن الحجز قبل ${db.settings.bookingWindowDays} يوماً كحد أقصى.`;
    }
  }

  if (mode !== 'admin-custom') {
    const s = toMinutes(timeOf(start));
    const e = start.slice(0, 10) === end.slice(0, 10) ? toMinutes(timeOf(end)) : 1440;
    const rules = effectiveRules(db, resourceId).filter(r => r.dayOfWeek === dayOfWeek(start.slice(0, 10)));
    if (!rules.some(r => s >= toMinutes(r.startTime) && e <= toMinutes(r.endTime))) {
      return 'هذا الوقت خارج أوقات العمل. استعمل "وقت مخصص" لإضافته رغم ذلك.';
    }
    const block = blocksFor(db, resourceId).find(b => overlaps(start, end, ...blockRange(b)));
    if (block) return `العيادة مغلقة في هذا الوقت (${block.title}).`;
  }

  const clash = db.bookings.find(
    b =>
      b.resourceId === resourceId &&
      b.status !== 'CANCELLED' &&
      b.id !== excludeBookingId &&
      overlaps(start, end, b.startDateTime, b.endDateTime)
  );
  if (clash) {
    return mode === 'patient'
      ? 'عذراً، تم حجز هذا الموعد للتو. اختر وقتاً آخر.'
      : `يتعارض مع موعد ${clash.clientName} (${timeOf(clash.startDateTime)} – ${timeOf(clash.endDateTime)}).`;
  }
  return null;
}
