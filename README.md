# 8x-hack

Preparation checkpoint for a Fathom-inspired Google Meet assistant. pnpm monorepo: Next.js frontend, FastAPI backend, Supabase Postgres and private Storage, Auth0 identity. No deployed services, calendar integration, or paid fallback.

## Local setup

Use Node 24, pnpm 11.25.0, Python 3.12, and uv. Run `pnpm install --frozen-lockfile`, then `cd backend` and `uv sync --frozen`. Apply SQL files in `supabase/migrations` in filename order using the Supabase SQL editor. Return to the root and run `pnpm dev` (frontend :3000, backend :8000).

You create and maintain `frontend/.env.local` and `backend/.env.local` yourself. No environment files, examples, or credentials belong in Git. Python loads only `backend/.env.local` in local development, with existing process environment taking precedence. It does not load files when `VERCEL` is set or `APP_ENV` is not `development`.

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
