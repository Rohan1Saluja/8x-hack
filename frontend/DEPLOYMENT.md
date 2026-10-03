# Frontend deployment

Vercel project root: `frontend`.

Production frontend: https://mavri-ai.vercel.app/

Set `APP_BASE_URL` to `https://mavri-ai.vercel.app` in Vercel and redeploy.
The Auth0 operator must register this origin for logout/web origins and
`https://mavri-ai.vercel.app/auth/callback` for callbacks, and update the
application name, Universal Login branding, and logo URL to Mavri.
Keep `BACKEND_URL` pointed at the configured backend production origin; do not
infer a backend rename from the frontend domain.
