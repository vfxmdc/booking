import { NextResponse } from 'next/server';
import { StorageNotConfiguredError } from './db';
import { getAdmin } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}

export const STORAGE_MESSAGE =
  'لم يتم إعداد التخزين بعد، لذلك لا يمكن حفظ البيانات. أضف المتغيرين NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SECRET_KEY في إعدادات المشروع ثم أعد النشر.';

/** Runs a route body and turns errors into JSON responses. */
export async function handle(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof StorageNotConfiguredError) return NextResponse.json({ error: STORAGE_MESSAGE }, { status: 503 });
    console.error(error);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' }, { status: 500 });
  }
}

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) fail(401, 'انتهت الجلسة. سجّل الدخول من جديد.');
  return admin;
}

/** Clinic settings, prices, doctors, staff accounts and backups: super admin only. */
export async function requireSuper() {
  const admin = await requireAdmin();
  if (admin.role !== 'SUPER') fail(403, 'هذه العملية متاحة للمسؤول الرئيسي فقط.');
  return admin;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    return fail(400, 'طلب غير صالح.');
  }
}

export const str = (value: unknown, max = 200): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
