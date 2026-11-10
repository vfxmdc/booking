import { handle } from '@/lib/api';
import { getPatient, publicClient } from '@/lib/auth';

export async function GET() {
  return handle(async () => {
    const client = await getPatient();
    return { client: client ? publicClient(client) : null };
  });
}
