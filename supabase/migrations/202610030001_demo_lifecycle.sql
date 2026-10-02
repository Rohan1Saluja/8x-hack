begin;
-- Keep simulated progress separate from real evidence/processing readiness.
alter table app.meetings alter column meeting_url drop not null;
alter table app.meetings add column demo_state text check (demo_state in
  ('joining','awaiting_admission','recording','transcribing','summarizing','ready','failed'));
alter table app.meetings add column lifecycle_version integer not null default 0 check (lifecycle_version >= 0);
alter table app.meetings add column lifecycle_updated_at timestamptz;
alter table app.meetings add column consent_confirmed_at timestamptz;
commit;
