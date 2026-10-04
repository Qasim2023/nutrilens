# NutriLens

A lightweight food nutrition app with photo and text input, configurable AI providers, nutrition charts, local history and exports.

## Run

Node.js 22.13 or newer is required. Dependencies are already installed in this workspace. On a new checkout, install them first:

```powershell
npm install
node server.mjs
```

Open `http://localhost:5173/`. To use another port: `node server.mjs 8080`.
**Do not double-click index.html:** ES modules and the local relay need an HTTP server.

## Your WikiVibe endpoint

The app is configured for `https://api.wikivibe.ru/v1`.

1. Open **Settings**. Enter your provider key in the masked API key field (never share it in chat).
2. Keep **Connection method → Local relay**. This avoids the provider's browser CORS restrictions.
3. Click **Fetch available models**, then choose an actual model ID from the dropdown.
4. Click **Test connection**. This sends a small prompt and may consume provider quota.
5. Attach a photo and/or describe food, then click **Analyse**. Use a vision-capable model for photos.

Settings save automatically. Existing keys, chosen model IDs, appearance and history are preserved when upgrading. Legacy saved analyses are migrated into durable history on first load. The endpoint requested for this project is applied once; later customizations are not overwritten.

## Compatibility

- Base URLs, full `/chat/completions` URLs and full `/responses` URLs are supported. Query parameters are retained and the path is not duplicated.
- **API format → Auto** starts with Chat Completions (or Responses for a full Responses URL), falling back when the route is unsupported. Pick an explicit format if your provider needs one.
- JSON and server-sent-event output are parsed for both formats.
- Unsupported JSON mode, temperature and legacy token parameters receive bounded compatibility retries.
- API errors are shown instead of fake results. Bad JSON receives one repair attempt; HTML, empty responses and incomplete output are rejected.
- Fetching models uses `/models` even when you entered a full completion URL.
- This supports OpenAI-compatible formats, not arbitrary provider-specific schemas. Anthropic native Messages and Gemini native APIs require a compatible gateway.
- Demo mode is opt-in, clearly labelled sample data. It does not analyse photos and is not a nutrition database for real use.

## Privacy and relay security

Your API key is stored in browser localStorage. This is convenient for local/personal use but is not an encrypted vault; anyone with access to that browser profile can access it. The local server forwards the key and food data to your chosen provider, does not persist credentials, and does not log request bodies. Your provider's data and billing policies still apply.

The server binds only to `127.0.0.1`. Relay requests require the app's exact origin plus a custom header. Upstream redirects are refused; other origins and non-API paths are rejected. Only public app assets are served (not `.env` or server source).

WikiVibe and the listed provider/local-runner origins are trusted by default. For another custom provider, explicitly trust its origin before starting the server:

```powershell
$env:NUTRILENS_ALLOWED_ORIGINS = "https://your-provider.example"
npm install
node server.mjs
```

Use an origin, not a full API path. Multiple origins can be comma-separated. Do not trust unrecognized hosts or metadata/internal-service addresses. Alternatively use **Direct browser requests** if that provider allows CORS.

On static hosting the relay is unavailable: choose Direct mode. The relay is intended for local use, not as a public multi-user proxy.

## Features

Photo attach/paste/drop, voice input where supported, text descriptions, photo compression, calories and macros, micronutrients, item breakdown, estimated nutrition-quality scores, suggested swaps, local history, Markdown/CSV exports and printing. Dark/light themes, five accents, configurable result sections. Nutrition and allergen estimates are uncertain; do not rely on the app for medical decisions or food allergy safety.

## Tests

```powershell
node --test tests/*.test.mjs
```

The suite uses mocked providers and a loopback test server, not a live key. It covers URL normalization, auth, Chat/Responses requests, images, streamed output, compatibility retries, error handling, cancellation, migrations, and relay security.

## Files

- `src/connection.js`: URLs, headers, transport, API-format compatibility, stream parsing
- `src/ai.js`: nutrition prompt, output validation, model discovery and connection test
- `src/app.js`: UI controller
- `src/store.js`: local settings/history
- `src/image.js`: image processing
- `src/render.js` and `src/styles.css`: rendering, charts, appearance
- `server.mjs`: loopback static server and restricted relay

## Recipe attachments

Use **Attach files** or drag files onto the composer. Supports PDF, Word DOCX, TXT, Markdown, CSV, TSV and JSON, with up to five recipe files (5 MB each). Each extracted file shows its filename, size, status and a text preview; remove individual attachments without modifying the originals. You can combine a food photo, several recipe files and a typed request.

TXT/Markdown/CSV/JSON are read in the browser. PDFs and DOCX are extracted by the local server using PDF.js and Mammoth, in resource-limited workers. Files are never written to disk by the parser or uploaded to an external document-parsing service. Extracted text goes to your configured AI provider only when you analyse. Raw files are not retained in history; analysed results keep reference filenames. Reattach files after a reload.

The parser accepts at most 30 PDF pages and 60,000 characters per document; combined recipe text is limited to 120,000 characters. No silent truncation. Image-only/scanned or locked PDFs show an actionable error: attach a recipe photo instead or use an unlocked/text export. Legacy `.doc` is not supported; save as `.docx`.

The AI estimates **the whole recipe by default**. Ask for “one serving” to use the stated serving count. Missing serving counts or quantities remain uncertain. Documents are reference data, not instructions that can override the nutrition prompt. Demo mode cannot analyse real attachments.

## Shortcuts

Enter analyses; Shift+Enter inserts a newline. Ctrl/Cmd+Enter still works. IME composition and held keys do not submit. Escape closes Settings. The drawer traps keyboard focus and restores it on close.

## Daily food diary

Open **Daily food diary** using the navigation above the composer. Choose a date, enter a food description and meal category, and leave calories blank to let your configured AI estimate them when you press **Add entry**. Include quantities for a better estimate (e.g. “2 eggs and 1 slice of toast”). The estimate is automatically added to that selected day and category and marked **AI estimate**. Expand **Estimated portion** to review the assumptions. Enter calories explicitly (including zero) to skip AI; you can also leave the food name blank for a calorie-only manual entry. No AI connection is required for manual entries.

The diary automatically sums every entry for the selected calendar day, with a large **Total calories consumed** display, entry count, and breakfast/lunch/dinner/snacks/other subtotals. The navigation badge always shows today's total, even when viewing another day. Date boundaries use the browser's local calendar date rather than UTC.

Use **Log to diary** on a real AI result (including a reopened history result) to prefill the food and calories. Check the portion, adjust the calories/category/date if needed, then press **Add entry**. Nothing is added automatically: analysing food does not imply you ate it. Demo results cannot be logged as real food estimates; use a manual entry instead.

Entries can be edited or deleted; **Clear this day** affects only the selected date and requires confirmation. Totals update immediately. Diary entries are stored independently in this browser's localStorage under `nutrilens.diary.v1`, survive reloads, and sync across tabs via storage events. For blank-calorie estimates, only the entered food description is sent to your configured AI through the existing connection method. Other diary entries, the date, the meal category and unrelated recipe attachments are not included. Manual-calorie entries stay local. Clearing browser storage removes the diary; different browsers/devices have separate diaries. If storage is full or corrupted, the UI reports the failure instead of claiming entries were saved.

Calories support one decimal place; totals use integer-tenths arithmetic to avoid floating-point addition errors. Zero-calorie entries are supported. No diet target or medical recommendation is imposed.

Implementation: `src/diary-store.js` (validation, calendar handling, storage and totals), `src/diary.js` (diary interface). Tests: `tests/diary.test.mjs`.

### Automatic diary calorie estimates

Blank-calorie submissions require a real configured model and key (or a no-auth local provider). Demo mode cannot create automatic estimates. While estimating, submission and date/entry controls are locked to prevent duplicate or misdated entries. **Cancel estimate** stops the request without logging food. Authentication, network or invalid-response errors keep your description and leave the total unchanged; enter calories manually or retry. Clearing calories on an edited entry re-estimates that entry rather than adding a duplicate. If an estimate finishes but local storage cannot save it, the returned calories remain in the form so a retry need not call AI again.

Tests: `tests/diary-estimate.test.mjs` covers automatic/manual selection, zero calories, configuration failures, errors, cancellation, edits, persisted assumptions and diary validation. `tests/diary-ui-server.mjs` is an isolated loopback mock-provider UI test server (ports 5188/5190); it never sends food to an external provider.


## Meal library: diary foods and Previous analyses

In **Analyse Food**, click **Previous analyses & meals** (or the history icon) to open the collapsible **left-side menu**. Close it with the X, Escape, or clicking outside it. It is hidden by default and never permanently takes up space. Search works across the selected list, and **Show more meals** reveals older records without deleting them.

- **Diary meals** lists all logged meals across dates with their date/category and logged calorie amount. Select a named meal to load its description, then press Analyse or Enter for a fresh detailed nutrition breakdown. The diary entry stays unchanged; logged calories are not treated as ground truth for the new estimate. Calorie-only diary entries need a food name before detailed analysis. Each diary row also has a **Detailed nutrition** shortcut.
- **Previous analyses** lists every saved real analysis, newest first. **View full result** reopens the original calories, macros, micronutrients, item breakdown, confidence/portion notes, quality score, allergens and swaps without calling AI. It uses the original display-section choices, not your current settings. You can reopen old results repeatedly, switch meals and refresh without losing them.
- **Analyse again** restores the original description, full processed food photo and extracted recipe text into the composer. Nothing is sent until you press Analyse. A fresh analysis makes a separate saved record; it never replaces the old one.

Every completed real Analyse Food result is saved automatically, independently of diary storage and regardless of the former “Save history” preference. Demo estimates are not saved as genuine analyses. New history uses **IndexedDB** (`nutrilens.meal-history.v2`) with full result and input snapshots, and has **no entry limit, TTL, or automatic deletion**. Storage commits are confirmed before showing “Saved”. If saving fails, the result stays on screen and a visible **Retry saving** action appears; the app does not silently drop older meals. Metadata and snapshots contain no API keys or auth headers.

The earlier `nutrilens.history.v1` localStorage history is migrated once, preserving existing IDs and nutritional data; the legacy copy is retained as a recovery copy and is not re-imported after intentional deletion. Older records may have only a small thumbnail and no original recipe text because the previous app did not save those inputs. Nutrition results still reopen, but unavailable originals cannot be reconstructed; reattach recipes if re-analysing them. History already dropped by the old 24-item cap cannot be recovered retroactively.

**Local storage is not a cloud backup.** Saved results are retained across ordinary refreshes and closing/reopening the site in the same browser profile. Clearing site data, private-browser sessions, losing the device or browser storage eviction can still remove them. The app requests persistent browser storage where supported. Use **Download history backup** for a private full JSON backup including results, images, recipe text and display options. **Restore backup** merges valid records without replacing existing IDs. Deleting an individual analysis requires confirmation and affects only that saved result, not the diary. Static hosting, different ports and different browsers have separate histories.

**Delete all analyses** appears in the Meals & analyses footer when **Previous analyses** is selected. It deletes every saved analysis (including the legacy recovery copy) while keeping all diary meals and daily totals unchanged. On the **Diary meals** tab, the button becomes **Delete all diary meals**: it deletes every diary entry across all dates and updates daily totals, while keeping saved analyses. Neither action is limited by the current search. Each requires confirmation and cannot be undone; the history backup covers analyses, not diary entries. Settings and provider credentials are not changed. The button is disabled when the selected list is empty or cannot be read. If a storage operation fails, an error is shown instead of a success message.

Tests: `tests/meal-library.test.mjs` covers independent tab-specific bulk deletion, preservation of the other list, deletion across dates, independent storage backends, aborted transactions and storage failures. `tests/history.test.mjs` covers real IndexedDB persistence, legacy migration, more than 24 saved meals, exact rendering restoration, independent re-analysis records, no credential persistence, backup/restore, quota errors and diary selection. The isolated bulk-delete browser check is `tests/meal-library-ui.mjs` (accepts a Playwright package path and optional browser executable), covering confirmation/cancellation, search filters, mobile layout, totals, reloads and storage failures. The isolated mock-provider UI test uses `tests/diary-ui-server.mjs` (ports 5188/5190) and does not send data to a real AI provider.

## Language

Open **Settings → Language** to choose Norwegian Bokmål, English, Polish, German, Tagalog, French, Spanish, Norwegian Nynorsk, Russian, Hindi or Urdu. Urdu uses a right-to-left layout. The interface updates immediately and the preference is saved in this browser. New Analysis and Diary estimates ask your configured AI to respond in the selected language, without changing JSON keys, quantities or nutritional numbers. Voice input uses the selected locale. Previously saved food names and AI descriptions keep their original text; they are not automatically translated or sent for another AI request. Technical provider errors may retain the provider’s original language.

## AI nutrition estimates

Analysis and blank-calorie Diary entries use the configured AI model’s food knowledge and best judgment. The app does not search nutrition websites or cross-check external nutrition databases. Calories, macros and micronutrients remain estimates; check quantities, preparation and portion assumptions. Manual diary calories bypass the AI. Existing saved results and diary meals retain their nutrition values, without source badges or comparison panels.

## Deploy to GitHub Pages

The repository includes `.github/workflows/pages.yml`. It builds a static-only
`dist/` artifact and deploys it on pushes to `main` or `master`, or when manually
run from the Actions tab.

1. Commit and push the app files, `scripts/`, `.github/workflows/pages.yml`,
   `package.json`, `pnpm-lock.yaml`, and tests. Do not commit API keys or `.env`.
2. In the GitHub repository, open **Settings → Pages** and select
   **GitHub Actions** as the source.
3. Push to `main` or use **Actions → Deploy NutriLens to GitHub Pages → Run workflow**.
4. Open the URL shown by the successful deployment. For the current repository,
   the default URL is `https://sato2023.github.io/nutrilens/`.
5. Open the app's Settings and enter your own provider URL, model, and API key.

### Static-hosting behavior

- Relative asset and worker paths support repository subpaths and custom domains.
- The build sets static mode even on a custom domain and includes `.nojekyll`.
- PDF and DOCX text extraction runs in browser workers using bundled dependencies;
  no document-upload backend is needed. Scanned/image-only recipes need a photo.
- Analysis, Diary, and model discovery call your provider directly. The provider
  must support HTTPS and CORS, including the headers used by your authentication.
  GitHub Pages cannot run `server.mjs` or its `/api/relay` endpoint. If the provider
  blocks browser requests, configure a separately hosted trusted authenticated
  proxy as the API endpoint; do not put a shared proxy secret in the site.
- Each user's API key stays in that browser's localStorage and is sent to the
  configured endpoint. There is no server-side secret storage on the static site.
  Use a personal restricted key, not a shared production credential.
- Settings, meal history, and diary data are browser-local, not synced between
  devices. The Pages origin has separate storage from your local development site.
- The local Node server still supports relay mode when running `pnpm start`.

### Verify before deployment

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run build:pages
```

`tests/pages.test.mjs` covers worker-message isolation, static transport, legacy
settings migration, and the artifact allowlist. The end-to-end check serves the
built site under `/nutrition-project/` with no backend and a local mock provider:

```sh
node tests/pages-ui.mjs /absolute/path/to/playwright /absolute/path/to/browser
```

Both arguments are optional when Playwright and its Chromium are already installed.
This checks PDF/DOCX parsing, CORS requests, Analysis, Diary, persistence, and mobile
layout. It does not send files or API keys to a real AI service.
