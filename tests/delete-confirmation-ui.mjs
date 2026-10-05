// Isolated browser profile and synthetic meals only; no API calls or user data.
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
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{errors.push('Unexpected native browser confirmation');dialog.dismiss();});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
    const {createHistoryRepository}=await import('/src/history-store.js');
    const {normalize}=await import('/src/ai.js');
    const {createEntry,localDay,saveDiary}=await import('/src/diary-store.js');
    const history=createHistoryRepository();
    for(const [id,dish] of [['salmon','Grilled salmon bowl'],['unsafe','<img src=x onerror=alert(1)>']])
      await history.put({version:2,id,when:Date.now(),result:normalize({dish,items:[{name:dish,calories:420}],total:{calories:420}})});
    await history.close();
    saveDiary([
      createEntry({name:'Greek yogurt with berries',calories:240,date:localDay(),meal:'breakfast'},{id:'yogurt'}),
      createEntry({name:'Vegetable soup',calories:180,date:localDay(),meal:'lunch'},{id:'soup'}),
      createEntry({name:'Earlier meal',calories:200,date:'2025-01-01',meal:'other'},{id:'old'})
    ]);
  });
  await page.reload();
  const modal=page.locator('#delete-confirmation');
  const cancel=page.locator('[data-delete-cancel]'),confirm=page.locator('[data-delete-confirm]');
  const openLibrary=page.locator('#meal-library-toggle');
  await openLibrary.click();
  await page.locator('[data-remove-analysis="unsafe"]').click();
  await modal.waitFor({state:'visible'});
  assert.equal(await modal.locator('.delete-confirmation-subject strong').textContent(),'<img src=x onerror=alert(1)>');
  assert.equal(await modal.locator('img').count(),0);
  assert.equal(await cancel.evaluate(el=>el===document.activeElement),true);
  // Both tab directions stay in the dialog, not in the library beneath it.
  for(let i=0;i<7;i++){
    await page.keyboard.press('Tab');
    assert.equal(await modal.evaluate(el=>el.contains(document.activeElement)),true);
  }
  for(let i=0;i<7;i++){
    await page.keyboard.press('Shift+Tab');
    assert.equal(await modal.evaluate(el=>el.contains(document.activeElement)),true);
  }
  await page.keyboard.press('Escape');
  await modal.waitFor({state:'detached'});
  assert.equal(await page.locator('#meal-library').isVisible(),true);
  assert.equal(await page.locator('#library-history-count').textContent(),'2');
  assert.equal(await page.locator('[data-remove-analysis="unsafe"]').evaluate(el=>el===document.activeElement),true);
  await page.locator('[data-remove-analysis="unsafe"]').click();await confirm.click();
  await page.waitForFunction(()=>document.querySelector('#library-history-count').textContent==='1');
  assert.equal(await page.locator('#library-diary-count').textContent(),'3');
  assert.equal(await page.locator('#meal-library-close').evaluate(el=>el===document.activeElement),true);

  await page.locator('#meal-library-clear-all').click();await modal.waitFor({state:'visible'});
  await page.screenshot({animations:'disabled',path:'artifacts/delete-confirmation-analysis-desktop.png'});
  // A drag that starts on the card and ends on the backdrop must not cancel it.
  const card=await modal.boundingBox();
  await page.mouse.move(card.x+20,card.y+20);await page.mouse.down();await page.mouse.move(10,10);await page.mouse.up();
  assert.equal(await modal.isVisible(),true);
  await page.mouse.click(10,10);await modal.waitFor({state:'detached'});
  assert.equal(await page.locator('#library-history-count').textContent(),'1');
  await page.locator('#library-tab-diary').click();
  await page.locator('#meal-library-clear-all').click();await modal.waitFor({state:'visible'});
  assert.match(await modal.innerText(),/3 diary entries/);
  assert.match(await modal.innerText(),/every date/);
  await modal.locator('.delete-confirmation-close').click();
  await page.waitForFunction(()=>!document.querySelector('#meal-library-close').disabled);
  await page.locator('#meal-library-close').click();

  await page.locator('#view-diary').click();
  await page.locator('[data-remove-entry="yogurt"]').click();await modal.waitFor({state:'visible'});
  assert.match(await modal.innerText(),/Greek yogurt with berries/);
  assert.match(await modal.innerText(),/240 kcal/);
  await page.keyboard.press('Enter'); // Default action is Cancel, never Delete.
  await modal.waitFor({state:'detached'});
  assert.equal(await page.locator('[data-diary-entry="yogurt"]').count(),1);
  await page.locator('[data-remove-entry="yogurt"]').click();await confirm.click();
  assert.equal(await page.locator('[data-diary-entry="yogurt"]').count(),0);
  assert.equal(await page.locator('#diary-total').textContent(),'180');

  await page.setViewportSize({width:390,height:844});
  await page.locator('#diary-clear').click();await modal.waitFor({state:'visible'});
  await page.screenshot({animations:'disabled',path:'artifacts/delete-confirmation-diary-mobile.png'});
  let bounds=await modal.boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390);
  assert.ok(bounds.y>=0 && bounds.y+bounds.height<=844);
  await cancel.click();assert.equal(await page.locator('#diary-total').textContent(),'180');
  await page.locator('[data-remove-entry="soup"]').click();await modal.waitFor({state:'visible'});
  // Check light theme and RTL at narrow width without touching real settings.
  await page.evaluate(async()=>{
    document.documentElement.dataset.theme='light';
    const {setLanguage}=await import('/src/i18n.js');setLanguage('ur');
  });
  assert.equal(await modal.locator('h2').textContent(),'ڈائری کا کھانا حذف کریں؟');
  assert.equal(await modal.locator('strong').textContent(),'Vegetable soup');
  assert.equal(await cancel.textContent(),'منسوخ کریں');
  bounds=await modal.boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=390);
  await page.screenshot({animations:'disabled',path:'artifacts/delete-confirmation-light-rtl-mobile.png'});
  await cancel.click();
  await page.evaluate(async()=>{const {setLanguage}=await import('/src/i18n.js');setLanguage('en');});
  await page.locator('#diary-clear').click();await confirm.click();
  assert.equal(await page.locator('#diary-total').textContent(),'0');
  await page.locator('#diary-date').fill('2025-01-01');await page.locator('#diary-date').dispatchEvent('change');
  assert.equal(await page.locator('#diary-total').textContent(),'200');
  await page.locator('#view-analysis').click();
  await openLibrary.click();
  await page.waitForFunction(()=>document.querySelector('#library-history-count').textContent==='1');
  assert.equal(await page.locator('#library-history-count').textContent(),'1');
  assert.deepEqual(errors,[]);
  console.log('Confirmation UI passed: single and bulk actions, Cancel/Enter/Escape/close/backdrop, focus trap and restoration, XSS-safe food names, independent data, totals, mobile, light theme and Urdu RTL.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
