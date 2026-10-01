# Preparation integration checkpoint — 2026-10-01

## Outcome

The independently implementable foundations are complete and locally checked. **The integration checkpoint is blocked, not passed end to end.** No real provider inference or meeting capture has run. No external deployment, timer, or submission has occurred.

Two reviewable features are prepared:

1. `feat/auth-persistence`: pnpm workspace, Next.js/Auth0 server session, authenticated FastAPI forwarding, RS256 identity validation, owner-scoped meeting library, private Storage authorization, and migrations.
2. `feat/evidence-processing`, based on feature 1: Groq adapter, persistent transcript/summary/action/question data, validated sources, bounded processing/recovery, free-budget enforcement, and integration UI.

The owner initialized `main` with commit `752828d`. Both feature branches are based on that commit, with feature 2 stacked on feature 1. All application code is submitted through feature PRs. Do not merge either feature automatically. Retarget feature 2 to `main` after feature 1 is merged by the owner.

## Implemented behavior

- Frontend login/logout use Auth0's SDK. Workspace access checks the server session; the browser receives neither API access tokens nor provider credentials. Requests reach an allowlisted same-origin proxy, with an Origin check for mutations.
- `/health` is public. `/me` validates identity and maps the verified Auth0 subject to an internal user. All meeting reads, playback, deletion, processing/recovery, questions, action edits, and blocked capture controls check ownership. Invalid IDs owned by others return 404.
- Meeting creation uses a client request UUID plus a database uniqueness constraint. The server rejects using that UUID with different content.
- Recordings use a private Supabase bucket. Signed playback URLs are issued only after ownership checks. No capture upload/transfer path is implemented yet.
- Transcription persists stable UUID segment IDs and validated start/end times. Speaker identity remains null. Prepared media must be stopped, no longer than 180 seconds, and below 24 MB; the capture adapter must eventually establish those metadata values.
- Summaries include overview/topics/decisions plus separately stored editable action items. Unknown task owner/deadline stays null; relative deadlines remain as stated, with no guessed calendar dates.
- Summary and answer JSON is validated, including every cited segment ID belonging to the current meeting. Player seeks resolve IDs to stored segment timestamps. No model-generated timestamps are accepted.
- Each stage completes within its HTTP request and persists status in PostgreSQL. There are no in-process background tasks. One provider operation may hold the global five-minute lease. Each operation has at most three attempts, a failure cooldown, and a lease token preventing an older attempt from saving over newer work. Saved transcripts survive summary failures.
- Groq has SDK retries disabled and a 75-second transport timeout. Budgets expire within 24 hours. Requests atomically reserve conservative audio/text/token capacity before calling the provider, and uncertain/failed usage is never refunded. Missing keys, missing/expired verification, exhausted quotas, active work, and retry exhaustion yield actionable errors.
- Capture controls fail closed without sending requests. No simulated joining/recording states, no fallback browser recorder, no sample meetings.

## Verification evidence

| Check                         | Result and scope                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend type check           | Passed.                                                                                                                                                                                                  |
| Frontend production build     | Passed with Next.js 16.3.8 and compatible React/Auth0 pins.                                                                                                                                              |
| Python Ruff                   | Passed.                                                                                                                                                                                                  |
| Backend tests                 | 18 passed against PostgreSQL running in PGlite through psycopg. Supabase bucket metadata, JWKS, media and Groq responses are fixtures.                                                                   |
| JWT validation                | Valid signatures accepted; invalid signature, wrong algorithm, issuer, audience, expired token and blank subject rejected. Real Auth0 tenant discovery remains unverified.                               |
| Two-user access               | SQL-backed tests reject another user's meeting reads, playback, deletion, evidence, processing, recovery, questions, capture controls, and action edits.                                                 |
| Evidence/recovery             | Persistence, deduplication, citation validation, nullable speaker, action editing, retry bounds, quota failure, retained reservations and stale-attempt protection passed with fixtures.                 |
| Production HTTP checks        | Unconfigured and signed-out home screens, protected workspace redirects, protected API responses, arbitrary proxy rejection, no-store and fixture-secret exclusion passed.                               |
| Environment audit             | Environment files ignored/untracked and excluded from build traces; no environment files were created. No real credentials were present for live-provider tests.                                         |
| Browser verification          | Blocked: agent-browser daemon would not start; local Chromium download failed; cloud browser refused localhost with `ERR_BLOCKED_BY_CLIENT`. No visual or source-to-playback browser success is claimed. |
| Native PostgreSQL concurrency | Not verified in this container. Native test server could not create/change to its required non-root user. PGlite exercises real SQL but is not proof of production multi-connection locking behavior.    |
| Real provider workflow        | Not run: account configuration and authorized capture/webhook access unavailable.                                                                                                                        |

## Exact remaining dependencies

1. Configure Auth0 and Supabase using the README variable table; apply both migrations. Perform actual login → `/me` → logout with two accounts and test private storage playback.
2. Verify the actual Recall account's remaining trial recording seconds, whether it needs a payment method, and treatment of media retrieval, recording formats and storage/retention. Public pricing alone is insufficient. No Recall key is consumed by the current code.
3. Choose the Recall workspace region from the actual dashboard, not from a guessed default. Authorize a public backend/webhook deployment separately. Then implement and test create/leave, hard provider-side recording limits, launch reservation and uncertain-create reconciliation, signed duplicate/out-of-order webhook handling, capped media transfer into Supabase, and provider retention cleanup. The planned route is `/webhooks/recall`; it does **not** exist yet and must not be configured as live now.
4. Configure a Groq Free-plan key. Run `uv run python -m app.admin verify-models` from `backend` to check actual model access without inference. Verify Free-plan status, no paid billing fallback and remaining model-specific daily/minute allowances in the dashboard; approve a conservative local budget as described in README. No account checks have been performed for you.
5. After capture is implemented, authorize a specific 60–90-second Google Meet test and admit the bot. Include two participants, a concrete decision, an assigned task and a spoken deadline. Check both voices, reload persistence, failure recovery, and actual citation playback.

## Hosting findings and limit of the current approach

[Vercel's current limits](https://vercel.com/docs/functions/limitations) allow Hobby Python/Node Fluid functions up to 300 seconds and request/response bodies up to 4.5 MB. The frontend returns small JSON; Supabase serves playback and Groq fetches a temporary media URL directly. No recording is stored durably on local disk. Each AI stage is explicit and resumable by a signed-in user after a crash. This is suitable for evaluating short recordings, **not a proof of an unattended end-to-end capture pipeline**.

[Hobby cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) cannot supply a precise frequent recovery loop. Do not rely on a browser timer to stop a billable bot, or on a daily cron to enforce recording limits. Provider-side hard duration limits and retention behavior must be verified before launch is enabled. Larger media and unattended recovery need further evaluation against measured runtime and actual free allowances. If that fails, the smallest proposed alternative is an explicitly launched local Python processing worker using the same Supabase state; it is not implemented or silently selected.

The supplied Vercel skill contains contradictory older limits; the current official limits page governed the 300-second/4.5 MB design. Neither Vercel account eligibility nor current project settings have been verified. Both Vercel configuration files disable Git deployment during preparation.

[Recall pricing](https://www.recall.ai/pricing) advertises the first five recording hours and identifies recording retention charges after a free period. This is a finite trial, not a continuing free capture plan. Recording formats/add-ons and actual account eligibility remain gating questions.

[Groq speech documentation](https://console.groq.com/docs/speech-to-text) supports verbose segment timestamps and a 25 MB Free upload limit; the app caps media below that. [Structured outputs](https://console.groq.com/docs/structured-outputs) documents strict schemas for GPT-OSS 20B. The installed Groq 1.7.0 SDK was inspected for URL transcription and segment parameters. [Rate limits](https://console.groq.com/docs/rate-limits) are account/model dependent. No hard-coded public quota is treated as this account's entitlement.

## Proposed Sprint 1 (timer not started)

First unblock and prove accounts/hosting, then complete the bot capture vertical slice: a manually sent, clearly identified Google Meet bot; admission/recording/stopped states; durable ownership and usage reservation; authenticated webhooks and recovery; private media transfer; one real two-participant short meeting through existing transcript/summary/Q&A processing. If bot access cannot meet the zero-budget rule, report the exact reason and ask before selecting browser capture. Keep calendar sync and additional platforms out of scope.
