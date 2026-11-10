import { mutateDb } from '@/lib/db';
import { handle, fail, readBody, requireSuper, str } from '@/lib/api';
import { createAdminSession, publicStaff } from '@/lib/auth';
import { hashCode } from '@/lib/codes';
import { checkNewCode } from '../route';
import type { DBData, Staff } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const activeSupers = (db: DBData, except?: string) => db.staff.filter(s => s.role === 'SUPER' && s.active && s.id !== except);

/** Super admin: rename, change role, enable/disable, or set a new code for any account (including their own). */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const me = await requireSuper();
    const { id } = await params;
    const b = await readBody(req);

    let keepMeSignedIn: Staff | null = null;
    const result = await mutateDb(db => {
      const s = db.staff.find(x => x.id === id) ?? fail(404, 'الحساب غير موجود.');

      if (b.name !== undefined) s.name = str(b.name, 60) || s.name;

      const demoting = b.role === 'ADMIN' && s.role === 'SUPER';
      const disabling = b.active === false && s.active;
      if ((demoting || disabling) && s.role === 'SUPER' && activeSupers(db, s.id).length === 0) {
        fail(409, 'يجب أن يبقى مسؤول رئيسي واحد على الأقل.');
      }
      if (b.role === 'SUPER' || b.role === 'ADMIN') s.role = b.role;
      if (b.active !== undefined) {
        if (!b.active && s.id === me.id) fail(409, 'لا يمكنك إيقاف حسابك الحالي.');
        s.active = Boolean(b.active);
        if (!s.active) s.sessionVersion += 1;
      }

      if (b.code !== undefined) {
        const code = str(b.code, 64);
        checkNewCode(db, code, s.id);
        Object.assign(s, hashCode(code));
        s.sessionVersion += 1; // signs this account out on other devices
        if (s.id === me.id) keepMeSignedIn = { ...s };
      }
      return publicStaff(s);
    });

    if (keepMeSignedIn) await createAdminSession(keepMeSignedIn);
    return { staff: result };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const me = await requireSuper();
    const { id } = await params;
    return mutateDb(db => {
      const s = db.staff.find(x => x.id === id) ?? fail(404, 'الحساب غير موجود.');
      if (s.id === me.id) fail(409, 'لا يمكنك حذف حسابك الحالي.');
      if (s.role === 'SUPER' && s.active && activeSupers(db, s.id).length === 0) fail(409, 'يجب أن يبقى مسؤول رئيسي واحد على الأقل.');
      db.staff = db.staff.filter(x => x.id !== id);
      return { ok: true };
    });
  });
}
