// Isolated browser check of the Vercel artifact; uses synthetic keys/data only.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildPages} from '../scripts/build-pages.mjs';
import {checkPublicContent} from '../scripts/check-public-content.mjs';
const {chromium} = createRequire(import.meta.url)(process.argv[2] || 'playwright');
const config = JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const headers = Object.fromEntries(config.headers[0].headers.map(({key,value})=>[key,value]));
const artifact = await buildPages({hostedRelay:true}); await checkPublicContent(artifact);
const allowed = new Set(artifact.files), calls = [], errors = [], external = [];
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const raw = {dish:'Synthetic apple',summary:'Browser verification fixture',confidence:.8,items:[{name:'Apple',grams:100,quantity:'1 apple',calories:95}],total:{calories:95,protein_g:.5,carbs_g:25,fat_g:.3},health_score:80};
const server = http.createServer(async (req,res) => {
  for (const [key,value] of Object.entries(headers)) res.setHeader(key,value);
  const url = new URL(req.url,'http://localhost');
  // This mock exists only in this test. No provider routes go into dist.
  if (url.pathname.startsWith('/v1/')) {
    calls.push({path:url.pathname,auth:req.headers.authorization});
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks).toString();
    const text=body.includes('Reply with the single word')?'ok':JSON.stringify(raw);
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(url.pathname.endsWith('/models')?{data:[{id:'mock-vision'}]}:{choices:[{message:{content:text}}]}));
  }
  const file = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (!['GET','HEAD'].includes(req.method) || !allowed.has(file)) {res.writeHead(404);return res.end();}
  const data=await fs.readFile(path.join(artifact.output,...file.split('/')));
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); let browser;
const origin=`http://127.0.0.1:${server.address().port}`;
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const context=await browser.newContext({viewport:{width:1360,height:900}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
  const response=await page.goto(origin);
  assert.equal(response.headers()['content-security-policy'],headers['Content-Security-Policy']);
  assert.equal(calls.length,0);
  const empty=await page.evaluate(async()=>{
    const {loadSettings}=await import('/src/store.js');const {createHistoryRepository}=await import('/src/history-store.js');const {loadDiary}=await import('/src/diary-store.js');
    const history=createHistoryRepository();const result={settings:loadSettings(),history:(await history.backup()).analyses,diary:loadDiary()};await history.close();return result;
  });
  assert.equal(empty.settings.apiKey,'');assert.equal(empty.settings.baseUrl,'');assert.equal(empty.settings.model,'');
  assert.deepEqual(empty.history,[]);assert.deepEqual(empty.diary,[]);
  await page.locator('#settings-btn').click();
  for(const selector of ['#set-baseurl','#set-apikey','#set-model'])assert.equal(await page.locator(selector).inputValue(),'');
  assert.equal(await page.locator('#set-provider').inputValue(),'custom');
  assert.equal(await page.locator('#set-transport').inputValue(),'direct');assert.equal(await page.locator('#set-transport').isDisabled(),true);
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#models-status .status-dot.bad'));
  assert.match(await page.locator('#models-status').textContent(),/Enter an HTTP/);
  assert.equal(calls.length,0);
  for(const hidden of ['/.env','/server.mjs','/README.md','/vercel.json','/missing.js','/api/relay'])assert.equal((await page.request.get(origin+hidden)).status(),404);
  await page.locator('#set-baseurl').fill(origin+'/v1');await page.locator('#set-apikey').fill('synthetic-visitor-key');
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#available-models option[value="mock-vision"]'));
  await page.locator('#available-models').selectOption('mock-vision');await page.locator('#test-btn').click();
  await page.waitForFunction(()=>document.querySelector('#test-status').textContent.includes('Connected'));
  await page.locator('#close-drawer').click();await page.locator('#input').fill('One apple');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='95kcal');
  assert.ok(calls.length>=3);assert.ok(calls.every(call=>call.auth==='Bearer synthetic-visitor-key'));
  await page.reload();await page.locator('#settings-btn').click();
  assert.equal(await page.locator('#set-baseurl').inputValue(),origin+'/v1');assert.equal(await page.locator('#set-apikey').inputValue(),'synthetic-visitor-key');assert.equal(await page.locator('#set-model').inputValue(),'mock-vision');assert.equal(await page.locator('#available-models').inputValue(),'mock-vision');
  const credentials=await page.evaluate(()=>({settings:localStorage.getItem('nutrilens.settings.v1'),persistent:JSON.parse(localStorage.getItem('nutrilens.credentials.v1')),session:sessionStorage.getItem('nutrilens.credentials.v1')}));
  assert.ok(!credentials.settings.includes('synthetic-visitor-key'));assert.equal(credentials.persistent.apiKey,'synthetic-visitor-key');assert.equal(credentials.session,null);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#reset-btn').click();
  await page.waitForFunction(()=>document.querySelector('#set-baseurl').value===''&&document.querySelector('#set-apikey').value===''&&document.querySelector('#set-model').value==='');
  assert.equal(await page.evaluate(()=>localStorage.getItem('nutrilens.credentials.v1')),null);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/vercel-mobile.png',fullPage:true,animations:'disabled'});
  const independent=await browser.newContext();const fresh=await independent.newPage();await fresh.goto(origin);
  const second=await fresh.evaluate(async()=>{const {loadSettings}=await import('/src/store.js');return loadSettings();});
  assert.equal(second.apiKey,'');assert.equal(second.baseUrl,'');assert.equal(second.model,'');await independent.close();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: Vercel artifact, exact security headers, empty visitor data/settings, no unconfigured API calls, hidden-file 404s, visitor-owned key/model/test/analysis, browser-persistent credentials, independent visitor isolation, and mobile layout. Synthetic data only.');
} finally {await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
