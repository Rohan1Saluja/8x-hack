begin;
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

create table app.users (
  id uuid primary key default gen_random_uuid(),
  auth0_sub text not null unique,
  created_at timestamptz not null default now()
);
create table app.meetings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.users(id),
  request_id uuid not null,
  title text not null check(length(title) between 1 and 160),
  meeting_url text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  capture_state text not null default 'not_started' check(capture_state in
    ('not_started','joining','awaiting_admission','recording','stopped','failed')),
  transcription_state text not null default 'pending' check(transcription_state in ('pending','running','ready','failed')),
  summary_state text not null default 'pending' check(summary_state in ('pending','running','ready','failed')),
  provider_bot_id text unique,
  recording_key text,
  recording_bytes bigint check(recording_bytes between 1 and 24000000),
  duration_seconds double precision check(duration_seconds > 0 and duration_seconds <= 180),
  failure_code text,
  unique(owner_id,request_id)
);
create index meetings_owner_created on app.meetings(owner_id,created_at desc);
alter table app.users enable row level security;
alter table app.meetings enable row level security;
-- Backend-only schema; browser roles get no policies or grants. API ownership checks are mandatory.
revoke all on all tables in schema app from public, anon, authenticated;
alter default privileges in schema app revoke all on tables from public, anon, authenticated;

commit;
