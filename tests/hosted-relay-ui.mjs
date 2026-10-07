// Tests the real relay handler behind the built UI with a fake provider. No real
// provider request, key, image or personal history is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildPages} from '../scripts/build-pages.mjs';
import {createHostedRelay} from '../server/hosted-relay.mjs';
import {WIKIVIBE_BASE_URL,HOSTED_RELAY_PATH} from '../src/hosted-provider.js';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const artifact=await buildPages({hostedRelay:true}),allowed=new Set(artifact.files);
const config=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const policy=Object.fromEntries(config.headers[0].headers.map(({key,value})=>[key,value]));
const calls=[],errors=[],external=[],siteCookies=[];let failProvider=false;
const key='synthetic-browser-visitor-key';
const raw={dish:'Synthetic apple',summary:'Relay browser fixture',confidence:.8,items:[{name:'Apple',grams:100,quantity:'1 apple',calories:95,protein_g:.5,carbs_g:25,fat_g:.3}],total:{calories:95,protein_g:.5,carbs_g:25,fat_g:.3},health_score:80};
const relay=createHostedRelay({fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(failProvider)return Response.json({error:{message:'Rejected '+key}},{status:401});
  if(url.endsWith('/models'))return Response.json({data:[{id:'fixture-vision'}]});
  const body=JSON.parse(options.body),test=JSON.stringify(body).includes('Reply with the single word');
  return Response.json({choices:[{message:{content:test?'ok':JSON.stringify(raw)}}]});
}});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  for(const [name,value]of Object.entries(policy))res.setHeader(name,value);
  const url=new URL(req.url,'http://localhost');
  if(url.pathname===HOSTED_RELAY_PATH){siteCookies.push(req.headers.cookie||'');return relay(req,res);}
  const name=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
  if(!['GET','HEAD'].includes(req.method)||!allowed.has(name)){res.writeHead(404);return res.end();}
  const data=await fs.readFile(path.join(artifact.output,...name.split('/')));res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage();
  const origin=`http://127.0.0.1:${server.address().port}`;
  await context.addCookies([{name:'site-session',value:'synthetic-site-session',url:origin,httpOnly:true}]);
  await context.route('https://**/*',route=>route.abort());
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:'))external.push(request.url());});
  await page.goto(origin);assert.equal(calls.length,0);
  await page.locator('#settings-btn').click();
  assert.equal(await page.locator('#set-apikey').inputValue(),'');
  assert.equal(await page.locator('#set-provider option[value="wikivibe"]').count(),0);
  await page.locator('#set-provider').selectOption('custom');
  await page.locator('#set-baseurl').fill(WIKIVIBE_BASE_URL);
  assert.equal(await page.locator('#set-baseurl').inputValue(),WIKIVIBE_BASE_URL);
  assert.equal(await page.locator('#set-transport').inputValue(),'hosted');
  assert.equal(await page.locator('#set-transport').isDisabled(),true);
  assert.equal(await page.locator('#static-hosting-notice').count(),0);
  assert.doesNotMatch(await page.locator('#provider-hint').textContent(),/wikivibe|vercel/i);
  assert.equal(await page.locator('#set-transport option[value="hosted"]').textContent(),'Hosted relay — your own provider key');
  await page.locator('#set-baseurl').fill('https://provider.example/v1');assert.equal(await page.locator('#set-transport').inputValue(),'direct');
  await page.locator('#set-baseurl').fill(WIKIVIBE_BASE_URL);assert.equal(await page.locator('#set-transport').inputValue(),'hosted');
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#models-status .bad'));
  assert.equal(calls.length,0);
  await page.locator('#set-apikey').fill(key);failProvider=true;
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#models-status').textContent.includes('401'));
  assert.ok(!(await page.locator('#models-status').textContent()).includes(key));failProvider=false;
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#available-models option[value="fixture-vision"]'));
  await page.locator('#available-models').selectOption('fixture-vision');await page.locator('#test-btn').click();
  await page.waitForFunction(()=>document.querySelector('#test-status').textContent.includes('Connected'));
  assert.ok((await page.evaluate(()=>localStorage.getItem('nutrilens.settings.v1'))).includes('api.wikivibe.dev'));
  assert.ok(!(await page.evaluate(()=>localStorage.getItem('nutrilens.settings.v1'))).includes(key));
  await page.locator('#close-drawer').click();await page.locator('#input').fill('One apple');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='95kcal');
  assert.ok(calls.length>=4);assert.ok(calls.every(call=>call.url.startsWith(WIKIVIBE_BASE_URL+'/')));
  assert.ok(calls.every(call=>call.options.headers.Authorization==='Bearer '+key));
  assert.ok(calls.every(call=>call.options.redirect==='error'));
  assert.ok(siteCookies.some(cookie=>cookie.includes('site-session=synthetic-site-session')));
  assert.ok(calls.every(call=>!Object.keys(call.options.headers).some(name=>name.toLowerCase()==='cookie')));
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  const blocked=await page.request.post(origin+HOSTED_RELAY_PATH,{headers:{Origin:'https://evil.test','X-NutriLens-Relay':'hosted-v1',Authorization:'Bearer '+key},data:{path:'/v1/models',method:'GET'}});assert.equal(blocked.status(),403);
  const next=await browser.newContext(),fresh=await next.newPage();await fresh.goto(origin);
  const freshSettings=await fresh.evaluate(async()=>{const {loadSettings}=await import('/src/store.js');return loadSettings();});
  assert.equal(freshSettings.apiKey,'');assert.equal(freshSettings.baseUrl,'');await next.close();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#settings-btn').click();await page.evaluate(()=>document.querySelector('.toasts').replaceChildren());
  await page.screenshot({path:'artifacts/hosted-relay-mobile.png',fullPage:true,animations:'disabled'});
  console.log('PASS: built Vercel UI + actual relay handler; blank keys; automatic custom-endpoint transport; visitor-key models/test/analysis; no direct provider/CORS requests; safe errors; origin rejection; visitor isolation and mobile layout. Fake provider only.');
}finally{await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
