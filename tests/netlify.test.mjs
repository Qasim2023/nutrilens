import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildPages} from '../scripts/build-pages.mjs';
import {NETLIFY_HEADERS,netlifyHeadersFile} from '../scripts/netlify-headers.mjs';
import {isStaticHosting,effectiveTransport} from '../src/hosting.js';
import {requestJson} from '../src/connection.js';
const read=relative=>fs.readFile(new URL('../'+relative,import.meta.url),'utf8');

test('Netlify builds test-first with pinned runtime and a narrowly scoped publish folder',async()=>{
  const config=await read('netlify.toml'),pkg=JSON.parse(await read('package.json'));
  assert.match(config,/command = "pnpm run build:netlify"/);assert.match(config,/publish = "dist"/);
  assert.match(config,/NODE_VERSION = "24"/);assert.match(config,/PNPM_FLAGS = "--frozen-lockfile"/);
  assert.match(config,/ELECTRON_SKIP_BINARY_DOWNLOAD = "1"/);
  assert.equal(pkg.packageManager,'pnpm@11.25.0');assert.equal(pkg.scripts['build:netlify'],'node scripts/build-netlify.mjs');
  const builder=await read('scripts/build-netlify.mjs');
  assert.match(builder,/spawn\(process\.execPath,\['--test',\.\.\.tests\]/);assert.match(builder,/if\(testCode!==0\)/);
  assert.doesNotMatch(config,/\[\[redirects\]\]|force\s*=\s*true/);
});
test('Netlify recognizes site, preview and branch domains without matching lookalikes',()=>{
  for(const hostname of ['nutrilens.netlify.app','deploy-preview-1--nutrilens.netlify.app','branch--nutrilens.netlify.app']) {
    assert.equal(isStaticHosting({hostname}),true);assert.equal(effectiveTransport({transport:'relay'},{hostname}),'direct');
  }
  for(const hostname of ['netlify.app.evil.test','notnetlify.app','localhost'])assert.equal(isStaticHosting({hostname}),false);
});
test('security headers prohibit inline/eval scripts and framing while permitting bundled workers and HTTPS AI',()=>{
  const csp=NETLIFY_HEADERS['Content-Security-Policy'];
  assert.match(csp,/script-src 'self';/);assert.doesNotMatch(csp,/unsafe-eval/);
  assert.match(csp,/connect-src 'self' https:;/);assert.match(csp,/worker-src 'self' blob:;/);
  assert.match(csp,/img-src 'self' data: blob:;/);assert.match(csp,/frame-ancestors 'none'/);
  assert.match(csp,/object-src 'none'/);assert.match(csp,/form-action 'none'/);
  assert.equal(NETLIFY_HEADERS['X-Frame-Options'],'DENY');assert.equal(NETLIFY_HEADERS['Referrer-Policy'],'no-referrer');
  assert.equal(NETLIFY_HEADERS['X-Content-Type-Options'],'nosniff');assert.match(NETLIFY_HEADERS['X-Robots-Tag'],/noindex/);
  assert.match(NETLIFY_HEADERS['Permissions-Policy'],/microphone=\(self\)/);assert.equal(NETLIFY_HEADERS['Cache-Control'],'no-cache');
});
test('the deployment artifact includes security policy, bundled parsers and no workspace or secrets',async()=>{
  const tempRoot=path.resolve(os.tmpdir()),temp=await fs.mkdtemp(path.join(tempRoot,'nutrilens-netlify-test-'));
  try {
    const {output,files}=await buildPages({outputDirectory:path.join(temp,'site')});
    assert.equal(await fs.readFile(path.join(output,'_headers'),'utf8'),netlifyHeadersFile());
    assert.match(await fs.readFile(path.join(output,'src/hosting-config.js'),'utf8'),/STATIC_HOSTING = true/);
    for(const file of ['src/personal-backup.js','src/food-picture.js','vendor/pdfjs/pdf.worker.min.mjs','vendor/mammoth/mammoth.browser.min.js'])assert.ok(files.includes(file));
    assert.equal(files.some(file=>/^(server|tests|artifacts|release|desktop|node_modules|\.git|\.env|\.netlify)(\/|\.|$)/.test(file)),false);
    assert.equal(files.includes('netlify.toml'),false);assert.equal(files.includes('README.md'),false);
    await fs.writeFile(path.join(output,'.env'),'SYNTHETIC_TEST_SECRET=do-not-publish');
    await assert.rejects(buildPages({outputDirectory:output}),/Unexpected file/);
  } finally {
    // Remove only the unique directory created by this test, verified under OS temp.
    if(!temp.startsWith(tempRoot+path.sep)||!path.basename(temp).startsWith('nutrilens-netlify-test-'))throw new Error('Unsafe test cleanup path');
    await fs.rm(temp,{recursive:true,force:true});
  }
});
test('hosted HTTPS apps reject plaintext endpoints before any credentials are sent',async()=>{
  const oldLocation=globalThis.location,oldFetch=globalThis.fetch;let calls=0;
  globalThis.location={hostname:'personal.netlify.app',protocol:'https:',href:'https://personal.netlify.app/'};
  globalThis.fetch=async()=>{calls++;return Response.json({ok:true});};
  try {
    const settings={transport:'direct',auth:'bearer',apiKey:'synthetic-test-key'};
    await assert.rejects(requestJson(settings,'http://example.test/v1/models',{method:'GET'}),/HTTPS endpoint/);
    assert.equal(calls,0);
    assert.deepEqual(await requestJson(settings,'https://example.test/v1/models',{method:'GET'}),{ok:true});assert.equal(calls,1);
  } finally {globalThis.location=oldLocation;globalThis.fetch=oldFetch;}
});
test('deployments ignore local environment files and show privacy and combined backup guidance',async()=>{
  const ignore=await read('.gitignore'),html=await read('index.html');
  assert.match(ignore,/^\.env\.\*$/m);assert.match(ignore,/^\.netlify\/$/m);
  assert.match(html,/id="personal-privacy-notice"/);assert.match(html,/not an encrypted vault/);
  assert.match(html,/Download all meals backup/);assert.match(html,/Nutrition values are estimates/);
});

test('the audited development dependency patch remains pinned in the workspace and lockfile',async()=>{
  const workspace=await read('pnpm-workspace.yaml'),lock=await read('pnpm-lock.yaml');
  assert.match(workspace,/'http-cache-semantics@<4\.3\.0': '4\.3\.0'/);
  assert.match(lock,/^  http-cache-semantics@4\.3\.0:/m);assert.doesNotMatch(lock,/^  http-cache-semantics@4\.2\.0:/m);
});
