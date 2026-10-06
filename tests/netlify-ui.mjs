// Isolated static Netlify artifact with the EXACT production headers. Same-origin
// synthetic AI routes are test fixtures only; real cross-origin CORS is covered by pages-ui.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {buildPages} from '../scripts/build-pages.mjs';
import {NETLIFY_HEADERS} from '../scripts/netlify-headers.mjs';
import {recipePdf,recipeDocx} from './recipe-fixtures.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const {output}=await buildPages();let calls=0,failProvider=false;
const requests=[];
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;requests.push({method:req.method,path:pathname});
  for(const [key,value] of Object.entries(NETLIFY_HEADERS))res.setHeader(key,value);
  if(pathname.startsWith('/v1/')) {
    assert.equal(req.headers.authorization,'Bearer synthetic-personal-key');
    if(failProvider){res.writeHead(401,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{message:'Rejected synthetic-personal-key'}}));}
    if(pathname==='/v1/models'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({data:[{id:'mock'}]}));}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);JSON.parse(Buffer.concat(chunks).toString());calls++;
    const names=calls===1?['Eggs']:['Eggs','Toast','Coffee'];
    const raw={dish:calls===1?'Eggs':'Personal breakfast',summary:'Synthetic Netlify fixture',confidence:.85,items:names.map((name,index)=>({name,visual_food:['eggs','bread','coffee'][index],quantity:'1 serving',calories:100,protein_g:10,carbs_g:10,fat_g:4})),total:{calories:names.length*100},health_score:75};
    res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(raw)}}]}));
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(404);return res.end();}
  const relative=decodeURIComponent(pathname).replace(/^\/+/, '')||'index.html',file=path.resolve(output,relative);
  if(!file.startsWith(output+path.sep)){res.writeHead(403);return res.end();}
  try {const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[],external=[];
  const origin=`http://127.0.0.1:${server.address().port}`;
  const observe=page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(!request.url().startsWith(origin)&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:'))external.push(request.url());});
  };
  observe(page);
  await page.addInitScript(({origin})=>{
    if(!localStorage.getItem('nutrilens.settings.v1'))localStorage.setItem('nutrilens.settings.v1',JSON.stringify({connectionRevision:2,provider:'custom',baseUrl:origin+'/v1',model:'mock',auth:'bearer',apiKey:'synthetic-personal-key',transport:'relay'}));
    window.testCspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.testCspViolations.push(event.violatedDirective));
  },{origin});
  const response=await page.goto(origin);
  assert.equal(response.headers()['content-security-policy'],NETLIFY_HEADERS['Content-Security-Policy']);
  assert.equal((await page.request.get(origin+'/missing.js')).status(),404);
  for(const hidden of ['/server.mjs','/netlify.toml','/.env','/README.md'])assert.equal((await page.request.get(origin+hidden)).status(),404);
  await page.locator('#settings-btn').click();
  assert.equal(await page.locator('#set-transport').inputValue(),'direct');assert.equal(await page.locator('#set-transport').isDisabled(),true);
  await page.locator('#personal-privacy-notice summary').click();assert.ok((await page.locator('#personal-privacy-notice').textContent()).includes('not an encrypted vault'));
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#available-models option[value="mock"]'));
  // Rejected credentials must not be exposed by the connection status.
  failProvider=true;await page.locator('#test-btn').click();await page.waitForFunction(()=>document.querySelector('#test-status').textContent.includes('401'));
  assert.ok(!(await page.locator('#test-status').textContent()).includes('synthetic-personal-key'));failProvider=false;
  await page.locator('#close-drawer').click();
  const parsed=await page.evaluate(async({pdf,docx})=>{
    const {readAttachment}=await import('/src/attachments.js');
    return [await readAttachment(new File([new Uint8Array(pdf)],'recipe.pdf')),await readAttachment(new File([new Uint8Array(docx)],'recipe.docx'))];
  },{pdf:[...recipePdf()],docx:[...recipeDocx()]});
  assert.match(parsed[0].text,/100 g rolled oats/);assert.match(parsed[1].text,/100 ml whole milk/);
  await page.locator('#input').fill('2 eggs');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='100kcal');
  await page.waitForFunction(()=>document.querySelector('#history-save-status').textContent.startsWith('Saved'));
  assert.equal(await page.locator('#result .food-illustration').getAttribute('data-food-multiple'),'false');
  await page.locator('#result .result-thumb').evaluate(img=>img.decode());
  await page.locator('[data-action="log-diary"]').click();await page.locator('#diary-save').click();await page.waitForSelector('[data-diary-entry]');
  await page.locator('#view-analysis').click();
  await page.locator('#attachment-input').setInputFiles([{name:'recipe.pdf',mimeType:'application/pdf',buffer:recipePdf()},{name:'recipe.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:recipeDocx()}]);
  await page.waitForFunction(()=>document.querySelector('#attachments-slot').textContent.includes('recipe.docx'));
  await page.locator('#file-input').setInputFiles({name:'food.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')});
  await page.waitForSelector('#remove-image');
  await page.locator('#input').fill('Eggs, toast and coffee');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='300kcal');
  await page.waitForFunction(()=>document.querySelector('#history-save-status').textContent.startsWith('Saved'));
  assert.equal(await page.locator('#result .food-illustration').count(),0);await page.locator('#result .result-thumb').evaluate(img=>img.decode());
  await page.locator('[data-action="log-diary"]').click();await page.locator('#diary-save').click();await page.waitForFunction(()=>document.querySelectorAll('[data-diary-entry]').length===2);
  await page.locator('#view-analysis').click();
  await page.locator('#meal-library-toggle').click();await page.waitForFunction(()=>document.querySelectorAll('button.library-select[data-open-analysis]').length===2);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#meal-library-backup').click()]);
  assert.match(download.suggestedFilename(),/^nutrilens-all-meals-/);
  const backupText=await fs.readFile(await download.path(),'utf8'),backup=JSON.parse(backupText);
  assert.equal(backup.history.analyses.length,2);assert.equal(backup.diary.entries.length,2);
  assert.doesNotMatch(backupText,/synthetic-personal-key|extraHeaders/);
  assert.ok(backup.history.analyses.some(entry=>entry.input.image));
  assert.ok(backup.history.analyses.some(entry=>entry.input.attachments.length===2));
  await page.reload();await page.locator('#view-diary').click();assert.equal(await page.locator('[data-diary-entry]').count(),2);
  assert.deepEqual(await page.evaluate(()=>window.testCspViolations),[]);
  // Restore into a second isolated profile: simulates a different browser/site.
  const secondContext=await browser.newContext(),restored=await secondContext.newPage();observe(restored);
  await restored.goto(origin);await restored.locator('#meal-library-toggle').click();
  const restoreFile={name:'all-meals.json',mimeType:'application/json',buffer:Buffer.from(backupText)};
  for(let attempt=0;attempt<2;attempt++) {
    await restored.locator('#meal-library-import-file').setInputFiles(restoreFile);
    await restored.waitForFunction(()=>document.querySelector('#library-history-count').textContent==='2'&&document.querySelector('#library-diary-count').textContent==='2'&&!document.querySelector('#meal-library-backup').disabled);
  }
  const snapshot=await restored.evaluate(async()=>{const {createHistoryRepository}=await import('/src/history-store.js');const {loadDiary}=await import('/src/diary-store.js');const history=createHistoryRepository();const result={analyses:(await history.backup()).analyses,diary:loadDiary()};await history.close();return result;});
  assert.deepEqual(snapshot.analyses,backup.history.analyses);assert.deepEqual(snapshot.diary,backup.diary.entries);
  const invalid={...backup,diary:{version:1,entries:[{id:'invalid'}]}};
  await restored.locator('#meal-library-import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await restored.waitForFunction(()=>document.querySelector('.toasts').textContent.includes('invalid diary entries'));
  assert.equal(await restored.locator('#library-history-count').textContent(),'2');assert.equal(await restored.locator('#library-diary-count').textContent(),'2');
  await restored.locator('button.library-select[data-open-analysis]').last().click();assert.equal(calls,2);
  await restored.locator('#result .result-thumb').evaluate(img=>img.decode());
  await restored.locator('#settings-btn').click();await restored.locator('#set-language').selectOption('ur');await restored.locator('button[data-theme-pick="light"]').click();
  assert.match(await restored.locator('#personal-privacy-notice summary').textContent(),/رازداری/);
  await restored.setViewportSize({width:390,height:844});assert.equal(await restored.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await restored.locator('#close-drawer').click();
  await restored.evaluate(()=>document.querySelector('.toasts').replaceChildren());
  await restored.screenshot({path:'artifacts/netlify-mobile.png',fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  assert.equal(requests.some(req=>req.path.startsWith('/api/')),false);
  console.log('PASS: Netlify root artifact with real CSP/security headers, direct AI, safe credential errors, PDF/DOCX workers, photo priority, saved meals, full backup/download/restore, invalid-import safety, reload, Urdu/light/mobile. No real AI calls or user data.');
} finally {await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
