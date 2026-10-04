// Run with a Playwright module directory and optional installed browser executable.
// Uses an isolated browser profile and only synthetic data; never calls an AI provider.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2] || 'playwright');
const server=createAppServer();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url);
  const clear=page.locator('#meal-library-clear-all');
  async function seed(analysisCount=36,diaryCount=3) {
    await page.evaluate(async({analysisCount,diaryCount})=>{
      const {createHistoryRepository,HISTORY_KEY}=await import('/src/history-store.js');
      const {normalize}=await import('/src/ai.js');
      const {createEntry,localDay,saveDiary}=await import('/src/diary-store.js');
      const history=createHistoryRepository();
      await history.clear();
      const entries=[];
      for(let i=0;i<analysisCount;i++) {
        const entry={version:2,id:'test-'+i,when:Date.now()-i*86400000,result:normalize({dish:'Test meal '+i,summary:'Synthetic UI fixture',items:[{name:'Food',calories:200}],total:{calories:200}})};
        entries.push(entry);await history.put(entry);
      }
      localStorage.setItem(HISTORY_KEY,JSON.stringify(entries));
      saveDiary(Array.from({length:diaryCount},(_,i)=>createEntry({name:i===2?'':'Diary food '+i,calories:200,date:i===0?localDay():'2025-01-01',meal:'other'},{id:'diary-'+i,now:100+i})));
      await history.close();
    },{analysisCount,diaryCount});
    await page.reload();
    await page.locator('#meal-library-toggle').click();
    await page.waitForFunction(({analysisCount,diaryCount})=>document.querySelector('#library-history-count').textContent===String(analysisCount)&&document.querySelector('#library-diary-count').textContent===String(diaryCount),{analysisCount,diaryCount});
  }
  async function confirmDelete(accept) {
    const dialogPromise=page.waitForEvent('dialog');
    const clickPromise=clear.click();
    const dialog=await dialogPromise;
    const message=dialog.message();
    assert.match(message,/cannot be undone/);
    assert.match(message,/will be kept/);
    assert.doesNotMatch(message,/Both tabs will be cleared/);
    await (accept?dialog.accept():dialog.dismiss());
    await clickPromise;
    await page.waitForFunction(()=>!document.querySelector('#meal-library-close').disabled);
    return message;
  }
  await seed();
  const settings=await page.evaluate(()=>localStorage.getItem('nutrilens.settings.v1'));
  assert.equal(await clear.textContent(),'Delete all analyses');
  assert.equal(await clear.isEnabled(),true);
  assert.equal(await page.locator('#meal-library-list .library-meal').count(),30);
  await page.locator('#meal-library-search').fill('no matches');
  assert.equal(await page.locator('#meal-library-list .library-meal').count(),0);
  const warning=await confirmDelete(false);
  assert.match(warning,/ALL 36 saved analyses/);
  assert.match(warning,/All diary meals and daily calorie totals will be kept/);
  assert.equal(await page.locator('#library-history-count').textContent(),'36');
  assert.equal(await page.locator('#library-diary-count').textContent(),'3');
  assert.equal(await page.locator('#meal-library-search').inputValue(),'no matches');
  await page.locator('#meal-library-search').fill('');
  await page.screenshot({path:'artifacts/meal-library-bulk-delete.png'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#library-tab-diary').click();
  assert.equal(await clear.textContent(),'Delete all diary meals');
  assert.match(await page.locator('#meal-library-clear-note').textContent(),/Saved analyses are kept/);
  const bounds=await clear.boundingBox();
  assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390 && bounds.y+bounds.height<=844);
  await page.screenshot({path:'artifacts/meal-library-bulk-delete-mobile.png'});
  await page.locator('#library-tab-history').click();
  await page.locator('#meal-library-search').fill('no matches');
  await confirmDelete(true);
  assert.equal(await clear.isDisabled(),true);
  assert.equal(await page.locator('#library-history-count').textContent(),'0');
  assert.equal(await page.locator('#library-diary-count').textContent(),'3');
  assert.equal(await page.locator('#meal-library-search').inputValue(),'');
  await page.locator('#meal-library-close').click();await page.locator('#view-diary').click();
  assert.equal(await page.locator('#diary-total').textContent(),'200');
  await page.locator('#diary-date').fill('2025-01-01');await page.locator('#diary-date').dispatchEvent('change');
  assert.equal(await page.locator('#diary-total').textContent(),'400');
  await page.reload();await page.locator('#meal-library-toggle').click();
  assert.equal(await clear.isDisabled(),true);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('nutrilens.history.v1'))),[]);
  assert.equal(await page.locator('#library-diary-count').textContent(),'3');
  await page.locator('#library-tab-diary').click();
  assert.equal(await clear.isEnabled(),true);
  await page.locator('#meal-library-search').fill('no matches');
  const diaryWarning=await confirmDelete(true);
  assert.match(diaryWarning,/ALL 3 diary meals from every date/);
  assert.match(diaryWarning,/All saved analyses will be kept/);
  assert.equal(await clear.isDisabled(),true);
  assert.equal(await page.locator('#library-diary-count').textContent(),'0');
  await page.locator('#meal-library-close').click();await page.locator('#view-diary').click();
  assert.equal(await page.locator('#diary-total').textContent(),'0');
  await page.locator('#diary-date').fill('2025-01-01');await page.locator('#diary-date').dispatchEvent('change');
  assert.equal(await page.locator('#diary-total').textContent(),'0');
  assert.match(await page.locator('#diary-today-total').textContent(),/^0 kcal/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('nutrilens.settings.v1')),settings);

  // Failed diary writes leave both lists intact; analyses still delete independently.
  await seed(1,1);await page.locator('#library-tab-diary').click();
  await page.evaluate(()=>{
    const write=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='nutrilens.diary.v1')throw new Error('Synthetic storage failure');return write.call(this,key,value);};
  });
  await confirmDelete(true);
  assert.equal(await page.locator('#library-history-count').textContent(),'1');
  assert.equal(await page.locator('#library-diary-count').textContent(),'1');
  assert.equal(await clear.isEnabled(),true);
  await page.locator('#library-tab-history').click();await confirmDelete(true);
  assert.equal(await page.locator('#library-history-count').textContent(),'0');
  assert.equal(await page.locator('#library-diary-count').textContent(),'1');
  await page.reload();await page.locator('#meal-library-toggle').click();
  await page.locator('#library-tab-diary').click();await confirmDelete(true);

  for(const [analyses,diary] of [[0,1],[1,0]]) {
    await seed(analyses,diary);
    assert.equal(await clear.isEnabled(),!!analyses);
    await page.locator('#library-tab-diary').click();assert.equal(await clear.isEnabled(),!!diary);
    if(analyses)await page.locator('#library-tab-history').click();
    await confirmDelete(true);assert.equal(await clear.isDisabled(),true);
  }

  // Deleting diary entries resets a stale edit, but keeps the saved-result banner.
  await seed(1,1);
  await page.locator('[data-open-analysis="test-0"]').first().click();
  await page.locator('#saved-analysis-banner').waitFor({state:'visible'});
  await page.locator('#view-diary').click();await page.locator('[data-edit-entry="diary-0"]').click();
  await page.locator('#view-analysis').click();await page.locator('#meal-library-toggle').click();
  await page.locator('#library-tab-diary').click();await confirmDelete(true);
  assert.equal(await page.locator('#library-history-count').textContent(),'1');
  await page.locator('#meal-library-close').click();
  assert.equal(await page.locator('#saved-analysis-banner').isVisible(),true);
  await page.locator('#view-diary').click();
  assert.equal(await page.locator('#diary-food').inputValue(),'');
  assert.equal(await page.locator('#diary-save').textContent(),'Add entry');
  await page.locator('#view-analysis').click();await page.locator('#meal-library-toggle').click();
  await page.locator('#library-tab-history').click();await confirmDelete(true);
  await page.locator('#meal-library-close').click();
  assert.equal(await page.locator('#saved-analysis-banner').isVisible(),false);
  await seed(1,0);await page.locator('[data-open-analysis="test-0"]').first().click();
  await page.locator('#saved-analysis-banner').waitFor({state:'visible'});

  // An unreadable diary disables only diary deletion, not analysis deletion.
  await seed(1,1);
  await page.evaluate(()=>localStorage.setItem('nutrilens.diary.v1','{broken'));
  await page.reload();await page.locator('#meal-library-toggle').click();
  await page.waitForFunction(()=>!document.querySelector('#meal-library-error').hidden);
  assert.equal(await clear.isEnabled(),true);await confirmDelete(true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('nutrilens.diary.v1')),'{broken');
  await page.locator('#library-tab-diary').click();assert.equal(await clear.isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('UI passed: tab-specific labels, cancel/confirm, filtered results, independent deletion, unchanged other list, date totals, empty lists, storage failures, reload persistence, edit reset, saved-result reuse and mobile layout.');

} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
