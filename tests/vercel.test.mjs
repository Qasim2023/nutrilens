import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {defaults, loadSettings} from '../src/store.js';
import {DEFAULT_BASE_URL, DEFAULT_MODEL, PRESETS, listModels} from '../src/ai.js';
import {effectiveTransport, isStaticHosting} from '../src/hosting.js';
import {securityHeaders} from '../src/security-policy.js';
import {buildPages} from '../scripts/build-pages.mjs';
import {publicContentIssues, checkPublicContent} from '../scripts/check-public-content.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => fs.readFile(path.join(root, name), 'utf8');

test('new visitors must bring their own endpoint, model and credentials', () => {
  assert.equal(DEFAULT_BASE_URL, ''); assert.equal(DEFAULT_MODEL, '');
  assert.equal(defaults.provider, 'custom'); assert.equal(defaults.baseUrl, '');
  assert.equal(defaults.model, ''); assert.equal(defaults.apiKey, ''); assert.equal(defaults.extraHeaders, '');
  assert.equal(defaults.demoMode, false); assert.equal(defaults.auth, 'bearer');
  assert.ok(Object.hasOwn(PRESETS, 'custom'));
});

test('fresh hosted settings are blank and no model discovery request runs without configuration', async () => {
  const old = {localStorage:globalThis.localStorage, sessionStorage:globalThis.sessionStorage, location:globalThis.location, fetch:globalThis.fetch};
  globalThis.localStorage = {getItem:() => null}; globalThis.sessionStorage = {getItem:() => null};
  globalThis.location = {hostname:'example.vercel.app', protocol:'https:'};
  let calls = 0; globalThis.fetch = async () => {calls++; throw new Error('Unexpected request');};
  try {
    // Separate module instance avoids credentials from other test fixtures.
    const fresh = await import('../src/store.js?fresh-vercel-visitor');
    const settings = fresh.loadSettings();
    assert.equal(settings.apiKey, ''); assert.equal(settings.baseUrl, ''); assert.equal(settings.model, '');
    assert.equal(settings.transport, 'direct');
    await assert.rejects(listModels(settings), /Enter an HTTP/); assert.equal(calls, 0);
  } finally {Object.assign(globalThis, old);}
});

test('legacy visitor connection preferences are never replaced with a maintainer endpoint', () => {
  const old = {localStorage:globalThis.localStorage, sessionStorage:globalThis.sessionStorage};
  const storage = new Map([['nutrilens.settings.v1', JSON.stringify({connectionRevision:1,provider:'retired-preset',baseUrl:'https://visitor.example/v1',model:'visitor-model',theme:'light'})]]);
  globalThis.localStorage = {getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
  globalThis.sessionStorage = {getItem:()=>null,removeItem:()=>{}};
  try {
    const settings = loadSettings(); assert.equal(settings.baseUrl,'https://visitor.example/v1');
    assert.equal(settings.model,'visitor-model'); assert.equal(settings.provider,'custom');
    assert.equal(settings.theme,'light'); assert.equal(settings.connectionRevision,defaults.connectionRevision);
  } finally {Object.assign(globalThis, old);}
});

test('Vercel production and preview domains force direct requests, not lookalikes', () => {
  for (const hostname of ['example.vercel.app','preview-branch-team.vercel.app']) {
    assert.equal(isStaticHosting({hostname}),true); assert.equal(effectiveTransport({transport:'relay'},{hostname}),'direct');
  }
  for (const hostname of ['vercel.app.evil.test','notvercel.app','localhost']) assert.equal(isStaticHosting({hostname}),false);
});

test('Vercel publishes only dist, uses pinned install and enforces the shared security headers', async () => {
  const config = JSON.parse(await read('vercel.json')), pkg = JSON.parse(await read('package.json'));
  assert.equal(config.framework,null); assert.equal(config.outputDirectory,'dist');
  assert.equal(config.installCommand,'ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile');
  assert.equal(config.buildCommand,'pnpm run build:vercel'); assert.equal(pkg.scripts.build,'node scripts/build-vercel.mjs');
  assert.equal(pkg.scripts['build:vercel'],'node scripts/build-vercel.mjs');
  assert.equal(config.headers[0].source,'/(.*)');
  assert.deepEqual(Object.fromEntries(config.headers[0].headers.map(({key,value})=>[key,value])),securityHeaders());
  assert.equal(config.rewrites,undefined); assert.equal(config.env,undefined);
  const builder = await read('scripts/build-vercel.mjs');
  assert.match(builder,/spawn\(process\.execPath, \['--test', \.\.\.tests\]/); assert.match(builder,/if \(code !== 0\)/);
  assert.match(builder,/checkPublicContent\(artifact\)/);
});

test('public-content check rejects tokens, hard-coded credentials and private local paths', () => {
  for (const text of ['sk-'+'x'.repeat(32), 'apiKey: "do-not-publish"', 'extraHeaders: "X-Token: private"', '/home/example/private', 'C:\\Users\\example\\private', '-----BEGIN '+'PRIVATE KEY-----']) {
    assert.ok(publicContentIssues(text).length);
  }
  assert.deepEqual(publicContentIssues('apiKey: "", model: "", baseUrl: ""'),[]);
});

test('Vercel artifact passes privacy checks and excludes personal files/backend', async () => {
  const tempRoot = path.resolve(os.tmpdir()), temp = await fs.mkdtemp(path.join(tempRoot,'nutrilens-vercel-test-'));
  try {
    const artifact = await buildPages({outputDirectory:path.join(temp,'site')});
    assert.ok((await checkPublicContent(artifact)).checked > 10);
    assert.equal(artifact.files.some(name=>/^(artifacts|tests|server|desktop|release|\.git|\.env|\.vercel)(\/|\.|$)/.test(name)),false);
    for (const file of ['vercel.json','README.md','package.json','pnpm-lock.yaml']) assert.equal(artifact.files.includes(file),false);
    await fs.writeFile(path.join(artifact.output,'src/hosting-config.js'),'export const apiKey = "";\nconst config = {apiKey: "synthetic-private-key"};');
    await assert.rejects(checkPublicContent(artifact),/values redacted/);
  } finally {
    if (!temp.startsWith(tempRoot+path.sep)||!path.basename(temp).startsWith('nutrilens-vercel-test-')) throw new Error('Unsafe test cleanup path');
    await fs.rm(temp,{recursive:true,force:true});
  }
});

test('Git ignores personal exports, screenshots, deployment accounts and environment files', async () => {
  const ignore = await read('.gitignore');
  for (const rule of ['artifacts/','.vercel/','.env','.env.*','nutrilens-*.json','*.pem','*.key']) assert.ok(ignore.split(/\r?\n/).includes(rule));
});
