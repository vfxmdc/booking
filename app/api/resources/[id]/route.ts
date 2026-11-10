import { mutateDb } from '@/lib/db';
import { handle, fail, readBody, requireSuper, str, int } from '@/lib/api';
import { nowIn } from '@/lib/date';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireSuper();
    const { id } = await params;
    const b = await readBody(req);
    const resource = await mutateDb(db => {
      const r = db.resources.find(x => x.id === id) ?? fail(404, 'الطبيب غير موجود.');
      if (b.name !== undefined) r.name = str(b.name, 80) || r.name;
      if (b.description !== undefined) r.description = str(b.description, 200);
      if (b.location !== undefined) r.location = str(b.location, 200);
      if (b.slotDurationMinutes !== undefined) r.slotDurationMinutes = int(b.slotDurationMinutes, r.slotDurationMinutes, 5, 240);
      if (b.price !== undefined) r.price = int(b.price, r.price, 0, 10_000_000);
      if (b.isActive !== undefined) r.isActive = Boolean(b.isActive);
      for (const booking of db.bookings) if (booking.resourceId === r.id) booking.resourceName = r.name;
      return r;
    });
    return { resource };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireSuper();
    const { id } = await params;
    return mutateDb(db => {
      if (!db.resources.some(r => r.id === id)) fail(404, 'الطبيب غير موجود.');
      if (db.resources.length === 1) fail(409, 'لا يمكن حذف الطبيب الوحيد. عدّل بياناته بدلاً من ذلك.');
      const now = nowIn(db.settings.timezone).dateTime;
      const upcoming = db.bookings.filter(b => b.resourceId === id && b.status !== 'CANCELLED' && b.startDateTime > now);
      if (upcoming.length) fail(409, `لدى هذا الطبيب ${upcoming.length} مواعيد قادمة. ألغِها أو أوقف الحجز بدلاً من الحذف.`);
      db.resources = db.resources.filter(r => r.id !== id);
      db.availabilityRules = db.availabilityRules.filter(r => r.resourceId !== id);
      db.blockRules = db.blockRules.filter(r => r.resourceId !== id);
      db.services = db.services.filter(s => s.resourceId !== id);
      return { ok: true };
    });
  });
}
