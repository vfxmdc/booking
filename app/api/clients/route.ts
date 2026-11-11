import { readDb, mutateDb, canonPhone, generateAccessCode, newId } from '@/lib/db';
import { handle, fail, readBody, requireAdmin, str } from '@/lib/api';
import { nowIn } from '@/lib/date';
import type { Client } from '@/lib/types';

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    const db = await readDb();
    const now = nowIn(db.settings.timezone).dateTime;
    const clients = db.clients
      .map(c => {
        const visits = db.bookings.filter(b => b.clientId === c.id && b.status !== 'CANCELLED');
        const past = visits.filter(b => b.endDateTime <= now).map(b => b.startDateTime).sort();
        const upcoming = visits.filter(b => b.endDateTime > now).map(b => b.startDateTime).sort();
        // Visits whose appointments were removed by the weekly cleanup still count
        const older = c.archived ? c.archived.visits + c.archived.noShows : 0;
        return {
          ...c,
          stats: {
            visits: past.length + older,
            lastVisit: past.at(-1) ?? c.archived?.lastVisit ?? null,
            nextVisit: upcoming[0] ?? null,
            upcoming: upcoming.length,
          },
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { clients };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireAdmin();
    const b = await readBody(req);
    const name = str(b.name, 80);
    const phone = str(b.phone, 30);
    if (name.length < 2) fail(400, 'أدخل اسم المريض.');

    const client = await mutateDb(db => {
      const existing = phone && canonPhone(phone).length >= 9 ? db.clients.find(c => canonPhone(c.phone) === canonPhone(phone)) : undefined;
      if (existing) fail(409, `يوجد مريض مسجّل بهذا الرقم: ${existing.name}`);
      const created: Client = {
        id: newId('cli'),
        name,
        phone,
        email: str(b.email, 120),
        notes: str(b.notes, 2000),
        accessCode: generateAccessCode(db.clients.map(c => c.accessCode)),
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };
      db.clients.push(created);
      return created;
    });
    return { client };
  });
}
