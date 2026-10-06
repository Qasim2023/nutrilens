// Isolated browser profile and synthetic AI fixtures; no external image requests.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
const {chromium}=createRequire(import.meta.url)(process.argv[2] || 'playwright');
const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[],external=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!/^(http:\/\/127\.0\.0\.1:|data:)/.test(request.url()))external.push(request.url());});
  const fixtures=[
    {dish:'Boiled eggs',names:['Eggs'],visual:['eggs'],theme:'breakfast',multiple:'false'},
    {dish:'Breakfast plate',names:['Eggs','Toast','Coffee'],visual:['eggs','bread','coffee'],theme:'breakfast',multiple:'true'},
    {dish:'Fresh fruit selection',names:['Apple','Banana','Orange'],visual:['apple','banana','citrus'],theme:'fruit',multiple:'true'},
    {dish:'Chicken with rice and vegetables',names:['Chicken','Rice','Broccoli'],visual:['chicken','rice','vegetables'],theme:'meal',multiple:'true'},
  ];
  let calls=0;
  await page.addInitScript(()=>localStorage.setItem('nutrilens.settings.v1',JSON.stringify({connectionRevision:2,provider:'custom',baseUrl:'https://example.test/v1',model:'mock',auth:'none',transport:'relay'})));
  await page.route('**/api/relay',async route=>{
    const fixture=fixtures[calls++];assert.ok(fixture);
    const result={dish:fixture.dish,summary:'Synthetic nutrition fixture for testing representative food pictures.',confidence:.85,items:fixture.names.map((name,index)=>({name,visual_food:fixture.visual[index],quantity:'1 serving',calories:100,protein_g:10,carbs_g:10,fat_g:4})),total:{calories:100*fixture.names.length},health_score:75};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const image=page.locator('#result .result-thumb');
  for(const fixture of fixtures) {
    await page.locator('#input').fill(fixture.names.join(', '));await page.locator('#send-btn').click();
    await page.waitForFunction(dish=>document.querySelector('#result h2')?.textContent===dish,fixture.dish);
    await page.waitForFunction(()=>document.querySelector('#history-save-status')?.textContent.startsWith('Saved'));
    assert.equal(await image.getAttribute('data-food-theme'),fixture.theme);
    assert.equal(await image.getAttribute('data-food-multiple'),fixture.multiple);
    await image.evaluate(img=>img.decode());
    assert.equal(await image.evaluate(img=>img.naturalWidth),256);
  }
  const originalSrc=await image.getAttribute('src');
  await page.locator('#result .result-head').screenshot({path:'artifacts/food-picture-preview.png'});
  await page.screenshot({path:'artifacts/food-picture-results.png',fullPage:true});
  await page.locator('#meal-library-toggle').click();
  await page.waitForFunction(()=>document.querySelectorAll('.library-select .food-illustration').length===4);
  const thumbnails=page.locator('.library-select .food-illustration');
  await thumbnails.evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  assert.deepEqual(await thumbnails.evaluateAll(images=>images.map(img=>img.naturalWidth)),[256,256,256,256]);
  await page.waitForFunction(()=>Math.abs(document.querySelector('#meal-library').getBoundingClientRect().left)<1);
  await page.screenshot({path:'artifacts/food-picture-library.png',fullPage:true});
  await page.locator('button.library-select[data-open-analysis]').first().click();
  assert.equal(await image.getAttribute('src'),originalSrc);assert.equal(calls,4);
  await page.reload();await page.locator('#meal-library-toggle').click();
  await page.locator('button.library-select[data-open-analysis]').first().click();
  assert.equal(await image.getAttribute('src'),originalSrc);assert.equal(calls,4);
  // Photo priority in the real browser renderer, including decoding an embedded PNG.
  await page.evaluate(async()=>{
    const {normalize}=await import('/src/ai.js');const {renderResult}=await import('/src/render.js');
    const imageUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
    document.querySelector('#result').innerHTML=renderResult(normalize({dish:'Uploaded food',items:[{name:'Eggs',calories:100}]}),{imageUrl});
  });
  assert.equal(await page.locator('#result .food-illustration').count(),0);await image.evaluate(img=>img.decode());
  await page.locator('#meal-library-toggle').click();await page.locator('button.library-select[data-open-analysis]').first().click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await image.evaluate(img=>img.decode());
  await page.screenshot({path:'artifacts/food-picture-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log('PASS: single and contextual multi-food pictures render; saved library and reopened analyses match; uploaded photos take priority; desktop/mobile layout; no extra AI or external image calls.');
} finally {
  await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
}
