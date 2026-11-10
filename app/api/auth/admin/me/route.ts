import { handle } from '@/lib/api';
import { bootstrapCode, getAdmin } from '@/lib/auth';
import { readDb, storageKind } from '@/lib/db';

export async function GET() {
  return handle(async () => {
    const db = await readDb();
    return {
      admin: await getAdmin(db),
      configured: db.staff.length > 0 || Boolean(bootstrapCode()),
      storage: storageKind(),
    };
  });
}
