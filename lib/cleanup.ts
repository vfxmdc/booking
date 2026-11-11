import type { ArchivedTotals, Booking, CleanupCopy, CleanupNotice, CleanupRecord, DBData } from './types';
import { addDays, daysBetween, startOfWeek } from './date';

/**
 * Weekly cleanup of old appointments (no storage code here, so the browser can import it too).
 *
 * Appointments from before the kept weeks form a batch. Staff are warned for WARNING_DAYS, with a
 * list to download; then the batch is deleted, by the main admin or automatically on the due date.
 * Patients are never deleted, and each patient keeps the totals of the removed visits.
 * There is no cron: the dashboard's feed request runs the next step whenever one is due.
 */

export const WARNING_DAYS = 7;
/** Allowed values of settings.retentionWeeks (0 = never delete). */
export const RETENTION_WEEKS = [1, 4, 13, 52, 0];
/** Side document holding the last deleted appointments, until the next cleanup replaces them. */
export const LAST_CLEANUP_DOC = 'last-cleanup';

type SaveCopy = (copy: CleanupCopy) => Promise<void>;

const dateOf = (b: Booking) => b.startDateTime.slice(0, 10);

/** First day that is kept; appointments dated before it are old. null = cleanup is switched off. */
export function cutoffDate(today: string, retentionWeeks: number): string | null {
  if (!(retentionWeeks >= 1)) return null;
  return addDays(startOfWeek(today), -7 * (Math.floor(retentionWeeks) - 1));
}

/** Appointments dated before `before`, oldest first. The current week and later are never included. */
export function batchOf(db: DBData, before: string, today: string): Booking[] {
  const weekStart = startOfWeek(today);
  const limit = before < weekStart ? before : weekStart;
  return db.bookings.filter(b => dateOf(b) < limit).sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
}

export type CleanupStep = 'announce' | 'delete' | 'cancel';

/** The step that is due now, if any. */
export function planCleanup(db: DBData, today: string): CleanupStep | null {
  const batch = db.meta.cleanup;
  const cutoff = cutoffDate(today, db.settings.retentionWeeks);
  if (batch) {
    // Switched off, loosened, or nothing left to delete: drop the batch (a new one may be announced)
    if (!cutoff || batch.before > cutoff || batchOf(db, batch.before, today).length === 0) return 'cancel';
    return today >= batch.dueOn ? 'delete' : null;
  }
  return cutoff && db.bookings.some(b => dateOf(b) < cutoff) ? 'announce' : null;
}

/** Keeps a deleted appointment's numbers on its patient, so visit counts stay right. */
function addToArchive(totals: ArchivedTotals, b: Booking) {
  if (b.noShow) totals.noShows += 1;
  else {
    totals.visits += 1;
    totals.paid += b.price || 0;
  }
  if (!totals.lastVisit || b.startDateTime > totals.lastVisit) totals.lastVisit = b.startDateTime;
}

/**
 * Deletes the announced batch from `db` (a draft inside mutateDb).
 * The copy is saved first, so if that fails nothing is deleted.
 */
export async function deleteBatch(db: DBData, today: string, by: string, saveCopy: SaveCopy): Promise<CleanupRecord | null> {
  const batch = db.meta.cleanup;
  if (!batch) return null;
  const removed = batchOf(db, batch.before, today);
  delete db.meta.cleanup;
  if (!removed.length) return null;

  const record: CleanupRecord = { at: new Date().toISOString(), before: batch.before, count: removed.length, by };
  await saveCopy({ ...record, bookings: removed });

  const clients = new Map(db.clients.map(c => [c.id, c]));
  for (const b of removed) {
    const client = clients.get(b.clientId);
    if (!client || b.status === 'CANCELLED') continue;
    addToArchive((client.archived ??= { visits: 0, noShows: 0, paid: 0, lastVisit: null }), b);
  }
  const ids = new Set(removed.map(b => b.id));
  db.bookings = db.bookings.filter(b => !ids.has(b.id));
  db.meta.lastCleanup = record;
  return record;
}

/**
 * Runs every step that is due, e.g. deletes the batch and then announces the next one.
 * `db` is a draft inside mutateDb. Returns the deletion that happened, if any.
 */
export async function runCleanup(db: DBData, today: string, saveCopy: SaveCopy): Promise<CleanupRecord | null> {
  let deleted: CleanupRecord | null = null;
  for (let i = 0; i < 3; i++) {
    const step = planCleanup(db, today);
    if (!step) break;
    if (step === 'cancel') delete db.meta.cleanup;
    else if (step === 'announce') {
      db.meta.cleanup = {
        before: cutoffDate(today, db.settings.retentionWeeks)!,
        dueOn: addDays(today, WARNING_DAYS),
        announcedAt: new Date().toISOString(),
      };
    } else deleted = (await deleteBatch(db, today, 'auto', saveCopy)) ?? deleted;
  }
  return deleted;
}

/** What the staff see about the batch waiting to be deleted. */
export function cleanupNotice(db: DBData, today: string): CleanupNotice | null {
  const batch = db.meta.cleanup;
  if (!batch) return null;
  const list = batchOf(db, batch.before, today);
  if (!list.length) return null;
  const downloadedAt = batch.downloadedAt ?? null;
  const changed = downloadedAt !== null && list.some(b => b.updatedAt > downloadedAt);
  const upToDate = downloadedAt !== null && !changed;
  return {
    before: batch.before,
    dueOn: batch.dueOn,
    daysLeft: Math.max(0, daysBetween(today, batch.dueOn)),
    count: list.length,
    from: dateOf(list[0]),
    to: dateOf(list[list.length - 1]),
    downloadedAt: upToDate ? downloadedAt : null,
    downloadedBy: upToDate ? (batch.downloadedBy ?? null) : null,
    changedSinceDownload: changed,
  };
}
