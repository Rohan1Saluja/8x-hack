# 8x-hack

Preparation checkpoint for a Fathom-inspired Google Meet assistant. pnpm monorepo: Next.js frontend, FastAPI backend, PostgreSQL, private Vercel Blob recordings, and Auth0 identity. No deployed services, calendar integration, or paid fallback.

Read the [preparation and implementation guide](docs/preparation-guide.md) for the code walkthrough, request flows, security and usage-budget decisions, confirmed local test scope, interview questions, and a five-minute demo script.

## Local setup

| Component | Local development | Production |
| --- | --- | --- |
| Database | Docker PostgreSQL | Supabase PostgreSQL |
| Recording files | Vercel Blob (private) | The same Vercel Blob store |
| Login | Auth0 | Auth0 |
| Transcription and notes | Groq Free | Groq Free |


Use Node 24, pnpm 11.25.0, Python 3.12, uv, and Docker with Compose v2. Run `pnpm install --frozen-lockfile`, then `cd backend` and `uv sync --frozen`. Return to the repo root.

Start the local PostgreSQL database:

```sh
docker compose up -d --wait db
```

The database is available only on `127.0.0.1:5433`, with database/user `eightx` and the public development-only password `eightx_local_dev`. Set `DATABASE_URL` in your backend local environment to `postgresql://eightx:eightx_local_dev@127.0.0.1:5433/eightx?sslmode=disable` and keep `APP_ENV=development`. These credentials must never be used for a hosted database. Port 5433 avoids the usual local PostgreSQL port 5432; change the Compose host port and your URL together if it is already occupied.

On the first start with an empty volume, Docker creates the compatibility roles and runs all app migrations in order. No Supabase database connection is needed for local app data. Check the initialized tables with:

```sh
docker compose exec db psql -U eightx -d eightx -c "select table_name from information_schema.tables where table_schema = 'app' order by table_name;"
```

Expect eight tables. Run `pnpm dev` to start the frontend on :3000 and backend on :8000. `docker compose down` stops the database while retaining its named volume. Initialization scripts only run for a new, empty volume; later migrations must be applied explicitly. If startup fails, inspect `docker compose logs db` before proceeding. Do not delete the volume to fix an error unless its local data is disposable.

Create one **private** Vercel Blob store in the Vercel dashboard (Storage → Create Storage → Blob → Private). Copy its `BLOB_READ_WRITE_TOKEN` into both local environment files, and later into both Vercel projects. The frontend uses it only in server code to sign private playback URLs; the backend uses it for upload, download, and deletion. Use the same store/token in both places. Do not use a public store or prefix this variable with `NEXT_PUBLIC_`.

No Supabase Storage bucket, storage service-role key, filesystem storage mode, or local recording directory is needed. If configured previously, remove `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RECORDING_BUCKET`, `RECORDING_STORAGE`, `LOCAL_RECORDINGS_DIR`, and `LOCAL_STORAGE_BASE_URL`. Keep the Supabase connection string only for the production database.

For a fresh production Supabase database, run all files in `supabase/migrations` in filename order. Existing databases need `202610030001_demo_lifecycle.sql` for the demo lifecycle checkpoint. Never rerun already-applied migrations. Old Supabase/local-file recording references are not automatically transferred to Blob; use a new meeting for the first Blob test.

Uploads use unique paths under `development/` or `production/` in that single store. Delete test meetings in the app to remove their development blobs, or clean up `development/` in the Blob dashboard when finished. Sharing the store does not synchronize the two databases: each database still needs its own meeting metadata. If production recording references are copied into a local database, playback/transcription can reuse those files, and deleting the local meeting leaves production blobs intact. Do not delete a production blob while either database still needs it.

### Test with a recording

Live capture is still pending. To test storage now, create a meeting in the app, get its `id` from the signed-in JSON response at `http://localhost:3000/api/backend/meetings`, then run this operator command from `backend`:

```sh
uv run python -m app.admin import-recording --meeting-id MEETING_UUID --file "/absolute/path/to/sample.wav"
```

Use a complete PCM WAV file up to 3 minutes and 24 MB. The command uploads it privately to Blob and attaches it to an empty meeting; it does not start AI processing. Refresh the meeting for playback. Transcription downloads the private file on the backend and uploads it to Groq after the existing free-budget approval. Audio/video bytes never pass through the frontend proxy.

You create and maintain `frontend/.env.local` and `backend/.env.local` yourself. No environment files, examples, or real credentials belong in Git. Python loads only `backend/.env.local` in local development, with existing process environment taking precedence. It does not load files when `VERCEL` is set or `APP_ENV` is not `development`.

## Backend architecture

Request flow is `routers → services → repositories`.

- `backend/app/routers/`: HTTP routes, request schemas, and authentication dependencies.
- `backend/app/services/`: ownership checks, business rules, processing workflows, and transaction boundaries.
- `backend/app/repositories/`: SQL reads and writes using the connection supplied by the service. Repositories do not commit or open their own transactions.
- `backend/app/integrations/`: Groq and Vercel Blob adapters.
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
| `BLOB_READ_WRITE_TOKEN`     | Both, server-only   | Read/write token from the same private Vercel Blob store. |
| `APP_ENV`                   | Backend             | `development` locally; `production` for the production project.                                                              |
| `PLAYBACK_URL_SECONDS`      | Backend, optional   | Signed playback URL lifetime; default 300, maximum 600 seconds.                                                              |

Auth0: register `http://localhost:3000/auth/callback` under Allowed Callback URLs and `http://localhost:3000` under Allowed Logout URLs and Allowed Web Origins. Add the same paths on the eventual production frontend origin. Enable refresh tokens for the API/application if using `offline_access`. The backend verifies signature, RS256, issuer, audience, expiry, issued-at, and subject; the frontend SDK handles the login/logout session. Tokens are never returned to browser JavaScript. Every meeting request derives ownership from the verified subject.

## Two Vercel projects (configuration only)

Use roots `frontend` and `backend`. Select Next.js for the frontend and FastAPI for the backend; allow the frontend build to access workspace files outside its root. Add each project's own variables manually in Vercel. Use Node 24 and Python 3.12. Enable Fluid compute; the backend maximum is 300 seconds. Git deployments are disabled in both checked-in Vercel configurations during preparation. Do not deploy until authorized.

Use Hobby/free projects only. Confirm actual account plans and usage before enabling integrations. Private storage URLs go directly to the browser player; recordings never pass through the frontend proxy. The application schema has no browser role grants or RLS policies; only the backend database connection accesses it. Do not add `app` to Supabase exposed schemas.

## Checks

`pnpm typecheck`, `pnpm build`, `pnpm --filter frontend test:blob`, `pnpm check:backend`, `pnpm test:backend`, and `pnpm check:secrets`.

Backend tests create a disposable local PostgreSQL server via the **development-only** pgserver dependency. They apply the same roles and app migrations used by Docker, without a Supabase Storage schema; Blob SDK calls and Auth0 JWKS are mocked, so these tests do not prove live account connectivity. Generated test RSA keys exercise signature and claim validation with a fixture JWKS, not a real Auth0 login.

## Preparation status

Implemented foundations: protected workspace, server-side token forwarding, public health, authenticated identity, owner-scoped meeting creation/library/reads/deletion, idempotent meeting creation, and authorization before signed playback.

Real login/logout, database connectivity and private Blob playback require your configuration. Live provider capture is not integrated. The explicitly labeled demo notetaker now supports a persisted lifecycle without contacting a provider or creating recordings/evidence. See [the checkpoint guide](docs/meeting-lifecycle-checkpoint.md).

## References checked on 2026-10-01

- [Auth0 Next.js SDK](https://github.com/auth0/nextjs-auth0): v4 uses `AUTH0_DOMAIN`, `APP_BASE_URL`, `/auth/callback`, and explicit API audience. Pinned SDK peer dependencies exclude React 19.3, so React 19.2 is used.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): Hobby Fluid Node/Python maximum 300 seconds; request/response maximum 4.5 MB. Older skill examples conflict; the current official limits page governs.
- [Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi): framework discovers `app/main.py`.
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk) and [signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls).
- [Recall pricing](https://www.recall.ai/pricing): public initial five-hour offer is not proof of this account's eligibility; storage retention can introduce charges.
- [Fathom](https://www.fathom.ai/): reviewed public product references for library, recording, summary, action-item, and question organization. Preparation interface uses a simple sidebar and split library/detail view; it does not claim pixel fidelity to private product screens.

## Review workflow

Feature changes are reviewed through pull requests targeting `main`. The unmerged local-filesystem-storage PR is superseded by the single Vercel Blob setup. PR creation does not authorize merging, deployment, starting the timer, or submission.

## AI configuration and verification

Additional backend-only variables:

| Variable                   | Purpose and source                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`             | Key from the actual Groq **Free** organization/project. Confirm its plan first; do not attach a payment method.  |
| `GROQ_TRANSCRIPTION_MODEL` | Optional; defaults to `whisper-large-v3-turbo`. Use only a model verified in this account.                       |
| `GROQ_TEXT_MODEL`          | Optional; defaults to `openai/gpt-oss-20b`. Must support strict JSON Schema; no paid/model fallback is selected. |

Keep these values in `backend/.env.local` locally or the backend Vercel project's environment settings. Please configure the required values yourself; do not paste secrets into chat. For production use HTTPS origins and the same Auth0 audience in both projects.

From `backend`, `uv run python -m app.admin verify-models` performs a model-list read with your configured key. It does not prove billing eligibility or run inference. After checking the actual Free plan and remaining quotas in the Groq dashboard, the operator can run `uv run python -m app.admin approve-groq-budget --help` to record a conservative budget. Required arguments are `--audio-seconds`, `--text-requests`, `--text-tokens`, `--hours` (1–24), `--note` (verification facts, no credentials), and `--confirm-free-no-payment`. Use remaining allowances from the account, leave headroom, and avoid using the same allowance in other apps. No default grant is seeded. There is no public budget-approval endpoint.

The database reservation is an application cap, not a live Groq balance API. Reservations are retained even on errors. A human rechecks dashboard quotas before granting more capacity; budgets never replenish automatically. Provider 429 responses enforce actual account rate limits. The preparation UI shows configuration/quota failures and uses one explicit request for each transcription, summary or question. Three attempts per operation, 20 distinct questions per meeting, one concurrent provider operation, and three-minute/24-MB recordings are the fixed preparation limits. The demo capture adapter previews lifecycle stages only; it cannot create recordings.

## Processing and evidence

Apply all migrations in filename order. Generate a transcript before a summary; either can be resumed independently. Calls persist job status before inference and results in a fenced transaction. After an interrupted request, refresh the meeting; after its five-minute lease expires, use **Recover interrupted work**, then retry. Each retry uses another conservative reservation. Do not grant yourself new quota to work around a provider rejection without verifying the real Free allowance.

Summary actions are editable independently; their original source links remain attached. Q&A only uses stored segments from the current meeting. Click a transcript timestamp or source to seek the stored recording. An expired playback URL can be refreshed after authorization. These player interactions still require real-media browser verification.

`node scripts/smoke_frontend.mjs` tests production HTTP behavior after a build. It uses explicit dummy configuration in child-process memory, creates no environment files, and makes no real Auth0 calls. Native backend tests normally use pgserver. In containers unable to launch native PostgreSQL, `TEST_DATABASE_URL` can point the test process to a **fresh disposable** PostgreSQL/PGlite instance; tests create schemas and truncate fixture data, so never point it at a shared or real project. PGlite test results do not prove native concurrent-transaction behavior.

Read [the checkpoint report](docs/integration-checkpoint.md) for implemented versus tested versus blocked functionality, exact account actions, hosting limits, and proposed Sprint 1. [Feature PR descriptions](docs/pull-requests.md) describe the review scope and validation for each branch.
