import { handle } from '@/lib/api';
import { ADMIN_COOKIE, clearCookie } from '@/lib/auth';

export async function POST() {
  return handle(async () => {
    await clearCookie(ADMIN_COOKIE);
    return { ok: true };
  });
}
