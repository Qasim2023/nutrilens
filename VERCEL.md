# Deploy NutriLens to Vercel

## Repository deployment

1. Push the prepared commit, then import the repository in Vercel (or wait for
   the connected project to redeploy).
2. Use **Framework Preset: Other**, repository root, and **Node.js: 24.x**:
   - Install: `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile`
   - Build: `pnpm run build:vercel`
   - Frontend output: `dist`
3. **Do not set a provider API key in source code or Vercel environment variables.**
   Every visitor brings their own key. No shared provider secret is configured.
4. The build runs regression tests and scans the published browser assets.
   Vercel also deploys the root `api/wikivibe.js` function and its traced imports.
   Do not deploy only `dist` manually if you need the hosted relay.
5. After deployment, open Settings, select **WikiVibe**, enter your own provider
   key, fetch available models, select a model and test the connection. Existing
   Custom settings using `https://api.wikivibe.dev/v1` automatically use the relay.
   Use Bearer authentication and leave Extra headers empty for this route.
6. Verify **Connection method: Vercel relay**. This works on Vercel custom domains
   as well as preview/production domains. Other providers still use Direct mode.

## What gets deployed

The frontend builder copies only app HTML/JS/CSS, selected public assets and
pinned document-reader assets to `dist`. The generated hosting flag enables the
Vercel relay capability. The relay implementation, tests, desktop app, repository
metadata, browser profiles, environment files, screenshots and personal exports
are not published as browser assets. Vercel deploys the function separately.
The local `/api/relay` remains loopback-only and is never exposed in production.
Netlify/Pages builds remain static-only and do not deploy the Vercel function.

New visitors still receive blank endpoint/model/key fields. WikiVibe is an
optional public provider preset, not an account or embedded credential. Existing
visitor preferences are preserved; migrations do not replace their endpoint.
Manual diary logging remains available without a key.

## Restricted hosted relay and privacy

The browser posts to same-origin `/api/wikivibe`; the function sends the request
server-to-server only to `https://api.wikivibe.dev`. Supported provider routes:
`GET /v1/models`, `POST /v1/chat/completions`, `POST /v1/responses`.
Provider browser CORS permission is not required for this relay path. Other
providers still need HTTPS/browser CORS for direct requests.

A visitor-owned Bearer key is mandatory on every call. WikiVibe authenticates
that key and applies its billing/data policies. The app has no user accounts and
this is not independent site-login authentication. Same-origin Origin/Fetch
Metadata and a custom header defend against browser CSRF, not arbitrary clients.
No target URL, arbitrary provider headers, upstream cookies, redirects or shared
key are forwarded. Same-origin site cookies can reach Vercel for deployment
protection, but are never forwarded to WikiVibe. Responses requests force `store:false`; provider logging/retention
cannot be controlled by this app.

Keys and submitted food descriptions/photos/recipe text pass through Vercel and
then to WikiVibe. The function does not intentionally log or persist raw keys,
requests or responses, and API responses prohibit browser/CDN caching. Its
per-key rate limiter holds only short-lived SHA-256 hashes in instance memory.
Browser keys remain in localStorage so they survive refreshes and browser restarts; browser extensions, XSS and someone controlling the browser profile can still expose them.
Hosting/provider processing policies still apply; this is not end-to-end encryption.

Requests/responses are capped at 4 MiB; enable photo compression, especially when
attaching recipes. The upstream timeout is 50 seconds and function duration is
60 seconds. Unsupported completion parameters, streaming, and excessive token
limits are rejected. Exact key echoes are redacted from provider responses.

## Public deployment abuse protection

In-code limits are **best-effort per instance only**: 30 requests per key/minute,
120 requests per instance/minute and four concurrent upstream requests. They
reset on cold starts and are not shared across serverless replicas. Attackers can
spoof non-browser Origin headers and submit random keys, still consuming function
invocations. Do not describe these limits as comprehensive authentication or
production-wide rate limiting.

Before promoting a public site, configure supported Vercel Firewall/WAF rate
limits for `/api/wikivibe`, monitor usage/spend, and use provider spend caps.
For a private site, enable deployment protection/site-access controls. For a
larger public service, add real user authentication and distributed rate limiting
before expanding the relay beyond this fixed provider. Never add an unrestricted
arbitrary-URL proxy to avoid CORS.

## Live checks and local verification

- Fresh visitors have no key, selected model or personal meals/history.
- WikiVibe model discovery/test/photo/text analysis use `/api/wikivibe`, not a
  direct browser request to the provider. Test with your own key; do not share it.
- The hosted function rejects missing keys, cross-origin requests and other URLs.
- API responses have `Cache-Control: no-store` and no permissive CORS headers.
- Private source/environment files and missing JS files return 404.
- Bundled PDF/DOCX workers, encrypted/plain backups and mobile layout still work.

Run `pnpm run build:vercel`. With Playwright and a browser, run
`node tests/hosted-relay-ui.mjs` and `node tests/vercel-ui.mjs` (optional module and
browser executable paths). Tests use synthetic keys/data and a fake upstream;
no real provider key is committed or used. A real authenticated live-site test
requires a visitor's own key after deployment.

## Repository privacy

Ignored files include environment/deployment state, generated builds, screenshots,
private keys, releases and app backup JSON. Earlier Git history is not rewritten;
prior artifacts, author metadata or remote copies may still exist. Revoke any
real credential that was ever exposed before planning coordinated history cleanup.
