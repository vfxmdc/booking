// One-time copy of the local database (.data/db.json) into Supabase.
//   node --env-file=.env.local scripts/import-to-supabase.mjs [--force]
// Refuses to replace data that is already in Supabase unless --force is given.
// (Exits by setting process.exitCode: calling process.exit() while a network request is
// still closing crashes Node on Windows.)
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

/** Returns an error message, or null when the import succeeded. */
async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (add them to .env.local).';

  const force = process.argv.includes('--force');
  const file = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(process.cwd(), '.data', 'db.json');
  const data = JSON.parse(await fs.readFile(file, 'utf-8'));
  if (!data?.meta?.secret || !Array.isArray(data.staff)) return `${file} does not look like a clinic database.`;

  const table = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).from('clinic_db');

  const existing = await table.select('version').eq('id', 'main').maybeSingle();
  if (existing.error) return `Supabase: ${existing.error.message}`;
  if (existing.data && !force) return 'Supabase already holds clinic data. Run again with --force to replace it.';

  const version = existing.data ? Number(existing.data.version) + 1 : 1;
  const saved = await table.upsert({ id: 'main', data, version, updated_at: new Date().toISOString() });
  if (saved.error) return `Supabase: ${saved.error.message}`;

  console.log(
    `Imported ${data.staff.length} staff, ${data.clients?.length ?? 0} patients and ${data.bookings?.length ?? 0} appointments (version ${version}).`
  );
  return null;
}

const error = await main();
if (error) {
  console.error(error);
  process.exitCode = 1;
}
