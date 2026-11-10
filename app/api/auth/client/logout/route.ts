import { handle } from '@/lib/api';
import { PATIENT_COOKIE, clearCookie } from '@/lib/auth';

export async function POST() {
  return handle(async () => {
    await clearCookie(PATIENT_COOKIE);
    return { ok: true };
  });
}
