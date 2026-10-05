// Synthetic local meals only; no real browser profile or external AI requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2] || 'playwright');
const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
    const {createEntry,localDay,saveDiary}=await import('/src/diary-store.js');
    saveDiary([
      ['high','Grilled salmon bowl',420,.87],['medium','Homemade vegetable curry',380,.56],['low','Mixed takeaway meal',650,.28],['unknown','Older estimated meal',300,null],['zero','Uncertain meal estimate',200,0],['manual','Greek yogurt',240,null]
    ].map(([id,name,calories,confidence])=>createEntry({name,calories,confidence,date:localDay(),meal:'lunch',source:id==='manual'?'manual':'ai'},{id})));
  });
  await page.reload();await page.locator('#view-diary').click();
  const badge=id=>page.locator(`[data-diary-entry="${id}"] .diary-confidence`);
  for(const theme of ['dark','light']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const colors=[];
    for(const level of ['high','medium','low']){
      assert.ok((await badge(level).getAttribute('class')).includes('diary-confidence-'+level));
      colors.push(await badge(level).evaluate(el=>getComputedStyle(el).color));
    }
    assert.equal(new Set(colors).size,3);
    assert.match(await badge('zero').getAttribute('class'),/diary-confidence-low/);
    assert.match(await badge('unknown').getAttribute('class'),/diary-confidence-unavailable/);
    assert.equal(await badge('manual').count(),0);
    // Semantic green/amber/red must not follow the selected brand accent.
    await page.evaluate(()=>document.documentElement.dataset.accent='violet');
    for(const [i,level] of ['high','medium','low'].entries())assert.equal(await badge(level).evaluate(el=>getComputedStyle(el).color),colors[i]);
    await page.locator('.diary-log-card').screenshot({animations:'disabled',path:`artifacts/diary-confidence-colors-${theme}.png`});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.locator('.diary-log-card').screenshot({animations:'disabled',path:'artifacts/diary-confidence-colors-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#view-analysis').click();await page.locator('#meal-library-toggle').click();await page.locator('#library-tab-diary').click();
  for(const level of ['high','medium','low'])assert.match(await page.locator(`[data-choose-diary="${level}"] .diary-confidence`).getAttribute('class'),new RegExp('diary-confidence-'+level));
  await page.reload();await page.locator('#view-diary').click();assert.match(await badge('high').getAttribute('class'),/diary-confidence-high/);
  assert.deepEqual(errors,[]);
  console.log('Confidence colors UI passed: green/amber/red, neutral missing values, 0%, manual entries, accent independence, light/dark, mobile, library and reload.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
