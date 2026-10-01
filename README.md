# 8x-hack

Preparation checkpoint for a Fathom-inspired Google Meet assistant. pnpm monorepo: Next.js frontend, FastAPI backend, Supabase Postgres and private Storage, Auth0 identity. No deployed services, calendar integration, or paid fallback.

## Local setup

Use Node 24, pnpm 11.25.0, Python 3.12, and uv. Run `pnpm install --frozen-lockfile`, then `cd backend` and `uv sync --frozen`. Apply SQL files in `supabase/migrations` in filename order using the Supabase SQL editor. Return to the root and run `pnpm dev` (frontend :3000, backend :8000).

You create and maintain `frontend/.env.local` and `backend/.env.local` yourself. No environment files, examples, or credentials belong in Git. Python loads only `backend/.env.local` in local development, with existing process environment taking precedence. It does not load files when `VERCEL` is set or `APP_ENV` is not `development`.

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
| `DATABASE_URL`              | Backend             | Supabase Connect → transaction pooler URI (port 6543); use TLS (`sslmode=require`), prepared statements disabled by the app. |
| `SUPABASE_URL`              | Backend             | Project URL from Supabase project settings.                                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend             | Supabase legacy service-role key for server-only private Storage operations; never use the anon key here.                    |
| `APP_ENV`                   | Backend             | `development` locally; `production` for the production project.                                                              |
| `RECORDING_BUCKET`          | Backend, optional   | Defaults to `recordings`, created private by the migration. Keep the default unless you also update the bucket migration.    |
| `PLAYBACK_URL_SECONDS`      | Backend, optional   | Signed playback URL lifetime; default 300, maximum 600 seconds.                                                              |

Auth0: register `http://localhost:3000/auth/callback` under Allowed Callback URLs and `http://localhost:3000` under Allowed Logout URLs and Allowed Web Origins. Add the same paths on the eventual production frontend origin. Enable refresh tokens for the API/application if using `offline_access`. The backend verifies signature, RS256, issuer, audience, expiry, issued-at, and subject; the frontend SDK handles the login/logout session. Tokens are never returned to browser JavaScript. Every meeting request derives ownership from the verified subject.

## Two Vercel projects (configuration only)

Use roots `frontend` and `backend`. Select Next.js for the frontend and FastAPI for the backend; allow the frontend build to access workspace files outside its root. Add each project's own variables manually in Vercel. Use Node 24 and Python 3.12. Enable Fluid compute; the backend maximum is 300 seconds. Git deployments are disabled in both checked-in Vercel configurations during preparation. Do not deploy until authorized.

Use Hobby/free projects only. Confirm actual account plans and usage before enabling integrations. Private storage URLs go directly to the browser player; recordings never pass through the frontend proxy. The application schema has no browser role grants or RLS policies; only the backend database connection accesses it. Do not add `app` to Supabase exposed schemas.

## Checks

`pnpm typecheck`, `pnpm build`, `pnpm check:backend`, `pnpm test:backend`, and `pnpm check:secrets`.

Backend tests create a disposable local PostgreSQL server via the **development-only** pgserver dependency. Supabase bucket metadata is a fixture; these tests do not prove actual Storage or Auth0 account connectivity. Generated test RSA keys exercise signature and claim validation with a fixture JWKS, not a real Auth0 login.

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
