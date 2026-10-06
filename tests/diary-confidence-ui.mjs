// Synthetic local data and mocked provider; never reads the user's browser profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2] || 'playwright');
const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url='http://127.0.0.1:'+server.address().port;await page.goto(url);
  await page.evaluate(async()=>{
    const {createEntry,saveDiary,localDay}=await import('/src/diary-store.js');
    const {createHistoryRepository}=await import('/src/history-store.js');
    const {normalize}=await import('/src/ai.js');
    const {defaults,saveSettings}=await import('/src/store.js');
    saveSettings({...defaults,demoMode:false,baseUrl:'https://api.openai.com/v1',model:'synthetic-model',auth:'none',transport:'relay',apiFormat:'chat',language:'en'});
    saveDiary([
      createEntry({name:'Grilled salmon bowl',calories:420,date:localDay(),meal:'lunch',source:'ai',confidence:.87},{id:'ai'}),
      createEntry({name:'Greek yogurt with berries',calories:240,date:localDay(),meal:'breakfast'},{id:'manual'}),
      createEntry({name:'Older estimated meal',calories:280,date:localDay(),meal:'dinner',source:'ai'},{id:'legacy'})
    ]);
    const repo=createHistoryRepository();await repo.put({version:2,id:'saved',when:Date.now(),result:normalize({dish:'Saved lentil soup',confidence:.92,total:{calories:300},items:[{name:'Soup',calories:300}]})});await repo.close();
  });
  await page.reload();await page.locator('#view-diary').click();
  const ai=page.locator('[data-diary-entry="ai"]'),manual=page.locator('[data-diary-entry="manual"]');
  assert.equal(await ai.locator('.diary-entry-calories .diary-confidence').textContent(),'87% estimate confidence');
  assert.equal(await manual.locator('.diary-confidence').count(),0);
  assert.equal(await page.locator('[data-diary-entry="legacy"] .diary-confidence').textContent(),'Estimate confidence unavailable');
  await page.locator('.diary-log-card').screenshot({animations:'disabled',path:'artifacts/diary-confidence-desktop.png'});
  await page.reload();await page.locator('#view-diary').click();assert.equal(await ai.locator('.diary-confidence').textContent(),'87% estimate confidence');
  // Same calories and food keep confidence when changing only the meal category.
  await page.locator('[data-edit-entry="ai"]').click();await page.locator('#diary-meal').selectOption('dinner');await page.locator('#diary-save').click();
  assert.equal(await ai.locator('.diary-confidence').textContent(),'87% estimate confidence');
  await page.locator('[data-edit-entry="ai"]').click();await page.locator('#diary-calories').fill('430');await page.locator('#diary-save').click();
  assert.equal(await ai.locator('.diary-confidence').count(),0);
  // Confidence from an actual saved full-result path reaches the diary draft.
  await page.locator('#view-analysis').click();await page.locator('#meal-library-toggle').click();
  await page.locator('[data-open-analysis="saved"]').first().click();
  await page.locator('[data-action="log-diary"]').click();await page.locator('#diary-save').click();
  const soup=page.locator('.diary-entry').filter({has:page.getByText('Saved lentil soup',{exact:true})});
  assert.equal(await soup.locator('.diary-confidence').textContent(),'92% estimate confidence');
  // Fresh estimates save confidence from the mocked response without an external request.
  await page.route('**/api/relay',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({dish:'Test apple',confidence:.81,items:[{name:'Apple',calories:95}],total:{calories:95},portion_notes:'One medium apple.'})}}]})}));
  await page.locator('#diary-food').fill('Test apple');await page.locator('#diary-calories').fill('');await page.locator('#diary-save').click();
  const apple=page.locator('.diary-entry').filter({has:page.getByText('Test apple',{exact:true})});
  await apple.waitFor();assert.equal(await apple.locator('.diary-confidence').textContent(),'81% estimate confidence');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.querySelector('.toast'));
  await page.locator('.diary-log-card').screenshot({animations:'disabled',path:'artifacts/diary-confidence-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const badge of await page.locator('.diary-confidence').all()){
    const box=await badge.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=390);
  }
  await page.evaluate(async()=>{const {setLanguage}=await import('/src/i18n.js');setLanguage('ur');});
  assert.match(await apple.locator('.diary-confidence').textContent(),/81%/);
  assert.doesNotMatch(await apple.locator('.diary-confidence').textContent(),/Estimate confidence/);
  assert.equal(await apple.locator('.diary-entry-description strong').textContent(),'Test apple');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#view-analysis').click();await page.locator('#meal-library-toggle').click();await page.locator('#library-tab-diary').click();
  assert.equal(await page.locator('[data-choose-diary] .diary-confidence').count(),3);
  assert.deepEqual(errors,[]);
  console.log('Diary confidence UI passed: saved analysis drafts, fresh estimates, reload, edits, manual/legacy entries, mobile, translation, and diary library.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
