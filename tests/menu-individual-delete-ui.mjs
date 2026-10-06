// Isolated local UI test with synthetic saved meals only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const require=createRequire(import.meta.url);const {chromium}=require(process.argv[2]||'playwright');
const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(async()=>{
  const {createHistoryRepository}=await import('/src/history-store.js');const {normalize}=await import('/src/ai.js');const {createEntry,saveDiary,localDay}=await import('/src/diary-store.js');
  const h=createHistoryRepository();await h.put({version:2,id:'analysis-1',when:Date.now(),result:normalize({dish:'Saved pasta analysis',confidence:.82,total:{calories:500},items:[{name:'Pasta',calories:500}]})});await h.close();
  saveDiary([createEntry({name:'Diary breakfast',calories:300,date:localDay(),meal:'breakfast'}),createEntry({name:'Diary lunch',calories:450,date:localDay(),meal:'lunch'})]);
 });
 await page.reload();await page.locator('#meal-library-toggle').click();
 assert.equal(await page.locator('[data-open-analysis=\"analysis-1\"] .diary-confidence').textContent(),'82% estimate confidence');
 await page.locator('[data-remove-analysis="analysis-1"]').click();await page.locator('#delete-confirmation').waitFor();assert.match(await page.locator('#delete-confirmation').innerText(),/Saved pasta analysis/);await page.locator('[data-delete-cancel]').click();assert.equal(await page.locator('[data-remove-analysis="analysis-1"]').count(),1);
 await page.locator('[data-remove-analysis="analysis-1"]').click();await page.locator('[data-delete-confirm]').click();await page.waitForFunction(()=>document.querySelector('#library-history-count').textContent==='0');
 await page.locator('#library-tab-diary').click();assert.equal(await page.locator('[data-remove-diary]').count(),2);await page.locator('[data-remove-diary]').first().click();await page.locator('#delete-confirmation').waitFor();assert.match(await page.locator('#delete-confirmation').innerText(),/Diary (breakfast|lunch)/);await page.locator('[data-delete-confirm]').click();await page.waitForFunction(()=>document.querySelector('#library-diary-count').textContent==='1');
 assert.equal(await page.locator('[data-remove-diary]').count(),1);assert.equal(await page.locator('#library-history-count').textContent(),'0');assert.deepEqual(errors,[]);console.log('Individual menu delete UI passed for analyses and diary meals.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
