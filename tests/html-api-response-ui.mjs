// Reproduce successful model discovery followed by an HTML 200 completion.
// All data is synthetic, browser storage is isolated, and no external API runs.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const calls=[],errors=[],external=[];
const model='gpt-6-fixture';
const nutrition={dish:'Synthetic apple',summary:'Responses-only test fixture',confidence:.8,items:[{name:'Apple',quantity:'1 apple',grams:100,calories:95}],total:{calories:95,protein_g:.5,carbs_g:25,fat_g:.3},health_score:80};
const website='<!doctype html><html><body>synthetic-private-provider-page</body></html>';
let bothHtml=false,holdResponses=false,releaseResponse,responseStarted;
const responseReady=new Promise(resolve=>{responseStarted=resolve;});
const provider=http.createServer(async(req,res)=>{
  let text='';for await(const chunk of req)text+=chunk;
  const body=text?JSON.parse(text):null;
  calls.push({path:req.url,method:req.method,headers:req.headers,body});
  if(req.url==='/v1/chat/completions'||(bothHtml&&req.url==='/v1/responses')){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(website);
  }
  res.setHeader('Content-Type','application/json');
  if(req.url==='/v1/models')return res.end(JSON.stringify({data:[{id:model}]}));
  if(req.url!=='/v1/responses'){res.writeHead(404);return res.end('{}');}
  if(holdResponses){responseStarted();await new Promise(resolve=>{releaseResponse=resolve;});holdResponses=false;}
  const output=JSON.stringify(body).includes('Reply with the single word')?'ok':JSON.stringify(nutrition);
  res.end(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:output}]}]}));
});
async function listen(server){server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
const api=await listen(provider),app=createAppServer({allowedOrigins:[api]}),origin=await listen(app);
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:'))external.push(request.url());});
  await page.goto(origin);await page.locator('#settings-btn').click();
  await page.locator('#set-baseurl').fill(api+'/v1');await page.locator('#set-apikey').fill('synthetic-responses-key');
  await page.locator('#models-btn').click();await page.waitForFunction(model=>document.querySelector('#available-models').querySelector('option[value="'+model+'"]'),model);
  await page.locator('#available-models').selectOption(model);
  await page.locator('#set-apiformat').selectOption('chat');await page.locator('#close-drawer').click();
  await page.locator('#input').fill('One apple');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('HTML page')&&!document.querySelector('#send-btn').disabled);
  assert.deepEqual(calls.map(call=>call.path),['/v1/models','/v1/chat/completions']);
  assert.match(await page.locator('#result').textContent(),/API base URL and API format/);
  assert.doesNotMatch(await page.locator('#result').textContent(),/Unexpected token|synthetic-private-provider-page|synthetic-responses-key|<!doctype/i);
  await page.locator('#settings-btn').click();await page.locator('#set-apiformat').selectOption('auto');await page.locator('#close-drawer').click();
  holdResponses=true;await page.locator('#send-btn').click();
  await responseReady;
  assert.equal(await page.locator('#result .loading-status span').last().textContent(),'Analysing your description…');
  assert.doesNotMatch(await page.locator('#result').textContent(),/Trying the Responses API|Retrying without|Repairing the nutrition/);
  releaseResponse();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='95kcal'&&!document.querySelector('#send-btn').disabled);
  assert.deepEqual(calls.slice(-2).map(call=>call.path),['/v1/chat/completions','/v1/responses']);
  const responseRequest=calls.at(-1);assert.equal(responseRequest.body.max_output_tokens,20000);assert.equal(responseRequest.body.store,false);assert.equal(responseRequest.body.model,model);assert.equal(responseRequest.headers.authorization,'Bearer synthetic-responses-key');
  assert.ok(responseRequest.body.input.some(message=>message.role==='user'&&JSON.stringify(message.content).includes('One apple')));
  await page.locator('#settings-btn').click();await page.locator('#test-btn').click();
  await page.waitForFunction(()=>document.querySelector('#test-status').textContent.includes('Connected'));
  assert.match(await page.locator('#test-status').textContent(),/Responses/);assert.equal(calls.at(-1).body.max_output_tokens,256);
  await page.locator('#set-apiformat').selectOption('responses');await page.locator('#close-drawer').click();
  const explicitStart=calls.length;await page.locator('#input').fill('A second apple');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='95kcal'&&!document.querySelector('#send-btn').disabled);
  assert.deepEqual(calls.slice(explicitStart).map(call=>call.path),['/v1/responses']);
  await page.reload();await page.locator('#settings-btn').click();assert.equal(await page.locator('#set-apiformat').inputValue(),'responses');
  await page.locator('#set-apiformat').selectOption('auto');await page.locator('#close-drawer').click();
  bothHtml=true;const failureStart=calls.length;await page.locator('#input').fill('A third apple');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('HTML page')&&!document.querySelector('#send-btn').disabled);
  assert.deepEqual(calls.slice(failureStart).map(call=>call.path),['/v1/chat/completions','/v1/responses']);
  assert.ok((await page.locator('#result').textContent()).includes(api+'/v1/responses'));
  const history=await page.evaluate(async()=>{const {createHistoryRepository}=await import('/src/history-store.js');const repo=createHistoryRepository();const data=await repo.list();await repo.close();return data.length;});
  assert.equal(history,2,'failed requests never save fake nutrition');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: models load, explicit Chat rejects HTML, Auto analyses via Responses, 20,000-token payload, tiny connection test, explicit Responses persists, both HTML routes fail clearly, no fake results, and mobile layout. Synthetic data only.');
}finally{releaseResponse?.();await browser?.close();await close(app);await close(provider);}
