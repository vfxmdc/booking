import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilityRule, Booking, BookingEvent, Client, DBData, Settings, Staff, StaffRole } from './types';
import { DEFAULT_TZ, addDays, addMinutes, dayOfWeek, normalizeDateTime, nowIn, toMinutes } from './date';
import { hashCode } from './codes';

const SCHEMA = 2;

/**
 * Storage
 * - With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY: one JSON document in the Supabase table
 *   `clinic_db` (row level security on, no policies — only this server can read it).
 * - Otherwise, locally / on a normal server: a JSON file in .data/db.json.
 * Writes are serialized per instance and protected across instances with a version check,
 * so two people booking at the same moment can never overwrite each other.
 */

export type StorageKind = 'supabase' | 'file' | 'unconfigured';

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('STORAGE_NOT_CONFIGURED');
  }
}

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
/** Server-only secret key. Never the publishable key: this document holds patient data and secrets. */
const supabaseSecret = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function storageKind(): StorageKind {
  if (supabaseUrl() && supabaseSecret()) return 'supabase';
  if (process.env.VERCEL) return 'unconfigured'; // Vercel's filesystem is read-only
  return 'file';
}

const TABLE = 'clinic_db';
const ROW_ID = 'main';
const FILE_PATH = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(process.cwd(), '.data', 'db.json');
const READ_TTL_MS = 8000;

/** `version` is the Supabase row version the data was read at (0 for the other backends). */
type Snapshot = { data: DBData; version: number; at: number };
type State = { cache: Snapshot | null; queue: Promise<unknown>; ephemeral: DBData | null; supabase?: SupabaseClient };
const g = globalThis as unknown as { __clinicDb?: State };
const state: State = (g.__clinicDb ??= { cache: null, queue: Promise.resolve(), ephemeral: null });

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

// ---------- access codes & phones ----------

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O to avoid confusion

export const canonCode = (code: string) => (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function generateAccessCode(existing: string[]): string {
  const taken = new Set(existing.map(canonCode));
  for (;;) {
    let letters = '';
    let digits = '';
    for (let i = 0; i < 4; i++) {
      letters += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
      digits += crypto.randomInt(10);
    }
    const code = `${letters}-${digits}`;
    if (!taken.has(canonCode(code))) return code;
  }
}

export function canonPhone(phone: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('213') && digits.length === 12) digits = '0' + digits.slice(3);
  return digits;
}

// ---------- seed data ----------

export function defaultSettings(): Settings {
  return {
    clinicName: 'عيادة الطبيب',
    specialty: 'طب عام',
    phone: '',
    address: '',
    notice: 'يرجى الحضور قبل موعدك بـ 15 دقيقة. الدفع في العيادة.',
    bookingWindowDays: 30,
    minNoticeMinutes: 60,
    cancelNoticeHours: 2,
    maxUpcomingPerPatient: 2,
    requireApproval: true,
    timezone: process.env.CLINIC_TIMEZONE || DEFAULT_TZ,
  };
}

export function createStaff(name: string, role: StaffRole, code: string): Staff {
  return {
    id: newId('stf'),
    name,
    role,
    ...hashCode(code),
    sessionVersion: 1,
    active: true,
    createdAt: new Date().toISOString(),
  };
}

function createInitialData(): DBData {
  const now = new Date().toISOString();
  const doctorId = 'res-1';
  const rules: AvailabilityRule[] = [];
  // Saturday → Thursday (Friday closed), mornings + afternoons; Saturday mornings only
  for (const day of [6, 0, 1, 2, 3, 4]) {
    rules.push({ id: `rule-${day}-am`, resourceId: doctorId, dayOfWeek: day, startTime: '09:00', endTime: '12:00', isAvailable: true });
    if (day !== 6) {
      rules.push({ id: `rule-${day}-pm`, resourceId: doctorId, dayOfWeek: day, startTime: '13:00', endTime: '17:00', isAvailable: true });
    }
  }

  const data: DBData = {
    settings: defaultSettings(),
    resources: [
      {
        id: doctorId,
        name: 'الطبيب',
        category: 'DOCTOR',
        bookingMode: 'TIME_SLOT',
        slotDurationMinutes: 30,
        price: 2000,
        priceUnit: 'per_slot',
        description: 'طب عام',
        location: '',
        isActive: true,
        createdAt: now,
      },
    ],
    services: [
      { id: 'srv-1', resourceId: null, name: 'استشارة', durationMinutes: 0, price: 2000, description: 'فحص طبي كامل', createdAt: now },
      { id: 'srv-2', resourceId: null, name: 'متابعة', durationMinutes: 0, price: 1000, description: 'مراجعة بعد استشارة سابقة', createdAt: now },
    ],
    clients: [],
    availabilityRules: rules,
    blockRules: [],
    bookings: [],
    staff: [],
    meta: { secret: crypto.randomBytes(32).toString('hex'), createdAt: now, schema: SCHEMA },
  };

  // The first super admin uses the ADMIN_PASSWORD code; later codes are managed in the app.
  const bootstrap = process.env.ADMIN_PASSWORD?.trim();
  if (bootstrap) data.staff.push(createStaff(process.env.ADMIN_NAME?.trim() || 'الطبيب', 'SUPER', bootstrap));

  // Sample patients only ever go into the local file, never into a shared Supabase database
  if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO === '1' && storageKind() === 'file') addDemoData(data);
  return data;
}

/** A sample clinic with two weeks of appointments, for local previews only (never in production). */
function addDemoData(data: DBData) {
  const now = nowIn(data.settings.timezone);
  const iso = new Date().toISOString();
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

  Object.assign(data.settings, {
    clinicName: 'عيادة د. أحمد بن علي',
    specialty: 'طب عام وطب الأسرة',
    phone: '0550 12 34 56',
    address: 'حي النصر، شارع الأمير عبد القادر، البليدة',
  });
  Object.assign(data.resources[0], { name: 'د. أحمد بن علي', description: 'طب عام وطب الأسرة' });
  data.services.push({
    id: 'srv-3',
    resourceId: null,
    name: 'تخطيط القلب',
    durationMinutes: 60,
    price: 3500,
    description: 'فحص كهربائية القلب مع التقرير',
    createdAt: iso,
  });
  data.staff.push(createStaff('الاستقبال', 'ADMIN', '111111'));

  const people = [
    ['أمينة بلقاسم', '0550 12 34 56'],
    ['يوسف حداد', '0661 23 45 67'],
    ['سارة مرابط', '0770 34 56 78'],
    ['كريم بوزيد', '0555 45 67 89'],
    ['ليلى عمراني', '0699 56 78 90'],
    ['محمد سعيدي', '0662 67 89 01'],
    ['نادية شريف', '0771 78 90 12'],
    ['عمر بن يحيى', '0556 89 01 23'],
    ['خديجة زروقي', '0697 90 12 34'],
    ['رياض مسعودي', '0663 01 23 45'],
  ];
  const clients: Client[] = people.map(([name, phone], i) => ({
    id: `cli-demo-${i + 1}`,
    name,
    phone,
    email: '',
    accessCode: generateAccessCode(data.clients.map(c => c.accessCode)),
    status: 'ACTIVE',
    notes: i === 3 ? 'حساسية من البنسلين' : i === 6 ? 'ضغط دم مرتفع، يتابع العلاج' : undefined,
    createdAt: iso,
  }));
  data.clients.push(...clients);

  const reasons = ['صداع متكرر منذ أسبوع', 'تحاليل الدم جاهزة', 'متابعة ضغط الدم', 'سعال وحمى خفيفة', 'تجديد وصفة الدواء'];
  const morning = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'];
  const afternoon = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];
  const service = (id: string) => data.services.find(s => s.id === id)!;
  let n = 0;

  for (let offset = -6; offset <= 7; offset++) {
    const date = addDays(now.date, offset);
    const dow = dayOfWeek(date);
    if (dow === 5) continue; // Friday: closed
    const times = dow === 6 ? morning : [...morning, ...afternoon];
    const count = Math.min(times.length, offset === 0 ? 8 : Math.abs(offset) === 1 ? 6 : 3 + ((offset + 9) % 3));
    let busyUntil = '';

    for (let i = 0; i < count; i++) {
      const time = times[Math.floor((i * times.length) / count)];
      const start = `${date}T${time}`;
      if (start < busyUntil) continue;
      n++;
      // a one-hour ECG only where it fits inside the same working period
      const long = n % 7 === 0 && ['09:00', '10:00', '13:00', '14:00', '15:00'].includes(time);
      const srv = service(long ? 'srv-3' : n % 4 === 0 ? 'srv-2' : 'srv-1');
      const end = addMinutes(start, srv.durationMinutes || 30);
      busyUntil = end;

      const client = clients[(n * 3 + offset + 20) % clients.length];
      const past = end <= now.dateTime;
      const online = n % 3 !== 0;
      const pending = !past && online && (offset > 0 ? n % 4 === 1 : offset === 0 && toMinutes(time) > now.minutes + 120 && n % 3 === 1);
      const cancelled = n % 11 === 0;
      const noShow = past && !cancelled && n % 9 === 0;
      const createdAt = pending ? hoursAgo(1 + (n % 9)) : hoursAgo(24 * (2 + (n % 5)) + Math.max(0, -offset) * 24);

      const log: BookingEvent[] = [{ at: createdAt, action: 'CREATED', actor: online ? 'CLIENT' : 'ADMIN', name: online ? undefined : 'الاستقبال' }];
      if (online && !pending) log.push({ at: createdAt, action: 'CONFIRMED', actor: 'ADMIN', name: data.resources[0].name });
      if (cancelled) log.push({ at: createdAt, action: 'CANCELLED', actor: online ? 'CLIENT' : 'ADMIN', name: online ? undefined : 'الاستقبال' });
      else if (past) log.push({ at: iso, action: noShow ? 'NO_SHOW' : 'ATTENDED', actor: 'ADMIN', name: data.resources[0].name });

      const booking: Booking = {
        id: `bk-demo-${n}`,
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        resourceId: 'res-1',
        resourceName: data.resources[0].name,
        serviceId: srv.id,
        serviceName: srv.name,
        bookingMode: 'TIME_SLOT',
        startDateTime: start,
        endDateTime: end,
        status: cancelled ? 'CANCELLED' : pending ? 'PENDING' : 'CONFIRMED',
        notes: n % 6 === 0 ? 'يحضر نتائج التحاليل' : '',
        patientNote: online && n % 2 === 0 ? reasons[n % reasons.length] : '',
        price: srv.price,
        attended: past && !cancelled && !noShow,
        noShow,
        source: online ? 'CLIENT' : 'ADMIN',
        cancelledBy: cancelled ? (online ? 'CLIENT' : 'ADMIN') : undefined,
        createdAt,
        updatedAt: log[log.length - 1].at,
        log,
      };
      data.bookings.push(booking);
    }
  }
}

// ---------- normalisation (also migrates older data files) ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalize(raw: any): { data: DBData; migrated: boolean } {
  const settings: Settings = { ...defaultSettings(), ...(raw?.settings || {}) };
  let migrated = !raw?.settings;
  if ('allowSelfSignup' in settings) {
    delete (settings as any).allowSelfSignup; // patient self-registration was removed
    migrated = true;
  }
  const bookings: Booking[] = (raw?.bookings || []).map((b: any) => {
    const start = normalizeDateTime(b.startDateTime, settings.timezone);
    const end = normalizeDateTime(b.endDateTime, settings.timezone);
    if (start !== b.startDateTime || end !== b.endDateTime) migrated = true;
    return { ...b, startDateTime: start, endDateTime: end, notes: b.notes || '' };
  });
  let meta = raw?.meta;
  if (!meta?.secret) {
    meta = { secret: crypto.randomBytes(32).toString('hex'), createdAt: new Date().toISOString() };
    migrated = true;
  }

  const resources = raw?.resources || [];
  let services = raw?.services || [];
  if ((meta.schema || 1) < SCHEMA) {
    // v2: visit types that matched the doctor's slot length now simply follow it
    const slotLengths = new Set(resources.map((r: any) => r.slotDurationMinutes));
    services = services.map((s: any) => (slotLengths.has(s.durationMinutes) ? { ...s, durationMinutes: 0 } : s));
    meta = { ...meta, schema: SCHEMA };
    migrated = true;
  }

  return {
    data: {
      settings,
      resources,
      services,
      clients: raw?.clients || [],
      availabilityRules: raw?.availabilityRules || [],
      blockRules: raw?.blockRules || [],
      bookings,
      staff: raw?.staff || [],
      meta,
    },
    migrated,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- backends ----------

async function writeFile(data: DBData) {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  const tmp = `${FILE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fs.rename(tmp, FILE_PATH);
  } catch {
    await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rm(tmp, { force: true });
  }
}

function supabase(): SupabaseClient {
  return (state.supabase ??= createClient(supabaseUrl(), supabaseSecret(), {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** Thrown when another instance saved first; the caller reloads and tries again. */
class VersionConflictError extends Error {}

/** Saves the document only if the row is still at `version`; returns the new version. */
async function saveRow(data: DBData, version: number): Promise<number> {
  const { data: rows, error } = await supabase()
    .from(TABLE)
    .update({ data, version: version + 1, updated_at: new Date().toISOString() })
    .eq('id', ROW_ID)
    .eq('version', version)
    .select('version');
  if (error) throw new Error(`Supabase: ${error.message}`);
  if (!rows?.length) throw new VersionConflictError();
  return Number(rows[0].version);
}

async function load(fresh: boolean, attempt = 0): Promise<Snapshot> {
  const kind = storageKind();

  if (kind === 'unconfigured') {
    state.ephemeral ??= createInitialData();
    return { data: state.ephemeral, version: 0, at: Date.now() };
  }

  if (kind === 'file') {
    try {
      const { data, migrated } = normalize(JSON.parse(await fs.readFile(FILE_PATH, 'utf-8')));
      if (migrated) await writeFile(data);
      return { data, version: 0, at: Date.now() };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      const seed = createInitialData();
      await writeFile(seed);
      return { data: seed, version: 0, at: Date.now() };
    }
  }

  // Supabase
  if (!fresh && state.cache && Date.now() - state.cache.at < READ_TTL_MS) return state.cache;
  const { data: row, error } = await supabase().from(TABLE).select('data, version').eq('id', ROW_ID).maybeSingle();
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') {
      throw new Error(`Supabase: table "${TABLE}" not found. Run supabase/schema.sql once in the Supabase SQL Editor.`);
    }
    throw new Error(`Supabase: ${error.message}`);
  }

  if (!row) {
    // First run: create the document
    const seed = createInitialData();
    const { error: insertError } = await supabase().from(TABLE).insert({ id: ROW_ID, data: seed, version: 1 });
    if (insertError) {
      if (insertError.code === '23505' && attempt < 2) return load(true, attempt + 1); // created by another instance
      throw new Error(`Supabase: ${insertError.message}`);
    }
    state.cache = { data: seed, version: 1, at: Date.now() };
    return state.cache;
  }

  const { data, migrated } = normalize(row.data);
  let version = Number(row.version);
  if (migrated) {
    try {
      version = await saveRow(data, version);
    } catch (e) {
      if (e instanceof VersionConflictError && attempt < 2) return load(true, attempt + 1);
      throw e;
    }
  }
  state.cache = { data, version, at: Date.now() };
  return state.cache;
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = state.queue.then(fn, fn);
  state.queue = run.catch(() => undefined);
  return run;
}

/** Read-only snapshot (a copy — safe to sort/filter). */
export async function readDb(): Promise<DBData> {
  const snap = await load(false);
  return structuredClone(snap.data);
}

/**
 * Applies a change atomically. `fn` receives a fresh copy, may throw to abort,
 * and may run more than once if another instance wrote at the same time.
 */
export function mutateDb<T>(fn: (db: DBData) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const kind = storageKind();
    if (kind === 'unconfigured') throw new StorageNotConfiguredError();

    for (let attempt = 0; ; attempt++) {
      const snap = await load(true);
      const draft = structuredClone(snap.data);
      const result = await fn(draft);

      if (kind === 'file') {
        await writeFile(draft);
        return result;
      }
      try {
        const version = await saveRow(draft, snap.version);
        state.cache = { data: draft, version, at: Date.now() };
        return result;
      } catch (error) {
        if (error instanceof VersionConflictError && attempt < 4) {
          state.cache = null;
          continue;
        }
        throw error;
      }
    }
  });
}
