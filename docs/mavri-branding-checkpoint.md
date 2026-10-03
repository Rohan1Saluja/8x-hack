# Mavri branding cleanup

Base: default branch `main`, commit `6786add1c4bd6949d283df64e09d0c2bdff93a02`.

## Occurrence classification

Reviewed tracked text case-insensitively for Fathom, its domains, 8x, eightx,
old title strings, brand labels, and hard-coded URLs before targeted edits.

| Location | Classification and disposition |
| --- | --- |
| Frontend layout, landing metadata, social card | Current product identity: Mavri; production metadata origin updated. |
| Landing, workspace, demo components | Visible brand/accessible names: Mavri. Generic functional copy retained. |
| Isolated visual fixture title | Current development display title: Mavri. |
| FastAPI title | Current display metadata: Mavri API. Existing import-order lint failure in this file corrected. |
| README introduction/title | Current identity: Mavri, with explicit 8x assignment and Fathom source-product provenance retained. |
| README reference link | Intentional source-product research citation, retained. |
| README/frontend deployment origin | Current frontend: https://mavri-ai.vercel.app. |
| README/backend deployment URL | Existing documented backend URL retained pending confirmation; not asserted as newly verified. |
| AGENTS.md, CAPTURE-TEST.md, capture script, .agent-logs | Assignment/capture identity and historical records, untouched. |
| Preparation guide API audience | Technical Auth0 identifier; unchanged, not a product or deployment URL. |
| Package names, Compose/database names, test fixtures, temporary-file prefixes | Internal identifiers, intentionally unchanged. |
| Historical checkpoint notes and screenshots | Historical evidence, untouched. |
| Favicon, SVG icon, Apple icon | Visually inspected brand-neutral cyan signal assets, preserved. |

No manifest exists. No checked-in Auth0 branding configuration was found. Existing
route-level canonical and OG URL resolve against the new metadataBase; no global
canonical was added to authenticated pages. No old frontend URL or old product
identity remains in current frontend source. Remaining Fathom mentions are the
reference/provenance text, immutable history, and the explicitly unverified backend
URL exception above. No bulk replacement was applied to documentation or logs.

## Operator handoff

Set frontend Vercel `APP_BASE_URL` to `https://mavri-ai.vercel.app` and redeploy.
Update Auth0 application name/Universal Login/logo to Mavri and register:
- Callback: `https://mavri-ai.vercel.app/auth/callback`
- Allowed Logout URLs / Allowed Web Origins: `https://mavri-ai.vercel.app`

The connected Vercel team returned an empty project list; project lookups returned
not found. Thus the configured backend production URL could not be verified.
Keep the existing backend setting until the operator confirms its actual domain;
no new backend URL was invented. No secrets, env files, settings, routes, auth
behavior, database identifiers, lifecycle, AI processing, or storage were changed.

## Verification

- Frontend `pnpm typecheck`: passed.
- Default `pnpm build`: blocked by Turbopack worker port binding (EPERM), including
  the elevated retry. No source/config workaround committed.
- `pnpm --filter frontend exec next build --webpack`: passed; existing Auth0 SDK
  dynamic-dependency warnings remain.
- Backend Ruff: passed after organizing the existing main.py imports.
- Backend pytest: 42 passed; one platformdirs runtime-directory warning.
- Secret scan, capture history validation against base, and whitespace check: passed.
- Local production browser: landing and demo at 1440px and 390px show Mavri,
  correct titles, no old branding, no horizontal overflow or page errors.
- Existing isolated workspace fixture at both sizes: Mavri visible, no overflow.
  This uses synthetic evidence and is not proof of authenticated production access.
- Rendered canonical, OG site name/title/URL/image and Twitter metadata verified;
  all absolute social URLs use the Mavri frontend origin.
- Local favicon, SVG, Apple icon and OG routes returned HTTP 200. Generated OG card
  visually inspected: Mavri / AI Meeting Intelligence. Local demo CTA works.
- Cloud browser reached production: it still serves the pre-merge 8x title and
  wordmark. Deployment was not changed. Post-deployment asset and branding checks,
  authenticated workspace and complete Auth0 round-trip still require verification.

## Capture status

Read AGENTS.md, docs/agent-capture.md and CAPTURE-TEST.md. No genuine automatic
prompt/final-response callback or selected-model accessor is exposed. Existing raw
logs remain untouched. This new conversation has no preceding delivered exchange
to append before feature work. Its selected model has not been confirmed; do not
infer it from the planned executor. The current prompt/final pair requires confirmed
model metadata and a post-delivery close-out under the manual protocol. No draft
final response was pre-logged and no complete capture claim is made.
