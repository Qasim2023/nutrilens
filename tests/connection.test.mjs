import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { endpointUrl, modelsUrl, buildHeaders, parseEventStream, responseText, complete, requestJson } from '../src/connection.js';
import { analyzeFood, testConnection, listModels } from '../src/ai.js';
import { normalize } from '../src/ai.js';
import { createAppServer } from '../server.mjs';

const settings = { baseUrl: 'https://provider.example/v1', provider: 'custom', apiKey: 'test-secret', auth: 'bearer', model: 'vision-model', apiFormat: 'auto', transport: 'direct', jsonMode: true };
const good = { dish: 'Apple', summary: 'One apple', confidence: 0, items: [{ name: 'Apple', grams:100, calories: 95, quantity: '1 apple' }], total: { calories: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3 }, health_score: 85 };
const chat = text => ({ choices: [{ message: { content: text } }] });
async function fakeFetch(t, fn, action) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try { await action(); } finally { globalThis.fetch = original; }
}
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('normalizes base/full/trailing slash URLs and preserves query strings', () => {
  assert.equal(endpointUrl(settings.baseUrl), 'https://provider.example/v1/chat/completions');
  assert.equal(endpointUrl(settings.baseUrl + '///'), 'https://provider.example/v1/chat/completions');
  assert.equal(endpointUrl(settings.baseUrl + '/chat/completions?token=1'), 'https://provider.example/v1/chat/completions?token=1');
  assert.equal(endpointUrl(settings.baseUrl + '/responses', 'custom', 'auto', 'auto'), settings.baseUrl + '/responses');
  assert.equal(endpointUrl(settings.baseUrl + '/chat/completions', 'custom', 'auto', 'responses'), settings.baseUrl + '/responses');
  assert.equal(modelsUrl({ ...settings, baseUrl: settings.baseUrl + '/responses?x=1' }), settings.baseUrl + '/models?x=1');
  assert.match(endpointUrl('https://example.test/deployment?api-version=custom', 'azure'), /api-version=custom/);
  assert.throws(() => endpointUrl('file:///etc/passwd'));
  assert.throws(() => endpointUrl('https://user:password@example.test/v1'));
});

test('does not double-prefix Bearer and supports key/no-auth styles', () => {
  assert.equal(buildHeaders({ ...settings, apiKey: 'Bearer secret' }).Authorization, 'Bearer secret');
  assert.equal(buildHeaders({ ...settings, auth: 'api-key', keyHeader: 'X-Key' })['X-Key'], 'test-secret');
  assert.equal(buildHeaders({ ...settings, auth: 'none' }).Authorization, undefined);
});

test('extracts Chat/Responses JSON and streamed text', () => {
  assert.equal(responseText(chat('ok')), 'ok');
  assert.equal(responseText({ output: [{ content: [{ type: 'output_text', text: 'ok' }] }] }), 'ok');
  assert.equal(responseText(parseEventStream('data: {"choices":[{"delta":{"content":"o"}}]}\n\ndata: {"choices":[{"delta":{"content":"k"}}]}\n\ndata: [DONE]\n\n')), 'ok');
  assert.equal(responseText(parseEventStream('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n')), 'ok');
  assert.throws(() => responseText({ status: 'incomplete' }), /cut off/);
  assert.throws(() => parseEventStream('data: {"type":"response.failed"}\n\n'), /failed/i);
});

test('text-only analysis sends string content and validates real nutrition', async t => {
  await fakeFetch(t, async (url, init) => {
    assert.equal(url, settings.baseUrl + '/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(typeof body.messages[1].content, 'string');
    return jsonResponse(chat(JSON.stringify(good)));
  }, async () => {
    const r = await analyzeFood({ text: '1 apple', settings });
    assert.equal(r.total.calories, 95);
    assert.equal(r.confidence, 0);
    assert.equal(r.meta.model, settings.model);
  });
});

test('photo analysis includes the image payload', async t => {
  await fakeFetch(t, async (_, init) => {
    assert.equal(JSON.parse(init.body).messages[1].content[1].image_url.url, 'data:image/jpeg;base64,abc');
    return jsonResponse(chat(JSON.stringify(good)));
  }, async () => assert.equal((await analyzeFood({ text: 'apple', imageDataUrl: 'data:image/jpeg;base64,abc', settings })).dish, 'Apple'));
});

test('falls back to Responses API only when Chat is rejected', async t => {
  let calls = 0;
  await fakeFetch(t, async (url, init) => {
    if (++calls === 1) return jsonResponse({ error: { message: 'Use responses API only' } }, 400);
    assert.match(url, /\/responses$/);
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.equal(body.input[1].content[1].type, 'input_image');
    return jsonResponse({ output: [{ content: [{ text: JSON.stringify(good) }] }] });
  }, async () => {
    const result = await analyzeFood({ text: 'apple', imageDataUrl: 'data:image/jpeg;base64,abc', settings });
    assert.equal(result.meta.protocol, 'responses');
    assert.equal(calls, 2);
  });
});

test('retries unsupported JSON mode and temperature without retrying auth failures', async t => {
  let calls = 0;
  await fakeFetch(t, async (_, init) => {
    const body = JSON.parse(init.body);
    calls++;
    if (body.response_format) return jsonResponse({ error: { message: 'response_format unsupported' } }, 400);
    if (body.temperature !== undefined) return jsonResponse({ error: { message: 'temperature unsupported' } }, 400);
    return jsonResponse(chat('ok'));
  }, async () => { assert.equal((await complete(settings, [{ role: 'user', content: 'ok' }])).text, 'ok'); assert.equal(calls, 3); });
  calls = 0;
  await fakeFetch(t, async () => { calls++; return jsonResponse({ error: { message: 'Bad key test-secret' } }, 401); }, async () => {
    await assert.rejects(testConnection(settings), error => /401/.test(error.message) && !error.message.includes('test-secret'));
    assert.equal(calls, 1);
  });
});

test('model listing handles a full endpoint and requires model-shaped data', async t => {
  await fakeFetch(t, async url => {
    assert.equal(url, settings.baseUrl + '/models');
    return jsonResponse({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-a' }] });
  }, async () => assert.deepEqual(await listModels({ ...settings, baseUrl: settings.baseUrl + '/chat/completions' }), ['model-a', 'model-b']));
});

test('connection test rejects HTML and empty 200s instead of reporting success', async t => {
  await fakeFetch(t, async () => new Response('<html>login</html>'), async () => assert.rejects(testConnection(settings), /usable API/));
  await fakeFetch(t, async () => jsonResponse(chat('')), async () => assert.rejects(testConnection(settings), /no text/));
});

test('invalid nutrition is repaired once; arbitrary JSON is never rendered as zero calories', async t => {
  let calls = 0;
  await fakeFetch(t, async () => { calls++; return jsonResponse(chat('{"hello":"world"}')); }, async () => {
    await assert.rejects(analyzeFood({ text: 'apple', settings }), /valid nutrition data/);
    assert.equal(calls, 2);
  });
});

test('cancellation stays AbortError', async t => {
  const controller = new AbortController();
  controller.abort();
  await fakeFetch(t, async () => { throw new DOMException('Cancelled', 'AbortError'); }, async () => {
    await assert.rejects(complete(settings, [], { signal: controller.signal }), { name: 'AbortError' });
  });
});

test('migrates preferences without replacing a visitor endpoint, credentials, model or appearance', async () => {
  const original = globalThis.localStorage;
  const storage = new Map([['nutrilens.settings.v1', JSON.stringify({ provider: 'custom', baseUrl: 'https://old.test/v1', model: 'my-model', apiKey: 'keep-me', accent: 'violet' })]]);
  globalThis.localStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) };
  try {
    const { loadSettings } = await import('../src/store.js');
    const loaded = loadSettings();
    assert.equal(loaded.baseUrl, 'https://old.test/v1');
    assert.equal(loaded.apiKey, 'keep-me');
    assert.equal(loaded.model, 'my-model');
    assert.equal(loaded.accent, 'violet');
    assert.equal(loaded.transport, 'relay');
    loaded.baseUrl = 'https://later.test/v1';
    storage.set('nutrilens.settings.v1', JSON.stringify(loaded));
    assert.equal(loadSettings().baseUrl, 'https://later.test/v1');
  } finally { globalThis.localStorage = original; }
});

test('loopback relay forwards auth, models and JSON without CORS; blocks foreign origins, targets, redirects and private files', async () => {
  let forwarded;
  const upstream = http.createServer(async (req,res) => {
    forwarded = { authorization: req.headers.authorization, host: req.headers.host };
    const chunks = [];
    for await (const c of req) chunks.push(c);
    forwarded.body = Buffer.concat(chunks).toString();
    if (req.url.includes('redirect')) { res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.method === 'GET' ? { data: [{ id: 'local-model' }] } : chat(JSON.stringify(good))));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream,'listening');
  const remote = `http://127.0.0.1:${upstream.address().port}`;
  const app = createAppServer({ allowedOrigins: [remote] });
  app.listen(0, '127.0.0.1'); await once(app,'listening');
  const origin = `http://127.0.0.1:${app.address().port}`;
  const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-NutriLens-Relay': '1' };
  const envelope = { url: remote + '/v1/chat/completions', method: 'POST', headers: { Authorization: 'Bearer fake-test-key', Host: 'evil.test' }, body: { model: 'local-model' } };
  try {
    assert.equal((await fetch(origin + '/')).status, 200);
    assert.equal((await fetch(origin + '/server.mjs')).status, 404);
    assert.equal((await fetch(origin + '/.env')).status, 404);
    let res = await fetch(origin + '/api/relay', { method: 'POST', headers, body: JSON.stringify(envelope) });
    assert.equal(res.status, 200);
    assert.equal(forwarded.authorization, 'Bearer fake-test-key');
    assert.equal(forwarded.host, new URL(remote).host);
    assert.deepEqual(JSON.parse(forwarded.body), { model: 'local-model' });
    res = await fetch(origin + '/api/relay', { method:'POST', headers, body:JSON.stringify({ ...envelope, method:'GET', url:remote+'/v1/models' }) });
    assert.equal((await res.json()).data[0].id, 'local-model');
    res = await fetch(origin + '/api/relay', { method:'POST', headers:{ ...headers, Origin:'https://evil.test' }, body:JSON.stringify(envelope) });
    assert.equal(res.status, 403);
    res = await fetch(origin + '/api/relay', { method:'POST', headers, body:JSON.stringify({ ...envelope, url:'http://169.254.169.254/v1/models' }) });
    assert.equal(res.status, 403);
    res = await fetch(origin + '/api/relay', { method:'POST', headers, body:JSON.stringify({ ...envelope, url:remote+'/redirect/chat/completions' }) });
    assert.equal(res.status, 502);
  } finally { app.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise(r=>app.close(r)), new Promise(r=>upstream.close(r))]); }
});

test('macro shares stay below 100% when fibre changes reported calorie totals', async () => {
  const { renderResult } = await import('../src/render.js');
  const html = renderResult(normalize(good));
  const percentages = [...html.matchAll(/(\d+)% of macro energy/g)].map(m => Number(m[1]));
  assert.equal(percentages.length, 3);
  assert.ok(percentages.every(p => p >= 0 && p <= 100));
  assert.ok(Math.abs(percentages.reduce((a,b)=>a+b,0)-100) <= 1);
});

test('retired settings and credentials are removed on load without resetting active settings or history', async () => {
  const original = globalThis.localStorage;
  const storage = new Map([
    ['nutrilens.settings.v1', JSON.stringify({connectionRevision:2,provider:'custom',baseUrl:'https://my-provider.test/v1',model:'keep-model',apiKey:'keep-ai-key',accent:'violet',retiredEnabled:true,retiredCredential:'remove-this-secret'})],
    ['nutrilens.history.v1','preserve-history'],
    ['nutrilens.diary.v1','preserve-diary'],
  ]);
  globalThis.localStorage = {getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  try {
    const {loadSettings,saveSettings} = await import('../src/store.js');
    const loaded=loadSettings();
    assert.equal(loaded.baseUrl,'https://my-provider.test/v1');
    assert.equal(loaded.apiKey,'keep-ai-key');
    assert.equal(loaded.model,'keep-model');
    assert.equal(loaded.accent,'violet');
    assert.equal(Object.hasOwn(loaded,'retiredCredential'),false);
    assert.doesNotMatch(storage.get('nutrilens.settings.v1'),/remove-this-secret|retiredEnabled|retiredCredential/);
    saveSettings({...loaded,retiredCredential:'cannot-return'});
    assert.doesNotMatch(storage.get('nutrilens.settings.v1'),/cannot-return/);
    assert.equal(storage.get('nutrilens.history.v1'),'preserve-history');
    assert.equal(storage.get('nutrilens.diary.v1'),'preserve-diary');
  } finally {globalThis.localStorage=original;}
});


test('model discovery blocks missing API keys before contacting a provider or local relay', async t => {
  let calls = 0;
  await fakeFetch(t, async () => { calls++; throw new Error('Unexpected request'); }, async () => {
    for (const auth of ['bearer', 'api-key', 'header']) {
      for (const transport of ['direct', 'relay']) {
        await assert.rejects(listModels({ ...settings, auth, transport, apiKey: '  ' }), error => error.code === 'API_KEY_MISSING' && /Enter it in Settings/.test(error.message));
      }
    }
    await assert.rejects(listModels({ ...settings, baseUrl: '', apiKey: '' }), /Enter an HTTP/);
    assert.equal(calls, 0);
  });
});

test('local and public model discovery still supports explicit no-auth mode', async t => {
  await fakeFetch(t, async (_url, init) => {
    assert.equal(init.headers.Authorization, undefined);
    return jsonResponse({ data: [{ id: 'public-local-model' }] });
  }, async () => assert.deepEqual(await listModels({ ...settings, apiKey: '', auth: 'none' }), ['public-local-model']));
});
