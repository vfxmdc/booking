import { readDb, mutateDb, newId } from '@/lib/db';
import { handle, fail, readBody, requireSuper, str, int } from '@/lib/api';
import { getAdmin } from '@/lib/auth';
import { activeDoctors, effectiveRules, publicDoctor } from '@/lib/availability';
import type { Resource } from '@/lib/types';

export async function GET() {
  return handle(async () => {
    const db = await readDb();
    if (await getAdmin()) return { resources: db.resources };
    return { resources: activeDoctors(db).map(r => publicDoctor(db, r)) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireSuper();
    const b = await readBody(req);
    const name = str(b.name, 80);
    if (name.length < 2) fail(400, 'أدخل اسم الطبيب.');

    const resource = await mutateDb(db => {
      const created: Resource = {
        id: newId('res'),
        name,
        category: 'DOCTOR',
        bookingMode: 'TIME_SLOT',
        slotDurationMinutes: int(b.slotDurationMinutes, 30, 5, 240),
        price: int(b.price, 0, 0, 10_000_000),
        priceUnit: 'per_slot',
        description: str(b.description, 200),
        location: str(b.location, 200),
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      // start with the same working hours as the first doctor
      const template = db.resources[0] ? effectiveRules(db, db.resources[0].id) : [];
      db.availabilityRules.push(...template.map((r, i) => ({ ...r, id: newId(`rule${i}`), resourceId: created.id })));
      db.resources.push(created);
      return created;
    });
    return { resource };
  });
}
