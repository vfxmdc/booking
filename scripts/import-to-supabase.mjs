// One-time copy of the local database (.data/db.json) into Supabase.
//   node --env-file=.env.local scripts/import-to-supabase.mjs [--force]
// Refuses to replace data that is already in Supabase unless --force is given.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (add them to .env.local).');
  process.exit(1);
}

const force = process.argv.includes('--force');
const file = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(process.cwd(), '.data', 'db.json');
const data = JSON.parse(await fs.readFile(file, 'utf-8'));
if (!data?.meta?.secret || !Array.isArray(data.staff)) {
  console.error(`${file} does not look like a clinic database.`);
  process.exit(1);
}

const table = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).from('clinic_db');

const existing = await table.select('version').eq('id', 'main').maybeSingle();
if (existing.error) {
  console.error(`Supabase: ${existing.error.message}`);
  process.exit(1);
}
if (existing.data && !force) {
  console.error('Supabase already holds clinic data. Run again with --force to replace it.');
  process.exit(1);
}

const version = existing.data ? Number(existing.data.version) + 1 : 1;
const saved = await table.upsert({ id: 'main', data, version, updated_at: new Date().toISOString() });
if (saved.error) {
  console.error(`Supabase: ${saved.error.message}`);
  process.exit(1);
}

console.log(
  `Imported ${data.staff.length} staff, ${data.clients?.length ?? 0} patients and ${data.bookings?.length ?? 0} appointments (version ${version}).`
);
