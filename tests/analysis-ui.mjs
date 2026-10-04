// Local end-to-end smoke test, isolated profile and synthetic AI fixture only.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
let calls=0;
const provider=http.createServer(async(req,res)=>{
  for await(const _ of req){}
  calls++;
  const result={dish:'Eggs test meal',summary:'Synthetic fixture',confidence:.8,portion_notes:'Two eggs, estimated.',items:[{name:'Eggs',quantity:'2 eggs',calories:140,protein_g:12,carbs_g:1,fat_g:10}],total:{calories:140},health_score:70};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));
});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${provider.address().port}`;
const app=createAppServer({allowedOrigins:[origin]});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(new URL(request.url()).pathname);});
  await page.addInitScript(({origin})=>{
    if(!localStorage.getItem('nutrilens.settings.v1'))localStorage.setItem('nutrilens.settings.v1',JSON.stringify({connectionRevision:2,provider:'custom',baseUrl:origin+'/v1',model:'mock',auth:'none',apiKey:'keep-ai-key',transport:'relay',retiredCredential:'discard-me'}));
  },{origin});
  await page.goto(`http://127.0.0.1:${app.address().port}`);
  await page.locator('#settings-btn').click();
  assert.equal(await page.locator('#set-apikey').inputValue(),'keep-ai-key');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.settings.v1')));
  assert.equal(Object.hasOwn(stored,'retiredCredential'),false);
  await page.locator('#close-drawer').click();
  await page.locator('#input').fill('2 eggs');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='140kcal');
  await page.waitForFunction(()=>document.querySelector('#history-save-status').textContent.startsWith('Saved'));
  assert.equal(calls,1);
  assert.equal(await page.locator('#result .verification-badge,.verification-details').count(),0);
  assert.doesNotMatch(await page.locator('#result').textContent(),/multi-source|source consensus/i);
  assert.deepEqual(requests.filter(route=>route!=='/api/health'),['/api/relay']);
  await page.reload();await page.locator('#meal-library-toggle').click();
  await page.locator('button.library-select[data-open-analysis]').first().click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='140kcal');
  assert.equal(calls,1);
  await page.locator('[data-action="log-diary"]').click();
  await page.locator('#diary-save').click();
  await page.waitForFunction(()=>document.querySelectorAll('#diary-panel [data-edit-entry]').length===1);
  assert.equal(calls,1);
  await page.locator('#diary-food').fill('2 eggs');await page.locator('#diary-save').click();
  await page.waitForFunction(()=>document.querySelectorAll('#diary-panel [data-edit-entry]').length===2);
  assert.equal(calls,2);
  assert.equal(await page.locator('#diary-panel .verification-badge,.verification-details').count(),0);
  assert.doesNotMatch(await page.locator('#diary-panel').textContent(),/multi-source|source consensus|Sources checked/i);
  assert.deepEqual(requests.filter(route=>route!=='/api/health'),['/api/relay','/api/relay']);
  await page.reload();await page.locator('#view-diary').click();
  assert.equal(await page.locator('#diary-panel [data-edit-entry]').count(),2);
  assert.doesNotMatch(await page.locator('#diary-panel').textContent(),/multi-source|source consensus/i);
  await page.screenshot({path:'artifacts/ai-only-diary.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: provider settings retained, retired key removed, AI-only analysis without source requests or labels, saved meal restored, mobile layout; two mocked AI calls, Diary estimates logged and restored, no external requests.');
}finally{
  await browser?.close();
  await Promise.all([app,provider].map(server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})));
}
