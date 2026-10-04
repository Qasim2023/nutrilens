// Serve only the generated Pages artifact under a repository prefix. No /api routes.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {buildPages} from '../scripts/build-pages.mjs';
import {recipePdf,recipeDocx,RECIPE} from './recipe-fixtures.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),prefix='/nutrition-project/';
const {output}=await buildPages();
const requests=[],apiRequests=[];let preflights=0;
const provider=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin||'*');
  res.setHeader('Access-Control-Allow-Headers','authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  if(req.method==='OPTIONS'){preflights++;res.writeHead(204);return res.end();}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  apiRequests.push({path:req.url,auth:req.headers.authorization,body:Buffer.concat(chunks).toString()});
  const raw={dish:'Eggs',summary:'Static hosting fixture',confidence:.8,items:[{name:'Eggs',grams:100,quantity:'100 g',calories:155,protein_g:13,carbs_g:1,fat_g:11}],total:{calories:155},health_score:70};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('/models')?{data:[{id:'mock'}]}:{choices:[{message:{content:JSON.stringify(raw)}}]}));
});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${provider.address().port}`;
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;requests.push({method:req.method,path:pathname});
  if(!['GET','HEAD'].includes(req.method)||!pathname.startsWith(prefix)){res.writeHead(404);return res.end();}
  const relative=decodeURIComponent(pathname.slice(prefix.length))||'index.html',file=path.resolve(output,relative);
  if(!file.startsWith(output+path.sep)){res.writeHead(403);return res.end();}
  try{const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(content);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({api})=>{if(!localStorage.getItem('nutrilens.settings.v1'))localStorage.setItem('nutrilens.settings.v1',JSON.stringify({connectionRevision:2,provider:'custom',baseUrl:api+'/v1',model:'mock',auth:'bearer',apiKey:'synthetic-key-for-cors-test',transport:'relay',language:'en'}));},{api});
  await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
  await page.locator('#settings-btn').click();await page.waitForSelector('#static-hosting-notice:not([hidden])');
  assert.equal(await page.locator('#set-transport').inputValue(),'direct');assert.equal(await page.locator('#set-transport').isDisabled(),true);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.settings.v1')).transport),'direct');
  await page.locator('#models-btn').click();await page.waitForFunction(()=>document.querySelector('#available-models option[value="mock"]'));
  await page.locator('#close-drawer').click();
  const docs=await page.evaluate(async({pdf,docx})=>{
    const {readAttachment}=await import('./src/attachments.js');
    const a=await readAttachment(new File([new Uint8Array(pdf)],'recipe.pdf'));
    const b=await readAttachment(new File([new Uint8Array(docx)],'recipe.docx'));
    let invalid='';try{await readAttachment(new File(['not a pdf'],'bad.pdf'));}catch(error){invalid=error.message;}
    return {a,b,invalid};
  },{pdf:[...recipePdf()],docx:[...recipeDocx()]});
  assert.match(docs.a.text,/100 g rolled oats/);assert.equal(docs.a.pages,1);assert.match(docs.b.text,/100 ml whole milk/);assert.match(docs.invalid,/valid PDF/);
  await page.locator('#attachment-input').setInputFiles([{name:'recipe.pdf',mimeType:'application/pdf',buffer:recipePdf()},{name:'recipe.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:recipeDocx()}]);
  await page.waitForFunction(()=>document.querySelectorAll('.attachment-card').length===2||document.querySelector('#attachments-slot').textContent.includes('recipe.docx'));
  await page.locator('#input').fill('Analyse the recipe');await page.locator('#send-btn').click();
  await page.waitForFunction(()=>document.querySelector('#result .total-kcal')?.textContent==='155kcal');
  await page.waitForFunction(()=>document.querySelector('#history-save-status').textContent.startsWith('Saved'));
  const analysis=apiRequests.find(r=>r.path.endsWith('/chat/completions'));
  assert.equal(analysis.auth,'Bearer synthetic-key-for-cors-test');assert.match(analysis.body,/100 g rolled oats/);assert.match(analysis.body,/100 ml whole milk/);
  await page.locator('[data-action="log-diary"]').click();await page.locator('#diary-save').click();await page.waitForSelector('[data-diary-entry]');
  await page.locator('#diary-food').fill('2 eggs');await page.locator('#diary-save').click();await page.waitForFunction(()=>document.querySelectorAll('[data-diary-entry]').length===2);
  await page.reload();await page.locator('#view-diary').click();assert.equal(await page.locator('[data-diary-entry]').count(),2);
  await page.locator('#settings-btn').click();await page.locator('#set-language').selectOption('ur');await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'artifacts/github-pages-mobile.png',fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]);assert.ok(preflights>0);assert.equal(requests.some(r=>r.method==='POST'||r.path.includes('/api/')),false);
  assert.equal(requests.filter(r=>r.path.includes('/vendor/')).every(r=>r.path.startsWith(prefix)),true);
  console.log('PASS: repository-prefix static hosting, legacy relay migrated to direct CORS, model discovery, local PDF/DOCX workers, Analysis/Diary, persistence, Urdu mobile. No backend or external services.');
}finally{await browser?.close();await Promise.all([server,provider].map(s=>new Promise(r=>{s.close(r);s.closeAllConnections();})));}
