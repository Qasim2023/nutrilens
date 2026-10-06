import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const app=createAppServer();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!/^(http:\/\/127\.0\.0\.1:|data:)/.test(request.url()))external.push(request.url());});
  await page.goto('http://127.0.0.1:'+app.address().port);
  await page.evaluate(async()=>{
    const {createEntry,localDay,saveDiary}=await import('/src/diary-store.js');
    const {normalize}=await import('/src/ai.js');
    const {saveSettings,loadSettings}=await import('/src/store.js');
    saveSettings({...loadSettings(),language:'en',theme:'light',provider:'custom',baseUrl:'https://example.test/v1',model:'fixture',auth:'none',demoMode:false});
    const meal=(name,key)=>normalize({dish:name,confidence:.9,items:[{name,visual_food:key,calories:95}],total:{calories:95,protein_g:1,carbs_g:25,fat_g:.3}});
    saveDiary([createEntry({date:localDay(),meal:'snack',name:'banana',calories:95,source:'ai',analysis:meal('banana','banana')},{id:'banana'}),createEntry({date:localDay(),meal:'snack',name:'apple',calories:95,source:'ai',analysis:meal('apple','apple')},{id:'apple'}),createEntry({date:localDay(),meal:'other',calories:200},{id:'calories'})]);
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f8e9df';ctx.fillRect(0,0,64,64);ctx.fillStyle='#e96b52';ctx.beginPath();ctx.arc(32,35,20,0,Math.PI*2);ctx.fill();ctx.fillStyle='#698f4c';ctx.fillRect(30,7,4,12);
    const image=canvas.toDataURL('image/png');
    const {createHistoryRepository}=await import('/src/history-store.js');const history=createHistoryRepository();
    await history.put({version:2,id:'photo-result',when:Date.now(),result:meal('Photo apple','apple'),thumb:image,input:{image:{dataUrl:image,name:'apple.png'}},view:{imageUrl:image}});await history.close();
  });
  await page.reload();await page.locator('#view-diary').click();
  for(const id of ['banana','apple']) {
    const image=page.locator('[data-diary-entry="'+id+'"] > .diary-entry-image');
    await image.waitFor({state:'visible'});
    assert.match(await image.getAttribute('src'),/^data:image\/svg/);
    await image.evaluate(img=>img.decode());assert.equal(await image.evaluate(img=>img.naturalWidth>0),true);
    assert.match(await image.getAttribute('alt'),new RegExp(id));
  }
  assert.equal(await page.locator('[data-diary-entry="calories"] > .diary-entry-placeholder').count(),1);
  await page.locator('#view-analysis').click();await page.locator('#meal-library-toggle').click();
  await page.locator('[data-open-analysis="photo-result"]').first().click();
  await page.locator('#result [data-action="log-diary"]').click();await page.locator('#diary-save').click();
  const photoRow=page.locator('[data-diary-entry]').filter({has:page.locator('strong').getByText('Photo apple',{exact:true})});
  await photoRow.waitFor();
  assert.match(await photoRow.locator('> .diary-entry-image').getAttribute('src'),/^data:image\/jpeg/);
  await page.reload();await page.locator('#view-diary').click();
  await photoRow.locator('> .diary-entry-image').evaluate(img=>img.decode());
  assert.match(await photoRow.locator('> .diary-entry-image').getAttribute('alt'),/Analysed food photo/);
  for(const width of [1360,390,320]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const image of await page.locator('[data-diary-entry] > img').all())assert.equal(await image.isVisible(),true);
    if(width!==320)await page.locator('.diary-log-card').screenshot({path:'artifacts/diary-food-images-'+(width===1360?'desktop':'mobile')+'.png'});
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.locator('.diary-log-card').screenshot({path:'artifacts/diary-food-images-dark.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: matching banana/apple illustrations, analysed-photo logging and reload, calorie-only fallback, desktop/mobile layouts, and no external image requests or browser errors.');
} finally {await browser?.close();await new Promise(resolve=>app.close(resolve));}
