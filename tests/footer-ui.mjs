// Run with an optional Playwright module path and Chromium executable path.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
import {LANGUAGES} from '../src/languages.js';
const {chromium} = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const app = createAppServer();
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.argv[3] ? {executablePath: process.argv[3]} : {})});
  const page = await browser.newPage({viewport: {width: 1360, height: 1000}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + app.address().port);
  // This regression exercises the normal app, not first-visit onboarding
  if (await page.locator('#onboarding-welcome').evaluate(el=>el.open)) await page.locator('#welcome-returning').click();
  const footer = page.locator('.site-footer');
  await footer.waitFor();
  assert.equal(await page.locator('#footer-year').textContent(), String(new Date().getFullYear()));
  await footer.locator('[data-footer-target="view-diary"]').click();
  await page.locator('#diary-panel').waitFor({state: 'visible'});
  await footer.locator('[data-footer-top]').click();
  assert.equal(await page.locator('#view-diary').getAttribute('aria-pressed'), 'true');
  await footer.locator('button[data-footer-target="view-analysis"]').click();
  await page.locator('#analysis-view').waitFor({state: 'visible'});
  assert.equal(await page.locator('#input').evaluate(el => el === document.activeElement), true);
  for (const panel of ['about', 'help', 'privacy']) {
    const trigger = footer.locator('[data-footer-info="' + panel + '"]');
    await trigger.click();
    assert.equal(await page.locator('#footer-info').evaluate(el => el.open), true);
    assert.equal(await page.locator('#footer-info').getAttribute('aria-labelledby'), 'footer-' + panel + '-title');
    await page.locator('[data-footer-panel="' + panel + '"]').waitFor({state: 'visible'});
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#footer-info').evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#footer-info').evaluate(el => el.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#footer-info').evaluate(el => el.open), false);
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
  }
  await footer.locator('[data-footer-info="help"]').click();
  await page.locator('[data-footer-panel="help"] [data-footer-target="settings-btn"]').click();
  await page.locator('#drawer.open').waitFor();
  assert.equal(await page.locator('#footer-info').evaluate(el => el.open), false);
  assert.equal(await page.locator('#drawer').evaluate(el => el.contains(document.activeElement)), true);
  await page.locator('#close-drawer').click();
  assert.equal(await footer.locator('[data-footer-info="help"]').evaluate(el => el === document.activeElement), true);
  await footer.locator('[data-footer-target="meal-library-toggle"]').click();
  await page.locator('#meal-library').waitFor({state: 'visible'});
  await page.locator('#meal-library-close').click();
  for (const language of LANGUAGES) {
    await page.evaluate(async code => { const {setLanguage} = await import('/src/i18n.js'); setLanguage(code); }, language.code);
    await footer.locator('[data-footer-info="privacy"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.evaluate(async () => { const {setLanguage} = await import('/src/i18n.js'); setLanguage('en'); });
  await footer.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({path: 'artifacts/professional-footer-desktop.png', fullPage: true});
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 844});
    await footer.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await footer.locator('[data-footer-info="help"]').click();
    assert.equal(await page.locator('#footer-info').evaluate(el => el.getBoundingClientRect().right <= innerWidth), true);
    await page.locator('#footer-info-close').click();
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: 'artifacts/professional-footer-mobile.png', fullPage: true});
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await footer.scrollIntoViewIfNeeded();
  await page.screenshot({path: 'artifacts/professional-footer-light.png', fullPage: true});
  await page.emulateMedia({media: 'print'});
  assert.equal(await footer.isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('PASS: footer navigation, dialogs, keyboard/focus, all eleven languages, desktop/mobile layouts, light theme, print, and no browser errors.');
} finally {
  await browser?.close(); await new Promise(resolve => app.close(resolve));
}
