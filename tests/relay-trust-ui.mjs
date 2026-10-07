// Real loopback relay + browser consent; synthetic keys and no provider CORS.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';

const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const requests=[],errors=[],external=[],prompts=[];
const result={dish:'Synthetic apple',summary:'Custom relay fixture',confidence:.8,items:[{name:'Apple',grams:100,quantity:'1 apple',calories:95}],total:{calories:95,protein_g:.5,carbs_g:25,fat_g:.3},health_score:80};
function providerServer(name){
  return http.createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;
    const body=text?JSON.parse(text):null;
    requests.push({name,path:req.url,auth:req.headers.authorization,extra:req.headers['x-custom'],body});
    res.setHeader('Content-Type','application/json');
    // Deliberately omit Access-Control-Allow-Origin: only the relay can work.
    if(req.url==='/v1/models')return res.end(JSON.stringify({data:[{id:name+'-vision'},{id:name+'-text'}]}));
    const output=JSON.stringify(body).includes('Reply with the single word')?'ok':JSON.stringify(result);
    res.end(JSON.stringify({choices:[{message:{content:output}}]}));
  });
}
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
const one=providerServer('one'),two=providerServer('two'),app=createAppServer({allowedOrigins:[]});
const first=await listen(one),second=await listen(two),origin=await listen(app);
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:'))external.push(request.url());});
  let approve=false;
  page.on('dialog',async dialog=>{
    if(dialog.message().includes('Trust this provider for the local relay?')){
      prompts.push(dialog.message());if(approve)await dialog.accept();else await dialog.dismiss();
    }else await dialog.accept();
  });
  await page.goto(origin);await page.locator('#settings-btn').click();
  assert.equal(await page.locator('#set-maxtokens').inputValue(),'20000');
  await page.locator('#set-baseurl').fill(first+'/v1');await page.locator('#set-apikey').fill('synthetic-custom-key');
  await page.locator('summary').filter({hasText:'Advanced request options'}).click();await page.locator('#set-extra').fill('X-Custom: synthetic-extra');
  await page.locator('#models-btn').click();
  await page.waitForFunction(()=>document.querySelector('#models-status .status-dot.bad'));
  assert.equal(prompts.length,1);assert.ok(prompts[0].includes(first));assert.ok(!prompts[0].includes('synthetic-custom-key'));assert.equal(requests.length,0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('nutrilens.relay-trust.v1')),null);
  approve=true;await page.locator('#models-btn').click();
  await page.waitForFunction(()=>document.querySelector('#available-models option[value="one-vision"]'));
  assert.equal(prompts.length,2);assert.equal(requests.length,1);assert.equal(requests[0].auth,'Bearer synthetic-custom-key');assert.equal(requests[0].extra,'synthetic-extra');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.relay-trust.v1'))),[first]);
  await page.locator('#available-models').selectOption('one-vision');await page.locator('#test-btn').click();
  await page.waitForFunction(()=>document.querySelector('#test-status').textContent.includes('Connected'));
  assert.equal(prompts.length,2);assert.equal(requests.at(-1).body.max_tokens,256);
  await page.locator('#close-drawer').click();await page.locator('#input').fill('One apple');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='95kcal'&&!document.querySelector('#send-btn').disabled);
  assert.equal(requests.at(-1).body.max_tokens,20000);
  await page.reload();await page.locator('#settings-btn').click();
  assert.equal(await page.locator('#set-apikey').inputValue(),'synthetic-custom-key');assert.equal(await page.locator('#set-baseurl').inputValue(),first+'/v1');assert.equal(await page.locator('#available-models').inputValue(),'one-vision');
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#models-status .status-dot.ok'));
  assert.equal(prompts.length,2,'refresh retains the approval');
  await page.locator('#set-baseurl').fill(second+'/v1');await page.locator('#models-btn').click();
  await page.waitForFunction(()=>document.querySelector('#available-models option[value="two-vision"]'));
  assert.equal(prompts.length,3);assert.ok(prompts[2].includes(second));assert.equal(requests.at(-1).name,'two');
  await page.locator('#available-models').selectOption('two-vision');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#reset-btn').click();
  await page.waitForFunction(()=>document.querySelector('#set-baseurl').value==='');
  assert.equal(await page.evaluate(()=>localStorage.getItem('nutrilens.relay-trust.v1')),null);assert.equal(await page.locator('#set-apikey').inputValue(),'');assert.equal(await page.locator('#set-model').inputValue(),'');assert.equal(await page.locator('#set-maxtokens').inputValue(),'20000');
  await page.reload();await page.locator('#settings-btn').click();
  await page.locator('#set-baseurl').fill(first+'/v1');await page.locator('#set-apikey').fill('synthetic-custom-key');approve=false;
  const count=requests.length;await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#models-status .status-dot.bad'));
  assert.equal(prompts.length,4,'reset and refresh require trust again');assert.equal(requests.length,count,'a rejected approval never reaches the provider');
  const savedCount=await page.evaluate(async()=>{const {createHistoryRepository}=await import('/src/history-store.js');const repo=createHistoryRepository();const entries=await repo.list();await repo.close();return entries.length;});
  assert.equal(savedCount,1,'reset preserves saved analyses');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: custom URLs without CORS, cancel/approve, models, connection and analysis, origin-specific approvals, refresh persistence, reset revocation, preserved history and mobile layout. Synthetic data only.');
}finally{await browser?.close();await close(app);await close(one);await close(two);}
