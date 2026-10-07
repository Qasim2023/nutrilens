// Run with a Playwright module path and optional browser executable.
// Isolated profile, synthetic recipes and intercepted provider requests only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server.mjs';
import { recipe } from './recipe-studio-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const server = createAppServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => {
    if (!localStorage.getItem('nutrilens.settings.v1')) localStorage.setItem('nutrilens.settings.v1', JSON.stringify({ connectionRevision: 3, baseUrl: 'https://recipes.example.test/v1', model: 'synthetic-recipes', auth: 'none', transport: 'direct', apiFormat: 'chat', language: 'en' }));
  });
  const options = [recipe, { ...recipe, title: 'Spinach quinoa bowl' }, { ...recipe, title: 'Tomato <script>window.injected=true</script> soup' }];
  await context.route('https://recipes.example.test/**', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ recipes: options }) } }] }) });
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const count = page.locator('#recipe-saved-count');
  const cards = page.locator('#recipe-results-list .recipe-card');
  async function waitCount(value) { await page.waitForFunction(value => document.querySelector('#recipe-saved-count').textContent === value, String(value)); }
  async function exportText(button) {
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    const stream = await download.createReadStream(); const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return { filename: download.suggestedFilename(), content: Buffer.concat(chunks).toString('utf8') };
  }
  await page.goto(origin);
  await page.locator('#view-recipes').click();
  assert.equal(await page.locator('#recipe-export-all').isDisabled(), true);
  await page.locator('#recipe-show-saved').click();
  assert.equal(await page.locator('#recipe-saved-empty').isVisible(), true);
  await page.locator('#recipe-show-generated').click();

  await page.locator('#settings-btn').click();
  const tokens = page.locator('#set-maxtokens');
  assert.equal(await tokens.isVisible(), true, 'token control is not hidden under Advanced');
  for (const [value, expected] of [['50000', '32000'], ['8192.6', '8193'], ['', '4096'], ['8192', '8192']]) {
    await tokens.fill(value); await tokens.press('Tab');
    assert.equal(await tokens.inputValue(), expected);
  }
  await page.locator('#close-drawer').click();
  await page.locator('#recipe-instructions').fill('A vegetarian dinner with chickpeas and lemon.');
  await page.locator('#recipe-generate').click();
  await page.waitForFunction(() => document.querySelectorAll('#recipe-results-list .recipe-card').length === 3);
  assert.equal(requests.length, 1); assert.equal(requests[0].max_tokens, 8192);
  assert.equal(await page.evaluate(() => localStorage.getItem('nutrilens.recipes.v1')), null, 'generation is not auto-saved');
  assert.equal(await page.evaluate(() => window.injected), undefined, 'model HTML cannot execute');
  await page.locator('[data-recipe-action="save"][data-recipe-index="0"]').click();
  await waitCount(1);
  assert.equal(await page.locator('[data-recipe-action="save"][data-recipe-index="0"]').isDisabled(), true);
  const markdown = await exportText(page.locator('[data-recipe-action="export"][data-recipe-index="0"]'));
  assert.equal(markdown.filename, 'nutrilens-recipe-lemon-chickpea-bowl.md');
  assert.match(markdown.content, /## Ingredients/); assert.match(markdown.content, /Calories: 420 kcal/);
  assert.match(markdown.content, /Allergy safety and cross-contact cannot be guaranteed/);
  await page.locator('[data-recipe-action="save"][data-recipe-index="1"]').click();
  await waitCount(2); await page.locator('#recipe-show-saved').click();
  assert.equal(await cards.count(), 2);
  await page.locator('#recipe-export-format').selectOption('json');
  const json = await exportText(page.locator('#recipe-export-all'));
  const backup = JSON.parse(json.content);
  assert.equal(json.filename, 'nutrilens-recipes.json'); assert.equal(backup.recipes.length, 2);
  assert.equal(backup.recipes[0].title, 'Spinach quinoa bowl');
  assert.doesNotMatch(json.content, /apiKey|extraHeaders|baseUrl|synthetic-recipes/);
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/recipe-saving-desktop.png', import.meta.url)), fullPage: true });

  await page.reload(); await page.locator('#view-recipes').click(); await page.locator('#recipe-show-saved').click();
  await waitCount(2); assert.equal(await cards.count(), 2); assert.equal(requests.length, 1);
  await page.locator('#settings-btn').click(); assert.equal(await tokens.inputValue(), '8192'); await page.locator('#close-drawer').click();
  await page.locator('[data-recipe-action="remove"]').first().click();
  await page.locator('#delete-confirmation [data-delete-cancel]').click(); await waitCount(2);
  await page.locator('[data-recipe-action="remove"]').first().click();
  await page.locator('#delete-confirmation [data-delete-confirm]').click(); await waitCount(1);
  assert.equal(await cards.locator('h3').first().textContent(), 'Lemon chickpea bowl');

  const other = await context.newPage(); await other.goto(origin);
  await other.evaluate(async value => {
    const { saveRecipe } = await import('/src/recipe-store.js');
    saveRecipe({ ...value, title: 'Saved from another tab' });
  }, recipe);
  await waitCount(2); assert.equal(await cards.count(), 2); await other.close();

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'nutrilens.recipes.v1') throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.locator('#recipe-instructions').fill('Another vegetarian dinner.'); await page.locator('#recipe-generate').click();
  await page.waitForFunction(() => document.querySelectorAll('#recipe-results-list .recipe-card').length === 3);
  await page.locator('[data-recipe-action="save"][data-recipe-index="2"]').click();
  assert.match(await page.locator('#recipe-error').textContent(), /Export them instead/);
  assert.equal(await count.textContent(), '2'); assert.equal(await page.locator('#recipe-export-all').isEnabled(), true);
  await page.locator('#recipe-export-format').selectOption('markdown');
  const afterFailure = await exportText(page.locator('[data-recipe-action="export"][data-recipe-index="2"]'));
  assert.ok(afterFailure.filename.endsWith('.md')); assert.match(afterFailure.content, /Tomato/);

  await page.locator('#settings-btn').click();
  await page.locator('#set-language').selectOption('nb');
  await page.locator('[data-theme-pick="light"]').click();
  await page.locator('#close-drawer').click(); await page.locator('#recipe-show-saved').click();
  assert.match(await page.locator('#recipe-show-saved').textContent(), /Lagrede oppskrifter/);
  assert.equal(await cards.locator('h3').last().textContent(), 'Lemon chickpea bowl');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile layout fits the viewport');
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/recipe-saving-mobile.png', import.meta.url)), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: recipe save/reload/deduplication, Markdown and JSON downloads, confirmation, cross-tab refresh, quota fallback, output-token settings and payload, HTML escaping, localization, light theme and mobile layout. Synthetic data only.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
