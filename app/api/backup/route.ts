import { NextResponse } from 'next/server';
import { readDb } from '@/lib/db';
import { handle, requireSuper } from '@/lib/api';
import { nowIn } from '@/lib/date';

// Full data export for the doctor's own records (the session secret is left out).
export async function GET() {
  return handle(async () => {
    await requireSuper();
    const db = await readDb();
    const { meta: _meta, ...data } = db;
    void _meta;
    const stamp = nowIn(db.settings.timezone).date;
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="clinic-backup-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
