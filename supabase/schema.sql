-- Run once per clinic, in Supabase → SQL Editor → New query → Run.
-- The whole clinic is stored as one JSON document in this table.
-- Row level security is on with no policies: only the server (secret key) can read or write it.
create table if not exists public.clinic_db (
  id         text primary key,
  data       jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.clinic_db enable row level security;
