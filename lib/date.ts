/**
 * Time helpers shared by server and browser.
 *
 * All appointment times are stored as clinic wall-clock strings
 * ("YYYY-MM-DDTHH:mm", no timezone). "Now" is always computed in the clinic
 * timezone, so the app behaves the same on a Vercel server (UTC) and on a PC.
 */

export const DEFAULT_TZ = 'Africa/Algiers';

export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const DAY_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
/** Display order for the week: Saturday first */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function safeTz(tz?: string): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

function wallClock(date: Date, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

export function nowIn(tz?: string) {
  const { date, time } = wallClock(new Date(), tz || DEFAULT_TZ);
  return { date, time, dateTime: `${date}T${time}`, minutes: toMinutes(time) };
}

export function todayIn(tz?: string): string {
  return nowIn(tz).date;
}

/** Browser-local YYYY-MM-DD */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function parseDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(dateStr: string, days: number): string {
  return new Date(parseDate(dateStr) + days * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function dayOfWeek(dateStr: string): number {
  return new Date(parseDate(dateStr)).getUTCDay();
}

export function datePart(dateTime: string): string {
  return dateTime.slice(0, 10);
}

/** "2026-11-06T10:30" → "10:30" */
export function timeOf(dateTime: string): string {
  return dateTime.slice(11, 16);
}

export function minutesOf(dateTime: string): number {
  return toMinutes(timeOf(dateTime));
}

export function addMinutes(dateTime: string, minutes: number): string {
  let date = datePart(dateTime);
  let total = minutesOf(dateTime) + minutes;
  while (total >= 1440) {
    total -= 1440;
    date = addDays(date, 1);
  }
  while (total < 0) {
    total += 1440;
    date = addDays(date, -1);
  }
  return `${date}T${fromMinutes(total)}`;
}

export const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(`${s}T00:00:00Z`));
export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isDateTime = (s: unknown): s is string =>
  typeof s === 'string' && s.length === 16 && isDate(s.slice(0, 10)) && s[10] === 'T' && isTime(s.slice(11));

/** Converts legacy ISO strings ("…Z") to clinic wall-clock time; trims seconds. */
export function normalizeDateTime(value: string, tz?: string): string {
  if (!value) return value;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      const w = wallClock(d, tz || DEFAULT_TZ);
      return `${w.date}T${w.time}`;
    }
  }
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return m ? `${m[1]}T${m[2]}` : value;
}

export function formatArabicDate(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }
): string {
  return new Intl.DateTimeFormat('ar-DZ', { ...opts, timeZone: 'UTC' }).format(new Date(parseDate(dateStr)));
}

/** "اليوم" / "غداً" / "أمس" or a full Arabic date */
export function relativeDay(dateStr: string, today: string): string {
  const diff = daysBetween(today, dateStr);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غداً';
  if (diff === -1) return 'أمس';
  return formatArabicDate(dateStr);
}

export function formatMoney(amount: number): string {
  return `${Number(amount || 0).toLocaleString('fr-DZ')} دج`;
}

/** Saturday on or before the date (the clinic week starts on Saturday). */
export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, -((dayOfWeek(dateStr) + 1) % 7));
}

/** Minutes from one wall-clock time to another (may span days). */
export function minutesBetween(from: string, to: string): number {
  return daysBetween(datePart(from), datePart(to)) * 1440 + minutesOf(to) - minutesOf(from);
}

/** "2026-11" → "نوفمبر 2026" */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('ar-DZ', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`)
  );
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

// ---------- Arabic counting ----------

export interface NounForms {
  /** "موعد واحد" */
  one: string;
  /** "موعدان" */
  two: string;
  /** 3–10: "مواعيد" */
  few: string;
  /** 11–99: "موعداً" */
  many: string;
  /** 0, 100, 101…: "موعد" */
  other: string;
}

const pluralRules = new Intl.PluralRules('ar');

/** Grammatical Arabic count: 1 → "موعد واحد", 2 → "موعدان", 5 → "5 مواعيد", 12 → "12 موعداً". */
export function arCount(n: number, forms: NounForms): string {
  switch (pluralRules.select(n)) {
    case 'one':
      return forms.one;
    case 'two':
      return forms.two;
    case 'few':
      return `${n} ${forms.few}`;
    case 'many':
      return `${n} ${forms.many}`;
    default:
      return `${n} ${forms.other}`;
  }
}

export const NOUNS = {
  appointment: { one: 'موعد واحد', two: 'موعدان', few: 'مواعيد', many: 'موعداً', other: 'موعد' },
  request: { one: 'طلب واحد', two: 'طلبان', few: 'طلبات', many: 'طلباً', other: 'طلب' },
  patient: { one: 'مريض واحد', two: 'مريضان', few: 'مرضى', many: 'مريضاً', other: 'مريض' },
  visit: { one: 'زيارة واحدة', two: 'زيارتان', few: 'زيارات', many: 'زيارة', other: 'زيارة' },
  day: { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً', other: 'يوم' },
  hour: { one: 'ساعة واحدة', two: 'ساعتان', few: 'ساعات', many: 'ساعة', other: 'ساعة' },
  minute: { one: 'دقيقة واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة', other: 'دقيقة' },
  freeSlot: { one: 'موعد متاح', two: 'موعدان متاحان', few: 'مواعيد متاحة', many: 'موعداً متاحاً', other: 'موعد متاح' },
  update: { one: 'تحديث جديد', two: 'تحديثان جديدان', few: 'تحديثات جديدة', many: 'تحديثاً جديداً', other: 'تحديث جديد' },
} satisfies Record<string, NounForms>;

/** 30 → "30 دقيقة", 60 → "ساعة", 90 → "ساعة و30 دقيقة" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return arCount(m, NOUNS.minute);
  const hours = h === 1 ? 'ساعة' : arCount(h, NOUNS.hour);
  return m ? `${hours} و${arCount(m, NOUNS.minute)}` : hours;
}
