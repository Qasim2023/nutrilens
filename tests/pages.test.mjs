import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {extractBrowserDocument} from '../src/browser-documents.js';
import {isStaticHosting, effectiveTransport} from '../src/hosting.js';
import {buildPages} from '../scripts/build-pages.mjs';

function mockWorker(t, reply) {
  let terminated = false;
  class Worker {
    postMessage(message, transfer) {
      assert.equal(message.name, 'recipe.pdf');
      assert.equal(transfer[0], message.buffer);
      // PDF.js initialization must not resolve document extraction.
      this.onmessage({data: {sourceName: 'worker', targetName: 'main', action: 'ready'}});
      this.onmessage({data: null});
      queueMicrotask(() => this.onmessage({data: reply}));
    }
    terminate() { terminated = true; }
  }
  globalThis.Worker = Worker;
  return () => terminated;
}
const file = {name: 'recipe.pdf', arrayBuffer: async () => new ArrayBuffer(8)};

test('document extraction ignores PDF.js control messages and waits for a tagged result', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  if (!original) globalThis.Worker = function () {};
  try {
    const terminated = mockWorker(t, {type: 'nutrilens:document-result', text: '100 g oats', pages: 1});
    const result = await extractBrowserDocument(file);
    assert.equal(result.text, '100 g oats');
    assert.equal(result.pages, 1);
    assert.equal(terminated(), true);
  } finally { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete globalThis.Worker; }
});

test('tagged document errors reject and terminate the worker', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  if (!original) globalThis.Worker = function () {};
  try {
    const terminated = mockWorker(t, {type: 'nutrilens:document-result', error: 'This file is not a valid PDF.'});
    await assert.rejects(extractBrowserDocument(file), /valid PDF/);
    assert.equal(terminated(), true);
  } finally { if (original) Object.defineProperty(globalThis, 'Worker', original); else delete globalThis.Worker; }
});

test('GitHub Pages forces direct requests, while the local server retains relay support', () => {
  assert.equal(isStaticHosting({hostname: 'example.github.io'}), true);
  assert.equal(effectiveTransport({transport: 'relay'}, {hostname: 'example.github.io'}), 'direct');
  assert.equal(isStaticHosting({hostname: 'github.io.evil.test'}), false);
  assert.equal(effectiveTransport({transport: 'relay'}, {hostname: 'localhost'}), 'relay');
});

test('legacy settings migration returns direct transport on GitHub Pages', async () => {
  const oldLocation = globalThis.location, oldStorage = globalThis.localStorage;
  const storage = new Map([['nutrilens.settings.v1', JSON.stringify({apiKey: 'user-owned-test-key'})]]);
  globalThis.location = {hostname: 'example.github.io'};
  globalThis.localStorage = {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)};
  try {
    const {loadSettings} = await import('../src/store.js');
    assert.equal(loadSettings().transport, 'direct');
    assert.equal(JSON.parse(storage.get('nutrilens.settings.v1')).transport, 'direct');
  } finally {
    if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation;
    if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage;
  }
});

test('Pages artifact includes local parsers and static mode, but excludes backend and workspace files', async () => {
  // Tests must never replace the real deployment output before a test-first build passes.
  const tempRoot=path.resolve(os.tmpdir()),temp=await fs.mkdtemp(path.join(tempRoot,'nutrilens-pages-test-'));
  try {
    const {output, files} = await buildPages({outputDirectory:path.join(temp,'site')});
    for (const name of ['index.html', '.nojekyll', 'vendor/mammoth/mammoth.browser.min.js', 'vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs']) assert.ok(files.includes(name), name);
    assert.match(await fs.readFile(path.join(output, 'src/hosting-config.js'), 'utf8'), /STATIC_HOSTING = true/);
    assert.equal(files.some(name => /^(server|tests|artifacts|\.git|\.env|node_modules)(\/|\.|$)/.test(name)), false);
    await assert.rejects(buildPages({outputDirectory:fileURLToPath(new URL('../',import.meta.url))}), /project root/);
  } finally {
    if(!temp.startsWith(tempRoot+path.sep)||!path.basename(temp).startsWith('nutrilens-pages-test-'))throw new Error('Unsafe test cleanup path');
    await fs.rm(temp,{recursive:true,force:true});
  }
});
