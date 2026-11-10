import { readDb, canonCode } from '@/lib/db';
import { handle, fail, readBody, str } from '@/lib/api';
import { createPatientSession, ipOf, publicClient, rateLimited } from '@/lib/auth';

export async function POST(req: Request) {
  return handle(async () => {
    if (rateLimited(`patient-login:${ipOf(req)}`, 12, 600)) {
      fail(429, 'محاولات كثيرة. انتظر 10 دقائق ثم حاول مجدداً.');
    }
    const code = canonCode(str((await readBody(req)).accessCode, 40));
    if (code.length < 4) fail(400, 'أدخل رمز الدخول.');

    const db = await readDb();
    const client = db.clients.find(c => canonCode(c.accessCode) === code);
    if (!client) fail(401, 'الرمز غير صحيح. تأكد منه أو اتصل بالعيادة.');
    if (client.status !== 'ACTIVE') fail(403, 'تم إيقاف هذا الحساب. يرجى الاتصال بالعيادة.');

    await createPatientSession(client, db);
    return { client: publicClient(client) };
  });
}
