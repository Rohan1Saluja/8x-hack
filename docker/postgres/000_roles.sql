-- Supabase provides these roles; plain PostgreSQL needs them for the shared
-- migrations' REVOKE statements. They cannot log in or access application data.
create role anon nologin;
create role authenticated nologin;
