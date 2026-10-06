# Deploy NutriLens to Vercel

## Repository deployment

1. Push the prepared commit to your Git repository. Import that repository in Vercel.
2. Set **Framework Preset** to **Other**, **Root Directory** to the repository root,
   and **Node.js Version** to **24.x**. Keep the checked-in `vercel.json` settings:
   - Install: `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile`
   - Build: `pnpm run build:vercel`
   - Output: `dist`
3. **Do not set a provider API key in Vercel, source code, or build variables.**
   No environment variables or hosted backend are required.
4. Deploy. The build runs all unit/regression tests first and scans first-party
   published files for credential-shaped tokens, hard-coded credentials and
   personal filesystem paths. Failed tests/privacy checks stop deployment.
5. Test the deployed HTTPS URL using a fresh browser profile. Open **Settings**:
   the provider is Custom, and the endpoint, model and API key are blank.
6. Each visitor chooses their own compatible provider, enters their own URL and
   API key, fetches/selects a model, then tests the connection. Use a vision model
   for photos. Requests can consume that visitor's provider quota.

## What gets deployed

The builder copies only `index.html`, first-party JS/CSS in `src/`, selected
public app assets, and document-reader assets from pinned dependencies. The
output is static even on custom domains, so there is no `/api/relay` backend.
The local server, desktop app, tests, repository metadata, screenshots, browser
profiles, environment files and meal exports are not published. Security headers
are configured directly in `vercel.json`; their values are tested against the
app's shared security policy. Missing assets are not rewritten to index.html.

Public provider presets contain only service URLs and optional model suggestions,
not accounts or credentials. New visitors receive no default endpoint or model.
Provider migrations preserve each visitor's own browser settings; they do not
inject an endpoint. Manual diary logging works without an API. Demo mode, when
explicitly enabled, uses clearly labelled synthetic examples only.

## Browser API compatibility and privacy

The provider must offer an OpenAI-compatible HTTPS API and permit browser CORS
from your deployment origin, including Authorization/custom headers. Vercel
static hosting does not bypass a provider's CORS restrictions. If requests are
blocked, use a compatible provider or a separately managed authenticated API
endpoint; never add an open relay or shared key to this site.

Keys/custom headers stay in tab-scoped sessionStorage and are sent only to the
visitor-configured endpoint. They are not encrypted, and session restoration,
extensions, XSS or someone controlling the browser profile can expose them.
Use restricted visitor-owned keys with spending caps. Meals and history remain
local to the browser; changing site addresses does not transfer them. A fresh
visitor's browser starts empty. The app has no shared user database or analytics.

## Final live-site checks

- Fresh Settings has no endpoint, API key or model, and Direct transport is enforced.
- A fresh browser contains no meals/history and sends no AI requests until configured.
- Models, connection testing and photo/text analysis work with a visitor-owned key.
- PDF/DOCX recipe extraction works from bundled assets without a file-upload backend.
- `/.env`, `/server.mjs`, `/README.md`, `/vercel.json` and missing JS files return 404.
- HTTPS responses have CSP, no-referrer, nosniff and framing restrictions.
- Test on desktop/mobile. Validate the real provider's CORS from the live URL.

## Local browser verification

With Playwright and a compatible browser installed, run `node tests/vercel-ui.mjs`
(optionally pass a Playwright module path and browser executable). The test uses
only synthetic data and checks fresh visitor isolation, blank credentials, direct
requests, hidden-file 404s, the exact Vercel headers and mobile layout.

## Repository privacy

`.gitignore` excludes `.env*`, `.vercel/`, local artifacts, private-key files,
generated builds, desktop releases, and app backup JSON. Previously tracked
artifacts are removed from the current repository snapshot but kept locally.
This is not a Git-history rewrite: earlier commits, existing remote copies and
commit-author metadata can still contain prior information. If a real secret
was ever committed, revoke it and separately plan a coordinated history cleanup.
