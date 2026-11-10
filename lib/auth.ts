import crypto from 'crypto';
import { cookies } from 'next/headers';
import { readDb, canonCode } from './db';
import { verifyCode } from './codes';
import type { Client, DBData, PublicStaff, Staff, StaffRole } from './types';

/**
 * Sessions are HMAC-signed, httpOnly cookies. The signing secret comes from SESSION_SECRET
 * or is generated once and stored privately in the database.
 *
 * Staff accounts live in the database. The very first super admin signs in with the
 * ADMIN_PASSWORD environment variable; after that the super admin manages all codes in the app.
 * ADMIN_RECOVERY_CODE (optional) lets you get back in as super admin if the code is forgotten.
 */

export const ADMIN_COOKIE = 'clinic_admin';
export const PATIENT_COOKIE = 'clinic_patient';
const ADMIN_MAX_AGE = 60 * 60 * 24 * 30;
const PATIENT_MAX_AGE = 60 * 60 * 24 * 180;

export interface SessionAdmin {
  id: string;
  name: string;
  role: StaffRole;
}

const hmac = (secret: string, value: string) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

async function getSecret(db?: DBData): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  return (db ?? (await readDb())).meta.secret;
}

function sign(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}

function verify<T>(token: string | undefined, secret: string): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(secret, body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (!payload.exp || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function clearCookie(name: string) {
  (await cookies()).set(name, '', cookieOptions(0));
}

const timingSafeEqualStr = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- staff ----------

export function publicStaff(s: Staff): PublicStaff {
  return { id: s.id, name: s.name, role: s.role, active: s.active, lastLoginAt: s.lastLoginAt, createdAt: s.createdAt };
}

/** True when nobody can sign in yet and ADMIN_PASSWORD may create the first super admin. */
export function needsBootstrap(db: DBData): boolean {
  return !db.staff.some(s => s.role === 'SUPER' && s.active);
}

export const bootstrapCode = () => process.env.ADMIN_PASSWORD?.trim() || '';
export const recoveryCode = () => process.env.ADMIN_RECOVERY_CODE?.trim() || '';

export function isRecoveryCode(code: string): boolean {
  const recovery = recoveryCode();
  return Boolean(recovery) && timingSafeEqualStr(recovery, code);
}

export function findStaffByCode(db: DBData, code: string): Staff | null {
  for (const s of db.staff) if (s.active && verifyCode(code, s)) return s;
  return null;
}

export async function createAdminSession(staff: Staff, db?: DBData) {
  const secret = await getSecret(db);
  const token = sign({ r: 'a', id: staff.id, v: staff.sessionVersion, exp: Math.floor(Date.now() / 1000) + ADMIN_MAX_AGE }, secret);
  (await cookies()).set(ADMIN_COOKIE, token, cookieOptions(ADMIN_MAX_AGE));
}

export async function getAdmin(db?: DBData): Promise<SessionAdmin | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const data = db ?? (await readDb());
  const payload = verify<{ r: string; id: string; v: number }>(token, await getSecret(data));
  if (!payload || payload.r !== 'a') return null;
  const staff = data.staff.find(s => s.id === payload.id);
  if (!staff || !staff.active || staff.sessionVersion !== payload.v) return null;
  return { id: staff.id, name: staff.name, role: staff.role };
}

// ---------- patients ----------

const codeFingerprint = (secret: string, code: string) => hmac(secret, `code:${canonCode(code)}`).slice(0, 16);

export async function createPatientSession(client: Client, db?: DBData) {
  const secret = await getSecret(db);
  const token = sign(
    { r: 'p', id: client.id, cv: codeFingerprint(secret, client.accessCode), exp: Math.floor(Date.now() / 1000) + PATIENT_MAX_AGE },
    secret
  );
  (await cookies()).set(PATIENT_COOKIE, token, cookieOptions(PATIENT_MAX_AGE));
}

/** Regenerating a patient's code (or disabling them) ends their sessions. */
export async function getPatient(db?: DBData): Promise<Client | null> {
  const token = (await cookies()).get(PATIENT_COOKIE)?.value;
  if (!token) return null;
  const data = db ?? (await readDb());
  const secret = await getSecret(data);
  const payload = verify<{ r: string; id: string; cv: string }>(token, secret);
  if (!payload || payload.r !== 'p') return null;
  const client = data.clients.find(c => c.id === payload.id);
  if (!client || client.status !== 'ACTIVE') return null;
  return codeFingerprint(secret, client.accessCode) === payload.cv ? client : null;
}

/** Patients only need their code; their name and phone are never sent to the patient side. */
export function publicClient(c: Client) {
  return { id: c.id, accessCode: c.accessCode };
}

// ---------- basic brute-force protection (per server instance) ----------

const rate = ((globalThis as unknown as { __clinicRate?: Map<string, { n: number; reset: number }> }).__clinicRate ??=
  new Map());

export function rateLimited(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  if (rate.size > 5000) for (const [k, v] of rate) if (v.reset < now) rate.delete(k);
  const bucket = rate.get(key);
  if (!bucket || bucket.reset < now) {
    rate.set(key, { n: 1, reset: now + windowSeconds * 1000 });
    return false;
  }
  bucket.n += 1;
  return bucket.n > limit;
}

export function ipOf(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}
