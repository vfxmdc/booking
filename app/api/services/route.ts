import { readDb, mutateDb, newId } from '@/lib/db';
import { handle, fail, readBody, requireSuper, str, int } from '@/lib/api';
import type { Service } from '@/lib/types';

export async function GET(req: Request) {
  return handle(async () => {
    const resourceId = new URL(req.url).searchParams.get('resourceId');
    const db = await readDb();
    const services = resourceId ? db.services.filter(s => !s.resourceId || s.resourceId === resourceId) : db.services;
    return { services };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireSuper();
    const b = await readBody(req);
    const name = str(b.name, 80);
    if (name.length < 2) fail(400, 'أدخل اسم الخدمة.');
    const service = await mutateDb(db => {
      const resourceId = str(b.resourceId) || null;
      if (resourceId && !db.resources.some(r => r.id === resourceId)) fail(400, 'الطبيب غير موجود.');
      const created: Service = {
        id: newId('srv'),
        resourceId,
        name,
        durationMinutes: int(b.durationMinutes, 0, 0, 480),
        price: int(b.price, 0, 0, 10_000_000),
        description: str(b.description, 200),
        createdAt: new Date().toISOString(),
      };
      db.services.push(created);
      return created;
    });
    return { service };
  });
}
