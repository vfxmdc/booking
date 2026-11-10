import { mutateDb } from '@/lib/db';
import { handle, fail, readBody, requireSuper, str, int } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireSuper();
    const { id } = await params;
    const b = await readBody(req);
    const service = await mutateDb(db => {
      const s = db.services.find(x => x.id === id) ?? fail(404, 'الخدمة غير موجودة.');
      if (b.name !== undefined) s.name = str(b.name, 80) || s.name;
      if (b.description !== undefined) s.description = str(b.description, 200);
      if (b.durationMinutes !== undefined) s.durationMinutes = int(b.durationMinutes, s.durationMinutes, 0, 480);
      if (b.price !== undefined) s.price = int(b.price, s.price, 0, 10_000_000);
      if (b.resourceId !== undefined) {
        const resourceId = str(b.resourceId) || null;
        if (resourceId && !db.resources.some(r => r.id === resourceId)) fail(400, 'الطبيب غير موجود.');
        s.resourceId = resourceId;
      }
      return s;
    });
    return { service };
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireSuper();
    const { id } = await params;
    return mutateDb(db => {
      db.services = db.services.filter(s => s.id !== id);
      return { ok: true };
    });
  });
}
