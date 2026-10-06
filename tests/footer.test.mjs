import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {LANGUAGES} from '../src/languages.js';
import {TRANSLATIONS} from '../src/translations.js';
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');

test('site-wide footer has real navigation and local information rather than placeholder links', () => {
  const footer = html.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer);
  for (const target of ['view-analysis', 'view-diary', 'meal-library-toggle', 'settings-btn']) {
    assert.ok(footer.includes('data-footer-target="' + target + '"'));
    assert.ok(html.includes('id="' + target + '"'));
  }
  for (const panel of ['about', 'help', 'privacy']) {
    assert.ok(footer.includes('data-footer-info="' + panel + '"'));
    assert.ok(html.includes('data-footer-panel="' + panel + '"'));
    assert.ok(html.includes('id="footer-' + panel + '-title"'));
  }
  assert.ok(html.indexOf(footer) > html.indexOf('id="diary-panel"'));
  assert.ok(html.indexOf(footer) < html.indexOf('id="meal-library-scrim"'));
  assert.match(footer, /id="footer-year"/);
  assert.match(footer, /Nutrition values are estimates, not medical advice/);
  assert.doesNotMatch(footer, /mailto:|https?:/);
});

test('footer labels are translated in every non-English language', () => {
  const labels = ['Close', 'Saved on this device', 'Log what you ate. Every entry adds to your daily calorie total.', 'Website footer', 'NutriLens home', 'A clearer picture of your nutrition.', 'Explore', 'Help & information', 'About NutriLens', 'Help & getting started', 'Nutrition values are estimates, not medical advice.', 'Back to top'];
  for (const language of LANGUAGES.filter(item => item.code !== 'en')) {
    for (const label of labels) assert.ok(TRANSLATIONS[language.code][label], language.code + ': ' + label);
  }
});
