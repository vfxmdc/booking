import { readDb, mutateDb } from '@/lib/db';
import { handle, readBody, requireSuper, str, int } from '@/lib/api';
import { activeDoctors, publicDoctor } from '@/lib/availability';
import { safeTz } from '@/lib/date';

// Public clinic info used by the home page and the patient booking pages.
export async function GET() {
  return handle(async () => {
    const db = await readDb();
    return {
      settings: db.settings,
      doctors: activeDoctors(db).map(r => publicDoctor(db, r)),
    };
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    await requireSuper();
    const b = await readBody(req);
    const settings = await mutateDb(db => {
      const s = db.settings;
      if (b.clinicName !== undefined) s.clinicName = str(b.clinicName, 80) || s.clinicName;
      if (b.specialty !== undefined) s.specialty = str(b.specialty, 80);
      if (b.phone !== undefined) s.phone = str(b.phone, 40);
      if (b.address !== undefined) s.address = str(b.address, 200);
      if (b.notice !== undefined) s.notice = str(b.notice, 400);
      if (b.bookingWindowDays !== undefined) s.bookingWindowDays = int(b.bookingWindowDays, s.bookingWindowDays, 1, 365);
      if (b.minNoticeMinutes !== undefined) s.minNoticeMinutes = int(b.minNoticeMinutes, s.minNoticeMinutes, 0, 10080);
      if (b.cancelNoticeHours !== undefined) s.cancelNoticeHours = int(b.cancelNoticeHours, s.cancelNoticeHours, 0, 168);
      if (b.maxUpcomingPerPatient !== undefined) s.maxUpcomingPerPatient = int(b.maxUpcomingPerPatient, s.maxUpcomingPerPatient, 1, 20);
      if (b.requireApproval !== undefined) s.requireApproval = Boolean(b.requireApproval);
      if (b.timezone !== undefined) s.timezone = safeTz(str(b.timezone, 60));
      return s;
    });
    return { settings };
  });
}
