begin;
alter table app.meetings add column demo_seed_key text;
create unique index meetings_owner_demo_seed on app.meetings(owner_id,demo_seed_key) where demo_seed_key is not null;
create table app.highlights (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references app.meetings(id) on delete cascade,
  segment_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(meeting_id,segment_id) references app.transcript_segments(meeting_id,id) on delete cascade,
  unique(meeting_id,segment_id)
);
alter table app.highlights enable row level security;
revoke all on app.highlights from public, anon, authenticated;
commit;
