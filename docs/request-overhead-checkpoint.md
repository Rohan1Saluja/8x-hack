# Request overhead checkpoint

- Reuse a lazy, bounded psycopg pool (0–4 connections per warm instance; 60-second idle shrink; 5-second acquisition timeout). Verify connections before checkout, preserve per-operation transactions, disable prepared statements for Supavisor, require production TLS, close on application shutdown.
- Resolve existing users with SELECT; only first registration inserts, with a race-safe conflict/read fallback.
- After ownership validation, pipeline the six evidence reads. Response shape, ordering, and authorization are unchanged.
- Load selected meeting and evidence in the same frontend request batch. Remove the child mount's duplicate meeting fetch. Refresh library and details concurrently after processing.

Verification: 10 focused backend tests passed (pool lifecycle/transaction delegation, read-only users, registration race, queued evidence reads, ownership gating, existing sanitized-error regression tests). Frontend typecheck and production build passed. These tests use isolated dependencies; live PostgreSQL/Supavisor behavior and production latency are not established by them.
Browser request-count verification was attempted with a temporary local fixture but blocked by the unavailable Chromium binary. The fixture was removed. No authentication bypass is shipped.

Regions remain unchanged: current Vercel access exposes no projects and the Supabase region is unknown. Measure production request durations after deployment before claiming a latency improvement.

Capture: existing raw entries remain unchanged. Prior delivered exchanges and this exchange await selected-model confirmation and manual capture under docs/agent-capture.md; no inferred model or undelivered final response was recorded.
