# Meeting lifecycle checkpoint

## What changed

The authenticated workspace now has a charcoal/cyan meeting library, title search,
status filters, a meeting creation form, stable meeting URLs, and a full-width detail
view with recording area, Summary / Transcript / Ask AI tabs, and a right sidebar.
Existing Auth0 session handling, server JWT validation, private Blob playback,
transcription, summary, action editing, and Q&A implementations are retained.

Create a meeting with a Google Meet URL or explicitly choose **Demo meeting**.
Open the meeting, confirm the notice, and choose **Send notetaker**. The demo follows:

1. Joining → awaiting admission (a persisted, server-validated transition).
2. **Admit demo notetaker** → recording. Admission is never automatic.
3. **Stop demo recording** → transcribing → summarizing → ready.
4. Cancel before admission → failed; confirm the notice and retry to restart.

All capture and processing stages in this flow are **simulation**. No external bot
joins a call; no recording, transcript, summary, timestamp, speaker, or action item is
fabricated. A completed simulation is labeled **Demo · Ready**, while real transcript
and summary readiness remain pending. Existing real recordings retain their original
processing and playback behavior. Use a separate, new meeting for the existing
operator WAV import flow.

## Persistence and concurrency

`demo_state`, `lifecycle_version`, `lifecycle_updated_at`, and
`consent_confirmed_at` live in PostgreSQL. Real processing fields remain independent.
A service derives the public lifecycle for older/manual-recording meetings from their
existing capture/transcription/summary states. Duration is exposed only when known.

Lifecycle mutations require the authenticated server-derived owner, lock the owned
meeting row, and compare `expected_version`. Stale or repeated requests return saved
state without another transition. Repeated creation retains the existing owner-scoped
request-ID behavior. The demo creates no processing jobs and reserves no AI budget.

The detail view polls **POST /advance** about every 2.5 seconds for automatic demo
stages. The server allows at most one transition per accepted version, after a minimum
2-second interval. Progress is demand-driven: closing the page pauses advancement;
reopening resumes from the persisted state. No process-local timer, worker, queue,
provider, or paid service is required. GET requests remain read-only.

## Migration and configuration

Apply `supabase/migrations/202610030001_demo_lifecycle.sql` once to an existing database,
after migrations 001 and 002. This adds the four lifecycle columns and allows a null
meeting URL for explicitly chosen demo meetings. Fresh Docker databases mount all
three migrations. Existing Docker volumes do not rerun initialization scripts:

```sh
docker compose exec -T db psql -U eightx -d eightx -v ON_ERROR_STOP=1 < supabase/migrations/202610030001_demo_lifecycle.sql
```

For an existing Supabase database, apply the same file using the normal SQL migration
process. No new environment variables are required. No hosted migration or deployment
was performed in this checkpoint.

## Verification

- Frontend typecheck passed.
- Next.js production build passed. An initial sandbox port restriction caused a
  Turbopack failure; rebuilding outside that restriction with a fresh generated cache
  succeeded. No build/runtime configuration was changed to skip checks.
- Ruff passed; 37 backend tests passed against disposable PostgreSQL. Tests cover
  real JWT signature/claim validation with fixture JWKS, ownership isolation, request
  validation, lifecycle ordering, consent, persisted reads, cancellation/retry, and
  six concurrent duplicate sends. Existing evidence/storage tests remain passing;
  their external AI/Blob calls are mocked.
- Three private Blob signer tests passed; production HTTP checks passed for
  unconfigured and signed-out states, protected redirects, and API gates.
- Browser verification used Chromium and the production Next.js build → the actual
  Next API proxy → FastAPI → disposable PostgreSQL. Auth0 encrypted sessions and
  RS256 identities were isolated test fixtures; API and database responses were not
  mocked. This does not verify a live Auth0 authorization-code login/logout.
- Browser flow covered demo creation and pasted Google Meet URL creation, disabled
  Send until consent, joining, explicit admission, recording, stop, transcribing,
  summarizing, ready, reload persistence, all tabs, title filtering, desktop/mobile
  layouts, replay protection, rejected cross-origin writes, and a second user's
  rejected meeting/evidence/playback/lifecycle access. Screenshots were visually
  inspected. No page or console errors occurred in the passing browser run.
- Browser harness fixes: use case-insensitive accessible tab names (visual text is
  capitalized with CSS), and identify the created row by meeting ID instead of a
  non-unique fixture title. These were test-selector corrections, not product fixes.

Unverified: live Auth0 login/logout, hosted Supabase migration, live Blob/Groq access,
Docker container startup (tests used PostgreSQL through the existing pgserver fixture),
and deployed/incognito behavior. Deployment is outside this checkpoint.

## Capture handoff

Read `AGENTS.md`, `docs/agent-capture.md`, and `CAPTURE-TEST.md` before this work.
Both existing canary entries and all other `.agent-logs/` bytes are preserved.
The local inspection snapshot's Git tree matched main's tree
`460f28245203cdcdbb84290bc779a8efbb9d869a` exactly.

This fresh product session has no preceding delivered exchange to append. Its final
response must first be delivered; the selected model has not been confirmed for this
session. Do not pre-log a draft, infer the model from the executor role, or claim
complete capture. The user/operator must confirm the selected model and finalize the
verbatim prompt/final pair after delivery under the existing wrapper protocol.
The setup-after-timer and historical capture limitations remain unchanged.

## Next checkpoint

Recording + timestamped transcript → structured summary → decisions/action items.
Build on the existing evidence pipeline and verify it with real authorized media.
