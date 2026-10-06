# NutriLens on Netlify — personal-use deployment

## What is ready

- `netlify.toml` configures Node 24 and `dist` as the only published directory. `package.json` pins pnpm 11.25.0.
- `pnpm run build:netlify` runs the regression tests before generating the static site.
- Static mode calls your configured AI provider directly; no local Node relay is deployed.
- PDF/DOCX extraction uses bundled browser workers. Food illustrations are local SVGs.
- `dist/_headers` supplies the tested security policy, no-index directive and revalidation policy, including for manual uploads.
- Backups include saved analyses AND diary entries, with no application settings or credential fields. Older history-only backups are still accepted.

## Before changing your site address

1. Open **Previous analyses & meals → Download encrypted backup** on the old site or desktop app after updating to this version. Choose a unique passphrase and store it in your password manager.
2. The encrypted JSON protects food history, photos and recipe text with your password. Lost passwords cannot be recovered. The legacy **Download all meals backup** is still available but produces unencrypted JSON.
3. If the old installation only offers a history backup, export it too, but remember it does not contain diary entries. Update the old installation to export both lists, or preserve the diary separately.
4. On the new site, use **Restore backup**. Existing IDs are kept, never replaced. Enter your AI key separately; backups do not carry credentials.

Localhost, desktop, Netlify URLs and custom domains have separate browser storage. Changing browsers, devices or site addresses does not move meals automatically. Private browsing or clearing site data can remove local data. There is no account database or automatic cross-device sync.

## Option A: connect a Git repository

1. Commit the app source, `netlify.toml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `scripts` and `tests`.
2. Do not commit API keys, local `.env` files, personal backups, browser profiles or generated desktop installers.
3. In Netlify, import the repository. The configuration file supplies:
   - Build command: `pnpm run build:netlify`
   - Publish directory: `dist`
   - Node: `24`; pnpm: `11.25.0`
4. Do not set `NODE_ENV=production` or omit dev dependencies for the build: the regression tests need `fake-indexeddb`. The desktop Electron binary download is disabled in Netlify's build environment.
5. You do not need an AI API-key environment variable for this browser-only deployment. Never embed a shared key in the frontend or deploy a public unauthenticated relay.

## Option B: manual upload

Run `pnpm run build:netlify`, then upload **only the contents of `dist`**, or extract the prepared `artifacts/nutrilens-netlify.zip` and upload its contents using Netlify's manual deployment interface. Never upload the project root. A manual deployment does not run the build or tests for you; rebuild the artifact after edits. The zip has `index.html` and `_headers` at its root, not inside an extra `dist` folder.

## Enable private access yourself

Repository privacy does not make the deployed website private. Source code cannot choose your Netlify account's visitor-access setting.

In Netlify's project settings, go to **Project configuration → General → Visitor access → Project visibility**, choose **Private**, and set the scope to **Production and previews**. On credit-based Free and Personal plans, private access is restricted to the Team Owner. Older plan interfaces may instead offer Password Protection / Team login. Protect production AND deploy previews/branch deploys. If your plan uses a different protection option, use Netlify's server-side protection rather than a password coded into this website.

These settings follow Netlify's current visitor-access documentation; this preparation has not changed anything in your Netlify account.

Verify the published address in a separate signed-out browser before entering your API key. It should require the authorized Netlify login or your configured protection. `noindex` and an unshared URL are NOT authentication. If your account offers no suitable protection, treat the site as public or choose another protected host.

## Configure your AI provider after deployment

1. Sign into your protected site and open **Settings**.
2. Set your provider's **HTTPS** API endpoint, your personal API key and model.
3. Fetch models or enter the model ID, then use **Test connection**.
4. The provider must permit browser CORS requests from the deployed origin, including your authentication headers. Private Netlify access does not bypass CORS.
5. If browser requests fail, use a CORS-compatible provider or design a separately authenticated backend. Do not disable browser security or expose a shared proxy key.
6. Local HTTP providers such as a model server on your computer are not part of this HTTPS static deployment. Use the desktop app for them or a deliberately secured HTTPS setup.

Your API key and custom headers are saved only in tab-scoped sessionStorage, not persistent localStorage settings. Browser session restoration can retain them; same-origin JavaScript can still access them. This is not an encrypted credential vault. Use a dedicated restricted key and set provider-side usage limits if available. Site access protection does not change that storage model. Avoid untrusted browser extensions; clear the key in Settings when finished if you do not want it retained. A backend is necessary if you want to keep the provider key out of browser storage entirely.

## Privacy and accuracy

Food descriptions, attached photos and extracted recipe text are sent to your configured AI provider when analysing or estimating diary calories. Document extraction itself is local. Provider retention policies and ordinary Netlify hosting logs are separate from local meal storage. Do not put sensitive documents in the public repository.

Nutrition values are estimates, not medical advice. Representative food illustrations do not show the actual portion. Check portion assumptions before relying on results.

## Final live-site checklist

- Confirm the site is protected in a signed-out browser, including preview URLs.
- Test connection, model discovery and one small text analysis using your real provider.
- Test a food photo and a text-based PDF/DOCX recipe.
- Check single-food/multi-food images, diary logging and reopening saved results after refresh.
- Download and restore an all-meals backup, and keep an offline copy.
- Test on your phone; check language switching and dark/light mode.
- Confirm missing asset URLs return 404 rather than the application HTML.

Local tests use isolated browser profiles and synthetic providers. They never verify your real provider's CORS policy or your Netlify account access settings. Those two checks must be done after deployment.

## Security policy and limits

The generated `_headers` now also supplies HSTS and same-origin resource isolation. Enable HTTPS and private visitor access in the host; headers are not authentication. Live browser meals remain unencrypted. See [SECURITY.md](SECURITY.md) for full scope, testing, and the unresolved moderate dependency advisory.
