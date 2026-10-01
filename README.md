# 8x-hack

Preparation checkpoint for a Fathom-inspired Google Meet assistant. pnpm monorepo: Next.js frontend, FastAPI backend, Supabase Postgres and private Storage, Auth0 identity. No deployed services, calendar integration, or paid fallback.

## Local setup

Use Node 24, pnpm 11.25.0, Python 3.12, uv, and Docker with Compose v2. Run `pnpm install --frozen-lockfile`, then `cd backend` and `uv sync --frozen`. Return to the repo root.

Start the local PostgreSQL database:

```sh
docker compose up -d --wait db
```

The database is available only on `127.0.0.1:5433`, with database/user `eightx` and the public development-only password `eightx_local_dev`. Set `DATABASE_URL` in your backend local environment to `postgresql://eightx:eightx_local_dev@127.0.0.1:5433/eightx?sslmode=disable` and keep `APP_ENV=development`. These credentials must never be used for a hosted database. Port 5433 avoids the usual local PostgreSQL port 5432; change the Compose host port and your URL together if it is already occupied.

On the first start with an empty volume, Docker creates the compatibility roles and runs both app migrations in order. No Supabase database connection is needed for local app data. Check the initialized tables with:

```sh
docker compose exec db psql -U eightx -d eightx -c "select table_name from information_schema.tables where table_schema = 'app' order by table_name;"
```

Expect eight tables. Run `pnpm dev` to start the frontend on :3000 and backend on :8000. `docker compose down` stops the database while retaining its named volume. Initialization scripts only run for a new, empty volume; later migrations must be applied explicitly. If startup fails, inspect `docker compose logs db` before proceeding. Do not delete the volume to fix an error unless its local data is disposable.

For fully local development, set `RECORDING_STORAGE=local` in your backend local environment. The backend creates `backend/local-recordings/` automatically at startup; no Supabase credentials or bucket SQL are needed for this mode. The folder is ignored by Git and excluded from Vercel uploads. It persists across backend restarts and `docker compose down` because it lives on your machine, outside the database container. Retain it alongside the Docker database volume: the database stores references to these files.

Local playback uses expiring signed links, issued only after the meeting ownership check, and supports byte ranges for seeking. There is no public static directory. Run a single local backend worker; restarting it invalidates old links, so refresh playback afterward. Local storage refuses to run unless `APP_ENV=development` and `VERCEL` is unset. If you change the backend port, set `LOCAL_STORAGE_BASE_URL` to its loopback HTTP origin (default `http://localhost:8000`). `LOCAL_RECORDINGS_DIR` can optionally specify a different absolute directory outside the repo; otherwise use the default so recording files remain excluded from Git and deployment uploads.

To test with an existing recording before live capture is implemented, create a meeting in the app, copy its UUID from the meeting URL, and run this development-only operator command from `backend`:

```sh
uv run python -m app.admin import-local-recording --meeting-id MEETING_UUID --file "/absolute/path/to/sample.wav"
```

Use a complete PCM WAV file up to 3 minutes and 24 MB. The command copies it into local storage, calculates its duration, and attaches it to an empty meeting in the configured database; it never replaces an existing recording. This is a trusted local operator tool, not an HTTP upload endpoint or a meeting capture feature. Refresh the meeting to play it. Deleting the meeting removes the stored copy, not the original file. AI transcription sends the local file to Groq as a direct upload (a localhost URL cannot be fetched by Groq); it still requires your configured key and operator-approved free budget. No AI request occurs during import.

Hosted recording storage remains available with `RECORDING_STORAGE=supabase` (the default), `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Only this mode needs `supabase/setup/recordings_bucket.sql` run in the hosted project's SQL Editor. The bucket setup is safe to rerun and does not delete recordings. Choose the storage mode before creating recordings; existing recording references are not migrated when the setting changes. Vercel Blob is not implemented.

For a fresh hosted Supabase application database, apply the files in `supabase/migrations` in filename order, then `supabase/setup/recordings_bucket.sql`. Previously initialized projects need no schema changes: bucket provisioning was extracted from the first migration without changing the application tables. Do not rerun already-applied app migrations.

You create and maintain `frontend/.env.local` and `backend/.env.local` yourself. No environment files, examples, or real credentials belong in Git. Python loads only `backend/.env.local` in local development, with existing process environment taking precedence. It does not load files when `VERCEL` is set or `APP_ENV` is not `development`.

## Backend architecture

Request flow is `routers → services → repositories`.

- `backend/app/routers/`: HTTP routes, request schemas, and authentication dependencies.
- `backend/app/services/`: ownership checks, business rules, processing workflows, and transaction boundaries.
- `backend/app/repositories/`: SQL reads and writes using the connection supplied by the service. Repositories do not commit or open their own transactions.
- `backend/app/integrations/`: Groq and Supabase Storage adapters.
- `backend/app/db.py`: connection configuration; `main.py`: application wiring, middleware, and error-to-HTTP translation.

Keep database access out of routers. Services raise application errors; HTTP handlers preserve the existing status codes and response bodies. Processing completion and evidence persistence share one transaction.

## Required configuration

All configuration below is server-side. There are no `NEXT_PUBLIC_` variables.

| Variable                    | Location            | Purpose and source                                                                                                           |
| --------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `AUTH0_DOMAIN`              | Both                | Tenant hostname from Auth0 application settings.                                                                             |
| `AUTH0_AUDIENCE`            | Both, exactly equal | Identifier of a custom Auth0 API you create, configured for RS256.                                                           |
| `AUTH0_CLIENT_ID`           | Frontend            | Auth0 Regular Web Application ID.                                                                                            |
| `AUTH0_CLIENT_SECRET`       | Frontend            | Secret from that Regular Web Application.                                                                                    |
| `AUTH0_SECRET`              | Frontend            | Locally generate 32 random bytes encoded as hex for encrypted session cookies.                                               |
| `APP_BASE_URL`              | Frontend            | Application origin, locally `http://localhost:3000`, without trailing slash.                                                 |
| `BACKEND_URL`               | Frontend            | Backend origin, locally `http://localhost:8000`.                                                                             |
| `DATABASE_URL`              | Backend             | Local: Docker PostgreSQL on port 5433 (see above). Production: Supabase transaction pooler on port 6543 with `sslmode=require`. |
| `RECORDING_STORAGE`         | Backend             | Set `local` for local filesystem recordings; defaults to `supabase` for hosted recordings. |
| `SUPABASE_URL`              | Backend, Supabase storage only | Project URL from Supabase project settings. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend, Supabase storage only | Supabase legacy service-role key for private Storage operations; never use the anon key here. |
| `APP_ENV`                   | Backend             | `development` locally; `production` for the production project.                                                              |
| `RECORDING_BUCKET`          | Backend, optional   | Defaults to `recordings`, created private by `supabase/setup/recordings_bucket.sql`. Keep the default unless you also update that setup. |
| `PLAYBACK_URL_SECONDS`      | Backend, optional   | Signed playback URL lifetime; default 300, maximum 600 seconds.                                                              |

Auth0: register `http://localhost:3000/auth/callback` under Allowed Callback URLs and `http://localhost:3000` under Allowed Logout URLs and Allowed Web Origins. Add the same paths on the eventual production frontend origin. Enable refresh tokens for the API/application if using `offline_access`. The backend verifies signature, RS256, issuer, audience, expiry, issued-at, and subject; the frontend SDK handles the login/logout session. Tokens are never returned to browser JavaScript. Every meeting request derives ownership from the verified subject.

## Two Vercel projects (configuration only)

Use roots `frontend` and `backend`. Select Next.js for the frontend and FastAPI for the backend; allow the frontend build to access workspace files outside its root. Add each project's own variables manually in Vercel. Use Node 24 and Python 3.12. Enable Fluid compute; the backend maximum is 300 seconds. Git deployments are disabled in both checked-in Vercel configurations during preparation. Do not deploy until authorized.

Use Hobby/free projects only. Confirm actual account plans and usage before enabling integrations. Private storage URLs go directly to the browser player; recordings never pass through the frontend proxy. The application schema has no browser role grants or RLS policies; only the backend database connection accesses it. Do not add `app` to Supabase exposed schemas.

## Checks

`pnpm typecheck`, `pnpm build`, `pnpm check:backend`, `pnpm test:backend`, and `pnpm check:secrets`.

Backend tests create a disposable local PostgreSQL server via the **development-only** pgserver dependency. They apply the same roles and app migrations used by Docker, without a Supabase Storage schema; these tests do not prove actual Storage or Auth0 account connectivity. Generated test RSA keys exercise signature and claim validation with a fixture JWKS, not a real Auth0 login.

## Preparation status

Implemented foundations: protected workspace, server-side token forwarding, public health, authenticated identity, owner-scoped meeting creation/library/reads/deletion, idempotent meeting creation, and authorization before signed playback.

Real login/logout, Supabase account connectivity and signed playback require your configuration. Recall free account balance, no-payment-method eligibility, operation charges, provider region, and an authorized webhook URL remain unverified. Capture is intentionally unavailable, and no browser recording fallback has been introduced.

## References checked on 2026-10-01

- [Auth0 Next.js SDK](https://github.com/auth0/nextjs-auth0): v4 uses `AUTH0_DOMAIN`, `APP_BASE_URL`, `/auth/callback`, and explicit API audience. Pinned SDK peer dependencies exclude React 19.3, so React 19.2 is used.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): Hobby Fluid Node/Python maximum 300 seconds; request/response maximum 4.5 MB. Older skill examples conflict; the current official limits page governs.
- [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi): framework discovers `app/main.py`.
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres) and [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).
- [Recall pricing](https://www.recall.ai/pricing): public initial five-hour offer is not proof of this account's eligibility; storage retention can introduce charges.
- [Fathom](https://www.fathom.ai/): reviewed public product references for library, recording, summary, action-item, and question organization. Preparation interface uses a simple sidebar and split library/detail view; it does not claim pixel fidelity to private product screens.

## Review workflow

Feature changes are reviewed through pull requests. `feat/auth-persistence` targets the owner-initialized `main` branch. `feat/evidence-processing` is stacked on `feat/auth-persistence`; retarget it to `main` after the foundation PR merges. PR creation does not authorize merging, deployment, starting the timer, or submission.

## AI configuration and verification

Additional backend-only variables:

| Variable                   | Purpose and source                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`             | Key from the actual Groq **Free** organization/project. Confirm its plan first; do not attach a payment method.  |
| `GROQ_TRANSCRIPTION_MODEL` | Optional; defaults to `whisper-large-v3-turbo`. Use only a model verified in this account.                       |
| `GROQ_TEXT_MODEL`          | Optional; defaults to `openai/gpt-oss-20b`. Must support strict JSON Schema; no paid/model fallback is selected. |

Keep these values in `backend/.env.local` locally or the backend Vercel project's environment settings. Please configure the required values yourself; do not paste secrets into chat. For production use HTTPS origins and the same Auth0 audience in both projects.

From `backend`, `uv run python -m app.admin verify-models` performs a model-list read with your configured key. It does not prove billing eligibility or run inference. After checking the actual Free plan and remaining quotas in the Groq dashboard, the operator can run `uv run python -m app.admin approve-groq-budget --help` to record a conservative budget. Required arguments are `--audio-seconds`, `--text-requests`, `--text-tokens`, `--hours` (1–24), `--note` (verification facts, no credentials), and `--confirm-free-no-payment`. Use remaining allowances from the account, leave headroom, and avoid using the same allowance in other apps. No default grant is seeded. There is no public budget-approval endpoint.

The database reservation is an application cap, not a live Groq balance API. Reservations are retained even on errors. A human rechecks dashboard quotas before granting more capacity; budgets never replenish automatically. Provider 429 responses enforce actual account rate limits. The preparation UI shows configuration/quota failures and uses one explicit request for each transcription, summary or question. Three attempts per operation, 20 distinct questions per meeting, one concurrent provider operation, and three-minute/24-MB recordings are the fixed preparation limits. The capture adapter remains blocked and cannot create recordings yet.

## Processing and evidence

Apply both migrations. Generate a transcript before a summary; either can be resumed independently. Calls persist job status before inference and results in a fenced transaction. After an interrupted request, refresh the meeting; after its five-minute lease expires, use **Recover interrupted work**, then retry. Each retry uses another conservative reservation. Do not grant yourself new quota to work around a provider rejection without verifying the real Free allowance.

Summary actions are editable independently; their original source links remain attached. Q&A only uses stored segments from the current meeting. Click a transcript timestamp or source to seek the stored recording. An expired playback URL can be refreshed after authorization. These player interactions still require real-media browser verification.

`node scripts/smoke_frontend.mjs` tests production HTTP behavior after a build. It uses explicit dummy configuration in child-process memory, creates no environment files, and makes no real Auth0 calls. Native backend tests normally use pgserver. In containers unable to launch native PostgreSQL, `TEST_DATABASE_URL` can point the test process to a **fresh disposable** PostgreSQL/PGlite instance; tests create schemas and truncate fixture data, so never point it at a shared or real project. PGlite test results do not prove native concurrent-transaction behavior.

Read [the checkpoint report](docs/integration-checkpoint.md) for implemented versus tested versus blocked functionality, exact account actions, hosting limits, and proposed Sprint 1. [Feature PR descriptions](docs/pull-requests.md) describe the review scope and validation for each branch.
