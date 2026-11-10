# Clinic booking (حجز المواعيد)

An Arabic (RTL) appointment-booking site for a doctor's clinic.

- **Patients** (`/`, `/client`) see the clinic page, register with name + phone (or a code from the clinic), pick a visit type, day and time, and can cancel their own appointments.
- **The doctor / staff** (`/admin`) get today's agenda (next patient, attended, call, cancel), a month calendar, all appointments with CSV export, patients with private notes and access codes (copy / WhatsApp), working hours and holidays, visit types and prices, doctors, and clinic settings.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Copy `.env.example` to `.env.local` and set a local `ADMIN_PASSWORD`. `SEED_DEMO=1`, which fills a *new* local database with sample patients. Without the Supabase variables, local data lives in `.data/db.json` (git-ignored); delete that file to start over. With `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`, the local app uses Supabase too.

## Deploy on Vercel

Vercel's file system is read-only, so in production the data is stored in **Supabase**, as one JSON document in the `clinic_db` table. Row level security is on with no policies, so only the server (with the secret key) can read it.

1. Push the project to GitHub and import it in Vercel.
2. In Supabase, create the table once: open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. In **Settings → Environment Variables** add:
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://<project-ref>.supabase.co`
   - `SUPABASE_SECRET_KEY`: from Supabase **Project Settings → API Keys → Secret keys** (`sb_secret_…`). Never the publishable key, and never with a `NEXT_PUBLIC_` prefix.
   - `ADMIN_PASSWORD`: the doctor's password (required, use a strong one)
   - `ADMIN_NAME`: e.g. `د. أحمد` (optional)
   - `STAFF_USERS`: optional extra logins, `Name:password;Name2:password2`
4. Redeploy. The first visit creates a clean database: one doctor, two visit types, and working hours Saturday–Thursday.
5. Sign in at `/admin/login`. In **Settings**, set the clinic name, phone and address. Then adjust **working hours**, **services and prices** and the **doctor's name**. Share the link from Settings with patients.

If the Supabase variables are missing on Vercel, the dashboard shows a warning and nothing can be saved.

To copy an existing local database (`.data/db.json`) into Supabase, run once:

```bash
node --env-file=.env.local scripts/import-to-supabase.mjs
```

### Setting it up for another clinic

The code stays the same. Each clinic gets its own Supabase project and its own Vercel project from this repo:

1. Create a new Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Create a new Vercel project from this repo with that clinic's `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ADMIN_PASSWORD` and `ADMIN_NAME`.
3. Open the site: the first visit creates a clean database. The doctor signs in at `/admin/login` and fills in **Settings**.

Don't run the import script for a new clinic; it would copy another clinic's patients.

### Plan

Use Vercel's **Pro** plan for a real clinic: the Hobby plan is for non-commercial use only.

## Backups

**Settings → تنزيل نسخة احتياطية** downloads all patients and appointments as JSON. Do this regularly.

## How it works

- Times are stored as clinic wall-clock strings (`YYYY-MM-DDTHH:mm`). "Now" is computed in the clinic timezone (default `Africa/Algiers`), so a UTC server and a local PC behave the same.
- Every API route checks permissions on the server. Patients only ever see their own appointments, and staff passwords never reach the browser.
- Writes are serialized and protected with a row version check, so two people booking at the same moment cannot overwrite each other or double-book a slot.
- Sessions are signed, httpOnly cookies. Changing a staff password signs that account out everywhere. Regenerating a patient's code signs the patient out.

Main code: `lib/db.ts` (storage), `lib/availability.ts` (slots and rules), `lib/auth.ts` (sessions), `app/api/*` (routes), `app/admin/*` and `app/client/*` (pages).
