begin;
create table app.transcript_segments (
  id uuid primary key,
  meeting_id uuid not null references app.meetings(id) on delete cascade,
  ordinal integer not null check(ordinal >= 0),
  text text not null check(length(text) > 0),
  start_seconds double precision not null check(start_seconds >= 0 and start_seconds < 180),
  end_seconds double precision not null check(end_seconds >= start_seconds and end_seconds <= 180),
  speaker text,
  unique(meeting_id,ordinal), unique(meeting_id,id)
);
create table app.summaries (
  meeting_id uuid primary key references app.meetings(id) on delete cascade,
  content jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);
create table app.action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references app.meetings(id) on delete cascade,
  text text not null check(length(text) between 1 and 1000),
  owner text, due_date text,
  completed boolean not null default false,
  source_segment_ids uuid[] not null,
  created_at timestamptz not null default now()
);
create index actions_meeting on app.action_items(meeting_id);
create table app.questions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references app.meetings(id) on delete cascade,
  request_id uuid not null,
  question text not null,
  answer jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  unique(meeting_id,request_id)
);
create table app.processing_jobs (
  meeting_id uuid not null references app.meetings(id) on delete cascade,
  job_key text not null,
  stage text not null check(stage in ('transcribe','summarize','question')),
  status text not null check(status in ('running','ready','failed')),
  attempts integer not null check(attempts between 1 and 3),
  input_hash text not null,
  lease_token uuid not null,
  lease_until timestamptz not null,
  retry_after timestamptz,
  error_code text,
  primary key(meeting_id,job_key)
);
-- No initial grant: provider calls fail closed until a human verifies the actual Free account.
create table app.provider_budget (
  provider text primary key check(provider='groq'),
  verified_at timestamptz not null,
  expires_at timestamptz not null check(expires_at > verified_at and expires_at <= verified_at + interval '24 hours'),
  verification_note text not null,
  audio_limit bigint not null check(audio_limit >= 0),
  audio_reserved bigint not null default 0 check(audio_reserved >= 0 and audio_reserved <= audio_limit),
  request_limit bigint not null check(request_limit >= 0),
  requests_reserved bigint not null default 0 check(requests_reserved >= 0 and requests_reserved <= request_limit),
  token_limit bigint not null check(token_limit >= 0),
  tokens_reserved bigint not null default 0 check(tokens_reserved >= 0 and tokens_reserved <= token_limit),
  active_token uuid,
  active_until timestamptz
);
alter table app.transcript_segments enable row level security;
alter table app.summaries enable row level security;
alter table app.action_items enable row level security;
alter table app.questions enable row level security;
alter table app.processing_jobs enable row level security;
alter table app.provider_budget enable row level security;
revoke all on all tables in schema app from public, anon, authenticated;
commit;
