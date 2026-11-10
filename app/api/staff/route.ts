import { readDb, mutateDb, createStaff } from '@/lib/db';
import { handle, fail, readBody, requireSuper, str } from '@/lib/api';
import { publicStaff } from '@/lib/auth';
import { MIN_CODE_LENGTH, verifyCode } from '@/lib/codes';
import type { DBData, StaffRole } from '@/lib/types';

export function checkNewCode(db: DBData, code: string, exceptId?: string) {
  if (code.length < MIN_CODE_LENGTH) fail(400, `الرمز يجب أن يتكون من ${MIN_CODE_LENGTH} أحرف أو أرقام على الأقل.`);
  if (db.staff.some(s => s.id !== exceptId && verifyCode(code, s))) fail(409, 'هذا الرمز مستعمل من طرف مسؤول آخر. اختر رمزاً مختلفاً.');
}

export async function GET() {
  return handle(async () => {
    const me = await requireSuper();
    const db = await readDb();
    return { staff: db.staff.map(publicStaff), me: me.id };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireSuper();
    const b = await readBody(req);
    const name = str(b.name, 60);
    const code = str(b.code, 64);
    const role: StaffRole = b.role === 'SUPER' ? 'SUPER' : 'ADMIN';
    if (name.length < 2) fail(400, 'أدخل اسم المسؤول.');

    const staff = await mutateDb(db => {
      checkNewCode(db, code);
      const created = createStaff(name, role, code);
      db.staff.push(created);
      return publicStaff(created);
    });
    return { staff };
  });
}
