# Feature PRs

These descriptions define the scope and validation of the two feature PRs. The owner initialized `main` with commit `752828d`.

## PR 1: Add authenticated private meeting workspace

Head: `feat/auth-persistence` → base: `main`.

The project needs a secure, reproducible foundation before external capture can be enabled. This change adds a pnpm Next.js/FastAPI monorepo, Auth0 session and access-token boundaries, Supabase migrations, owner-scoped meeting operations, and private playback authorization.

Includes explicit missing-configuration states, deduplicated meeting creation, per-project Vercel configuration with Git deployment disabled, and environment-file exclusions. Configuration values are provided by the owner; no environment files or credentials are included.

Validation at the feature commit: frontend type check and production build, backend Ruff, nine PostgreSQL-backed tests through PGlite, and environment exclusion checks passed. Tests use fixture JWKS and Supabase bucket metadata. Live login/storage are blocked on account setup. Browser verification is blocked by this execution environment. Native PostgreSQL concurrency is not claimed.

## PR 2: Add evidence processing, editable actions, and cited meeting Q&A

Head: `feat/evidence-processing` → base: `feat/auth-persistence` (stacked; retarget after PR 1 merges).

Meeting notes need persisted evidence and safe recovery before real provider calls can be enabled. This change adds the Groq transcription/structured-output adapter, stable transcript segments, evidence-validated summaries and answers, editable action items, saved questions, and a minimal recording/notes workspace.

AI calls require an actual Free-account verification recorded as a short-lived budget. Database reservations enforce a global operation lease and conservative usage caps, SDK retries are disabled, and failed attempts keep reservations. Bounded retries and lease tokens preserve completed stages and fence stale completions. Capture remains explicitly unavailable pending Recall account and webhook verification; no bot is launched and no fake recording state is shown.

Validation: frontend type check/build, Python Ruff, 18 SQL-backed tests with provider fixtures, production HTTP smoke checks, and environment/build-output audit. Real provider/model/account access, webhook behavior, media transfer, and source-to-playback browser behavior remain unverified. See `docs/integration-checkpoint.md` for the precise boundaries.

Do not merge, enable deployments, start the timer, or submit automatically.
