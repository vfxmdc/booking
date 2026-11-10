import { readDb, mutateDb, createStaff, StorageNotConfiguredError } from '@/lib/db';
import { handle, fail, readBody, str } from '@/lib/api';
import {
  bootstrapCode,
  createAdminSession,
  findStaffByCode,
  ipOf,
  isRecoveryCode,
  needsBootstrap,
  rateLimited,
} from '@/lib/auth';
import type { DBData, Staff } from '@/lib/types';

/** Finds (or, on first run / recovery, creates) the staff account for a code. */
function resolveStaff(db: DBData, code: string, allowCreate: boolean): Staff | null {
  const found = findStaffByCode(db, code);
  if (found) return found;

  const boot = bootstrapCode();
  if (boot && code === boot && needsBootstrap(db)) {
    if (!allowCreate) return { id: '__new__' } as Staff;
    const created = createStaff(process.env.ADMIN_NAME?.trim() || 'الطبيب', 'SUPER', code);
    db.staff.push(created);
    return created;
  }

  if (isRecoveryCode(code)) {
    const superAdmin = db.staff.find(s => s.role === 'SUPER' && s.active);
    if (superAdmin) return superAdmin;
    if (!allowCreate) return { id: '__new__' } as Staff;
    const created = createStaff('المسؤول الرئيسي', 'SUPER', code);
    db.staff.push(created);
    return created;
  }
  return null;
}

export async function POST(req: Request) {
  return handle(async () => {
    if (rateLimited(`admin-login:${ipOf(req)}`, 8, 600)) fail(429, 'محاولات كثيرة. انتظر 10 دقائق ثم حاول مجدداً.');

    const b = await readBody(req);
    const code = str(b.code ?? b.password, 200);
    if (!code) fail(400, 'أدخل رمز الدخول.');

    const db = await readDb();
    if (!resolveStaff(db, code, false)) {
      await new Promise(r => setTimeout(r, 500));
      if (db.staff.length === 0 && !bootstrapCode()) {
        fail(503, 'لم يتم إنشاء حساب المسؤول بعد. أضف المتغير ADMIN_PASSWORD في إعدادات Vercel ثم أعد النشر.');
      }
      fail(401, 'رمز الدخول غير صحيح.');
    }

    let staff: Staff | null;
    try {
      staff = await mutateDb(d => {
        const s = resolveStaff(d, code, true);
        if (s) s.lastLoginAt = new Date().toISOString();
        return s;
      });
    } catch (error) {
      if (!(error instanceof StorageNotConfiguredError)) throw error;
      staff = findStaffByCode(db, code); // storage not connected yet: sign in without saving
    }
    if (!staff) fail(401, 'رمز الدخول غير صحيح.');

    await createAdminSession(staff);
    return { admin: { id: staff.id, name: staff.name, role: staff.role } };
  });
}
