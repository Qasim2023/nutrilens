import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeMaxTokens, OUTPUT_TOKEN_LIMITS } from '../src/output-tokens.js';
import { loadSettings, saveSettings, defaults } from '../src/store.js';
import { complete } from '../src/connection.js';
import { generateRecipes } from '../src/recipe-ai.js';
import { translate } from '../src/i18n.js';
import { recipe } from './recipe-studio-fixture.mjs';
const settings = { baseUrl: 'https://example.test/v1', model: 'fixture', auth: 'none', transport: 'direct', apiFormat: 'chat', maxTokens: 8192, language: 'en' };

test('output tokens are finite whole numbers in the supported range, with a consistent default', () => {
  assert.deepEqual(OUTPUT_TOKEN_LIMITS, { min: 256, max: 32000, default: 4096 });
  for (const value of [undefined, null, '', ' ', 'no', NaN, Infinity, -Infinity, true, [], {}]) assert.equal(normalizeMaxTokens(value), 4096, String(value));
  for (const [value, expected] of [[0, 256], [-100, 256], [255, 256], [256, 256], [4096.6, 4097], ['8192', 8192], [32001, 32000], [1e12, 32000]]) assert.equal(normalizeMaxTokens(value), expected);
});

test('token settings survive reload and malformed/legacy settings are normalized', () => {
  const previous = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  try {
    assert.equal(loadSettings().maxTokens, 4096);
    saveSettings({ ...defaults, maxTokens: 16384 });
    assert.equal(loadSettings().maxTokens, 16384);
    for (const [value, expected] of [['7000', 7000], [512.7, 513], [-1, 256], [99999, 32000], [null, 4096], ['invalid', 4096]]) {
      data.set('nutrilens.settings.v1', JSON.stringify({ ...defaults, maxTokens: value }));
      assert.equal(loadSettings().maxTokens, expected);
      assert.equal(JSON.parse(data.get('nutrilens.settings.v1')).maxTokens, expected);
    }
  } finally { globalThis.localStorage = previous; }
});

test('chat, reasoning chat and Responses request bodies honor the selected token limit', async () => {
  const previous = globalThis.fetch;
  try {
    for (const [apiFormat, model, field] of [['chat', 'fixture', 'max_tokens'], ['chat', 'o3-fixture', 'max_completion_tokens'], ['responses', 'fixture', 'max_output_tokens']]) {
      let body;
      globalThis.fetch = async (_url, init) => {
        body = JSON.parse(init.body);
        return Response.json(apiFormat === 'responses' ? { output: [{ content: [{ type: 'output_text', text: 'ok' }] }] } : { choices: [{ message: { content: 'ok' } }] });
      };
      assert.equal((await complete({ ...settings, apiFormat, model }, [{ role: 'user', content: 'test' }])).text, 'ok');
      assert.equal(body[field], 8192);
      assert.equal(Object.keys(body).filter(key => key.startsWith('max_')).length, 1);
      await complete({ ...settings, apiFormat, model }, [{ role: 'user', content: 'test' }], { maxTokens: 256 });
      assert.equal(body[field], 256, 'connection tests retain their explicit small limit');
      await complete({ ...settings, apiFormat, model, maxTokens: NaN }, [{ role: 'user', content: 'test' }]);
      assert.equal(body[field], 4096);
    }
  } finally { globalThis.fetch = previous; }
});

test('recipe generation and structured repair use the same user-selected output-token limit', async () => {
  const previous = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    const result = bodies.length === 1 ? { recipes: [{ title: 'Incomplete' }] } : { recipes: [recipe] };
    return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
  };
  try {
    await generateRecipes({ instructions: 'A quick vegetarian dinner', settings: { ...settings, maxTokens: 16384 } });
    assert.deepEqual(bodies.map(body => body.max_tokens), [16384, 16384]);
  } finally { globalThis.fetch = previous; }
});

test('truncated responses direct the user to the visible Max output tokens setting', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] });
  try { await assert.rejects(complete(settings, [{ role: 'user', content: 'test' }]), /Max output tokens in Settings/); }
  finally { globalThis.fetch = previous; }
});

test('max output tokens is visible outside Advanced, with matching bounds and translated UI', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="set-maxtokens"') < html.indexOf('<summary>Advanced request options</summary>'));
  assert.match(html, /id="set-maxtokens"[^>]+min="256"[^>]+max="32000"[^>]+step="1"/);
  assert.doesNotMatch(html, /Your recipes are not saved/);
  for (const language of ['nb', 'pl', 'de', 'tl', 'fr', 'es', 'nn', 'ru', 'hi', 'ur']) {
    for (const phrase of ['Max output tokens', 'Saved recipes', 'Save recipe', 'Export recipe', 'Recipe saved.', 'Remove saved recipe?']) assert.notEqual(translate(phrase, language), phrase, language + ': ' + phrase);
  }
});
