# NutriLens security

## Scope and limits

NutriLens is a browser application with an optional loopback-only local relay
and a provider-restricted WikiVibe Vercel function. There are no accounts, password database, SQL queries,
or shared production API keys. These protections are defense in depth, not a
claim that the app is attack-proof or an audited medical-data vault.

Do not expose the local relay to the internet. The hosted function requires a visitor-owned provider key but has no independent
site-account authentication. The provider authenticates that key. Site-access protection must be configured with the host;
an unshared URL, CSP and noindex are not access controls.

## Implemented protections

- Shared Content Security Policy on local responses (including errors) and Netlify
  deployments: no inline/eval scripts, inline event handlers, plugins or framing.
  Inline CSS remains allowed because existing rendering uses inline styles.
  HTTPS provider connections remain configurable rather than restricted to one vendor.
- No-sniff, no-referrer, same-origin opener/resource policy, restricted device
  permissions, disabled DNS prefetch, and no caching of local/API responses.
- HSTS for HTTPS hosting for one year, without preload or uncontrolled subdomains.
  HSTS does not create a certificate: enable the host's HTTPS and HTTP redirect.
- HTTPS-only remote endpoints; HTTP exceptions are literal loopback model hosts
  in the local app. Hosted HTTPS pages cannot use HTTP model endpoints.
- Provider requests refuse redirects, omit ambient browser cookies/referrers,
  and have timeouts and a 24 MB response limit.
- The relay checks Host and same-origin Origin/Fetch Metadata, requires a custom
  request header and JSON media type, allowlists provider origins/routes/methods,
  rejects malformed envelopes and unsafe headers, and refuses upstream redirects.
  Configured additional origins are operator trust decisions, not arbitrary user input.
- Body limits (7 MB encoded document requests and 18 MB photo/AI requests), 16 KB
  HTTP-header limit, 64-header cap, 15-second header timeout, 30-second body timeout,
  and bounded keep-alive. The existing document parser runs in workers with a
  25-second timeout, memory limits and external document access disabled.
- Per-process relay/API limit: 120 requests per minute and four concurrent
  requests. Rejections return HTTP 429 and Retry-After. These are local abuse
  controls, not distributed internet DDoS protection.
- Public-file/build allowlists keep backend code, .env, workspace files and meal
  data out of the deployed artifact. Existing rendered user/provider text is
  escaped; stored images accept only supported raster data URLs.

## Credentials

API keys and custom header values are removed from persistent localStorage
settings and kept in tab-scoped sessionStorage, with an in-memory fallback when
session storage is unavailable. Existing credentials migrate on first load.
Reload retains them; a new independent tab needs a key. Browser session restore
or tab duplication may restore/copy sessionStorage. Clear the key or reset
settings when finished on a shared device.

Session storage is NOT encryption and remains readable by same-origin JavaScript,
XSS, browser extensions and someone controlling the browser profile. If persistent
storage cannot be written, a legacy credential copy may remain; clear browser site
data on a shared device. Use restricted personal keys with provider spend caps.
Keeping shared service secrets out of the browser requires a real authenticated
backend, not a secret embedded in frontend code.

## Encrypted backups

Choose **Previous analyses & meals → Download encrypted backup**. Use a unique
password of at least 12 characters, preferably a long passphrase stored in a
password manager. Lost passwords cannot be recovered.

The file uses Web Crypto AES-256-GCM (128-bit authentication tag), a fresh random
96-bit IV and 128-bit salt, and PBKDF2-HMAC-SHA256 with 600,000 iterations.
Versioned additional authenticated data binds the encryption format. Passwords
and derived keys are never persisted or exported; keys are non-extractable.
Parameters, encoding and size are bounded before password derivation. Wrong
passwords and damaged ciphertext fail before any storage import. Existing import
validation and rollback protections still apply after decryption.

Explicitly saved Recipe Studio recipes are stored locally without connection
settings or credentials. Markdown and JSON recipe exports are **unencrypted**
and contain the recipe text and nutrition estimates, not application settings
or keys. Recipe exports are separate from all-meals backups. Clearing browser
site data removes saved recipes; there is no server-side recipe sync.

Live diary, saved photos, extracted recipes, composer contents and analysis
history remain **unencrypted** in this browser. The old **Download all meals
backup** produces **unencrypted JSON** for compatibility. Both backup options
exclude application settings and credential fields, but free-text meal/recipe
content can itself contain sensitive information. Encrypted and older plaintext
backups are restored through **Restore backup**. Encrypted plaintext size is
limited to 70 MB so the encoded file fits the existing 100 MB import limit.
JavaScript cannot guarantee erasure of every password/string copy from memory.

## SQL injection and future backend requirements

There is no SQL database in the current app, so there is no SQL query surface to
patch. Do not add a keyword filter or rely on encryption to prevent SQL injection.
If a backend is introduced, require bound parameters/prepared statements for
values, allowlisted identifiers, least-privilege database accounts, and tests
proving SQL-looking input is treated only as data.

Before turning this into a public account-based service, complete a threat model
and add server-side authorization on every resource, managed authentication/MFA,
secure HttpOnly/Secure/SameSite sessions and CSRF defenses, shared-secret storage,
KMS-backed encryption where needed, audit/security monitoring, external rate
limits/WAF, tested private backups, retention/deletion controls, privacy review,
and an independent security assessment. Passwords must be hashed, not reversibly
encrypted. Do not add cosmetic frontend login or home-grown crypto for accounts.

## Hosting and validation

Vercel uses the checked-in vercel.json security headers, tested against the shared
policy; pnpm run build:vercel runs regressions and a published-content privacy scan.
Netlify uses the generated dist/_headers. Verify the deployed HTTPS response
headers and signed-out access restriction before entering personal credentials.
GitHub Pages does not apply Netlify's _headers file: use a host/proxy that supports
these response headers if the complete policy is required. Do not publish the
source workspace instead of dist. Rebuild before redeploying.

- Run npm test for all automated regressions, including tests/security.test.mjs.
- Run npm run build:netlify for the test-first allowlisted deployment artifact.
- Browser coverage: tests/security-ui.mjs and tests/netlify-ui.mjs (Playwright and
  an installed compatible browser are required). Tests use synthetic data only.
- Run pnpm audit --prod and track all advisories, including moderate findings.
  Dependency-update configuration covers npm and GitHub Actions weekly.

### Known dependency advisory — October 6, 2026

The installed production audit reports one moderate denial-of-service advisory:
GHSA-hp3w-g68c-fv3c, sprintf-js <=1.1.3 through mammoth → argparse → sprintf-js,
with no patched version reported. Source inspection found argparse used by
Mammoth's bin/mammoth CLI, not its extractRawText application entry point; this
app does not run that CLI. This reduces observed reachability but is not a formal
proof of non-exploitability, and the advisory remains unresolved. Do not hide the
finding or force an unreviewed incompatible dependency replacement. Re-audit when
upstream publishes a supported fix and review the document parser at that time.

## Reporting

Report suspected vulnerabilities privately to the project maintainer rather
than posting keys, personal meals, photos or exploitable details in a public issue.
Revoke exposed provider keys immediately. No dedicated reporting address has
been configured yet; establish one before public launch.

## WikiVibe hosted function

See VERCEL.md for the fixed-target/route restrictions, Bearer-key requirement,
same-origin browser defenses, no-store response policy, 4 MiB size limits,
50-second upstream timeout and best-effort per-instance limits. Keys and food
pass through Vercel. No raw credentials or requests are intentionally logged or
persisted by application code, but hosting/provider policies still apply.
Same-origin checks are not authentication against non-browser clients, and
instance limits are not distributed. Configure edge/WAF abuse protection and
provider spend caps; add real account authentication/distributed limits before
expanding a public service. Never make the loopback relay public.
