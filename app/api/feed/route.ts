import { mutateDb, readDb, storageKind, writeExtra } from '@/lib/db';
import { handle, requireAdmin } from '@/lib/api';
import { LAST_CLEANUP_DOC, cleanupNotice, planCleanup, runCleanup } from '@/lib/cleanup';
import { relativeDay, nowIn, timeOf } from '@/lib/date';
import type { Booking, BookingEvent, FeedEvent } from '@/lib/types';

/** Patient actions for bookings made before the history log existed. */
function legacyEvents(b: Booking, since: string): BookingEvent[] {
  const events: BookingEvent[] = [];
  if (b.source === 'CLIENT' && b.createdAt > since) events.push({ at: b.createdAt, action: 'CREATED', actor: 'CLIENT' });
  if (b.status === 'CANCELLED' && b.cancelledBy === 'CLIENT' && b.updatedAt > since) {
    events.push({ at: b.updatedAt, action: 'CANCELLED', actor: 'CLIENT' });
  }
  return events;
}

// GET ?since=ISO → what patients did since then, the number of requests waiting for confirmation,
// and the old appointments waiting to be deleted.
export async function GET(req: Request) {
  return handle(async () => {
    await requireAdmin();
    let db = await readDb();
    const since = new URL(req.url).searchParams.get('since') || '';
    const now = nowIn(db.settings.timezone);

    // Weekly cleanup of old appointments. Every open dashboard calls this route, so it doubles as
    // the scheduler: announce a batch, or delete the one whose 7-day warning has run out.
    if (storageKind() !== 'unconfigured' && planCleanup(db, now.date)) {
      try {
        await mutateDb(draft =>
          runCleanup(draft, nowIn(draft.settings.timezone).date, copy => writeExtra(LAST_CLEANUP_DOC, copy))
        );
        db = await readDb();
      } catch (error) {
        console.error('Cleanup of old appointments failed', error);
      }
    }

    const pending = db.bookings.filter(b => b.status === 'PENDING' && b.endDateTime > now.dateTime).length;

    const events: FeedEvent[] = [];
    if (since) {
      for (const b of db.bookings) {
        if (b.updatedAt <= since) continue;
        const list = b.log ? b.log.filter(e => e.actor === 'CLIENT' && e.at > since) : legacyEvents(b, since);
        const when = `${relativeDay(b.startDateTime.slice(0, 10), now.date)} ${timeOf(b.startDateTime)}`;
        for (const e of list) {
          const text =
            e.action === 'CREATED'
              ? b.status === 'PENDING'
                ? `طلب موعد جديد من ${b.clientName} · ${when}`
                : `حجز جديد: ${b.clientName} · ${when}`
              : e.action === 'RESCHEDULED'
                ? `غيّر ${b.clientName} موعده إلى ${when}`
                : e.action === 'CANCELLED'
                  ? `ألغى ${b.clientName} موعده (${when})`
                  : null;
          if (text) events.push({ id: `${b.id}:${e.at}:${e.action}`, bookingId: b.id, action: e.action, at: e.at, text });
        }
      }
    }
    events.sort((a, b) => b.at.localeCompare(a.at));
    return {
      serverTime: new Date().toISOString(),
      pending,
      events: events.slice(0, 30),
      cleanup: cleanupNotice(db, now.date),
      lastCleanup: db.meta.lastCleanup ?? null,
    };
  });
}
