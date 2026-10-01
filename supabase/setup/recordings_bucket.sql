-- Run in the hosted Supabase project's SQL Editor, even when the application
-- database is local Docker PostgreSQL. This is separate from app migrations.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('recordings','recordings',false,24000000,array['audio/mpeg','audio/mp4','audio/wav','video/mp4','audio/webm'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
-- No storage.objects policies: only the backend service role may access this bucket.
commit;
