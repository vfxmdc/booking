import { mutateDb } from '@/lib/db';
import { handle, requireAdmin } from '@/lib/api';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireAdmin();
    const { id } = await params;
    return mutateDb(db => {
      db.blockRules = db.blockRules.filter(b => b.id !== id);
      return { ok: true };
    });
  });
}
