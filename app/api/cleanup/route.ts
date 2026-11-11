import { mutateDb, readDb, readExtra, writeExtra } from '@/lib/db';
import { handle, fail, readBody, requireAdmin, str, int } from '@/lib/api';
import { LAST_CLEANUP_DOC, batchOf, cleanupNotice, deleteBatch, runCleanup } from '@/lib/cleanup';
import { nowIn } from '@/lib/date';
import type { CleanupCopy } from '@/lib/types';

const saveCopy = (copy: CleanupCopy) => writeExtra(LAST_CLEANUP_DOC, copy);
const SUPER_ONLY = 'هذه العملية متاحة للمسؤول الرئيسي فقط.';
const LIST_CHANGED = 'تغيّرت قائمة المواعيد القديمة. نزّل القائمة من جديد ثم أعد المحاولة.';

// GET             → the batch waiting to be deleted (if any) and the last deletion
// GET ?list=batch → the appointments in that batch, for the staff to download
// GET ?list=last  → the last deleted appointments, kept until the next cleanup (main admin)
export async function GET(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const list = new URL(req.url).searchParams.get('list');
    const db = await readDb();
    const today = nowIn(db.settings.timezone).date;
    const last = db.meta.lastCleanup ?? null;

    if (list === 'last') {
      if (admin.role !== 'SUPER') fail(403, SUPER_ONLY);
      const copy = last ? await readExtra<CleanupCopy>(LAST_CLEANUP_DOC) : null;
      if (!copy || copy.before !== last?.before) fail(404, 'لا توجد قائمة محذوفة محفوظة.');
      return { before: copy.before, at: copy.at, bookings: copy.bookings };
    }

    const notice = cleanupNotice(db, today);
    if (list === 'batch') {
      if (!notice) fail(404, 'لا توجد مواعيد قديمة بانتظار الحذف.');
      return { notice, bookings: batchOf(db, notice.before, today), asOf: new Date().toISOString() };
    }
    return { notice, last };
  });
}

// POST { action: 'DOWNLOADED', before, asOf }  → records who downloaded the list (any staff member)
// POST { action: 'DELETE', before, expected }  → deletes the batch now (main admin)
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const b = await readBody(req);
    const before = str(b.before, 10);

    if (b.action === 'DOWNLOADED') {
      return mutateDb(db => {
        const batch = db.meta.cleanup;
        if (!batch || batch.before !== before) fail(409, LIST_CHANGED);
        // The moment the list was read, so later changes to it are noticed
        const asOf = Date.parse(str(b.asOf, 40));
        const now = Date.now();
        batch.downloadedAt = new Date(asOf <= now && asOf > now - 600_000 ? asOf : now).toISOString();
        batch.downloadedBy = admin.name;
        return { notice: cleanupNotice(db, nowIn(db.settings.timezone).date) };
      });
    }

    if (b.action === 'DELETE') {
      if (admin.role !== 'SUPER') fail(403, SUPER_ONLY);
      return mutateDb(async db => {
        const today = nowIn(db.settings.timezone).date;
        const batch = db.meta.cleanup;
        if (!batch || batch.before !== before) fail(409, LIST_CHANGED);
        if (batchOf(db, batch.before, today).length !== int(b.expected, -1, -1, 10_000_000)) fail(409, LIST_CHANGED);
        const record = await deleteBatch(db, today, admin.name, saveCopy);
        await runCleanup(db, today, saveCopy); // announces the next batch if one is already due
        return { record, notice: cleanupNotice(db, today) };
      });
    }

    return fail(400, 'طلب غير صالح.');
  });
}
