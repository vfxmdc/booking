import { mutateDb, readDb, canonPhone, generateAccessCode } from '@/lib/db';
import { handle, fail, readBody, requireAdmin, str } from '@/lib/api';
import { nowIn } from '@/lib/date';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    const db = await readDb();
    const client = db.clients.find(c => c.id === id) ?? fail(404, 'المريض غير موجود.');
    const bookings = db.bookings
      .filter(b => b.clientId === id)
      .sort((a, b) => b.startDateTime.localeCompare(a.startDateTime));
    return { client, bookings };
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    const b = await readBody(req);

    const client = await mutateDb(db => {
      const c = db.clients.find(x => x.id === id) ?? fail(404, 'المريض غير موجود.');
      if (b.action === 'REGENERATE_CODE') {
        c.accessCode = generateAccessCode(db.clients.map(x => x.accessCode));
        return c;
      }
      if (b.name !== undefined) c.name = str(b.name, 80) || c.name;
      if (b.phone !== undefined) {
        const phone = str(b.phone, 30);
        const dup = phone && canonPhone(phone).length >= 9 && db.clients.find(x => x.id !== c.id && canonPhone(x.phone) === canonPhone(phone));
        if (dup) fail(409, `يوجد مريض آخر بهذا الرقم: ${dup.name}`);
        c.phone = phone;
      }
      if (b.email !== undefined) c.email = str(b.email, 120);
      if (b.notes !== undefined) c.notes = str(b.notes, 2000);
      if (b.status === 'ACTIVE' || b.status === 'DISABLED') c.status = b.status;
      // keep the names shown on appointments in sync
      for (const booking of db.bookings) {
        if (booking.clientId === c.id) {
          booking.clientName = c.name;
          booking.clientPhone = c.phone;
        }
      }
      void admin;
      return c;
    });
    return { client };
  });
}

/** Removes the patient and cancels their upcoming appointments; past visits stay in the history. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await params;
    return mutateDb(db => {
      if (!db.clients.some(c => c.id === id)) fail(404, 'المريض غير موجود.');
      const now = nowIn(db.settings.timezone).dateTime;
      let cancelled = 0;
      for (const b of db.bookings) {
        if (b.clientId === id && b.status !== 'CANCELLED' && b.startDateTime > now) {
          b.status = 'CANCELLED';
          b.cancelledBy = 'ADMIN';
          b.updatedByAdmin = admin.name;
          b.updatedAt = new Date().toISOString();
          cancelled++;
        }
      }
      db.clients = db.clients.filter(c => c.id !== id);
      return { ok: true, cancelled };
    });
  });
}
