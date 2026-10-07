// Real browser, real local CSP, synthetic meals/credentials; no external service.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createAppServer} from '../server.mjs';
import {createEntry} from '../src/diary-store.js';
import {decryptBackup} from '../src/encrypted-backup.js';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,password='synthetic backup passphrase 2026';
const meal=createEntry({name:'Synthetic private breakfast',date:'2026-10-06',meal:'breakfast',calories:150},{id:'security-fixture',now:1});
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[],external=[];
  const watch=page=>{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',req=>{if(!req.url().startsWith(origin)&&!req.url().startsWith('data:')&&!req.url().startsWith('blob:'))external.push(req.url());});
  };
  watch(page);
  await page.addInitScript(()=>{window.securityViolations=[];document.addEventListener('securitypolicyviolation',event=>window.securityViolations.push(event.violatedDirective));});
  await page.goto(origin);
  await page.evaluate(meal=>{
    localStorage.setItem('nutrilens.diary.v1',JSON.stringify({version:1,entries:[meal]}));
    localStorage.setItem('nutrilens.settings.v1',JSON.stringify({connectionRevision:2,apiKey:'synthetic-security-key',extraHeaders:'X-Token: synthetic-security-extra'}));
  },meal);
  await page.reload();
  const credentials=await page.evaluate(()=>({local:localStorage.getItem('nutrilens.settings.v1'),persistent:localStorage.getItem('nutrilens.credentials.v1'),session:sessionStorage.getItem('nutrilens.credentials.v1')}));
  assert.doesNotMatch(credentials.local,/synthetic-security-key|synthetic-security-extra/);assert.match(credentials.persistent,/synthetic-security-key/);assert.equal(credentials.session,null);
  await page.locator('#meal-library-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#library-diary-count').textContent==='1');
  await page.locator('#meal-library-backup-encrypted').click();await page.locator('#backup-password').waitFor();
  assert.equal(await page.locator('#backup-password-input').getAttribute('type'),'password');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#backup-password')&&!document.querySelector('#meal-library-backup-encrypted').disabled);
  await page.locator('#meal-library-backup-encrypted').click();
  await page.locator('#backup-password-input').fill(password);await page.locator('#backup-password-repeat').fill('does not match');
  await page.locator('[data-password-submit]').click();assert.equal(await page.locator('#backup-password').isVisible(),true);
  assert.equal(await page.locator('#backup-password-repeat').evaluate(e=>e.validity.customError),true);
  await page.locator('#backup-password-repeat').fill(password);
  await page.screenshot({path:'artifacts/security-encrypted-backup-desktop.png',fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-password-submit]').click();
  const download=await downloadPromise,text=await fs.readFile(await download.path(),'utf8'),encrypted=JSON.parse(text);
  assert.match(download.suggestedFilename(),/encrypted/);assert.equal(encrypted.format,'nutrilens-encrypted-backup');
  assert.doesNotMatch(text,/Synthetic private breakfast|synthetic-security-key|synthetic-security-extra|synthetic backup passphrase/);
  const plain=await decryptBackup(encrypted,password);assert.equal(plain.diary.entries.length,1);
  const other=await browser.newContext({viewport:{width:390,height:844}}),restored=await other.newPage();watch(restored);
  await restored.goto(origin);await restored.locator('#meal-library-list .library-empty').waitFor({state:'attached'});await restored.locator('#meal-library-toggle').click();await restored.locator('#meal-library').waitFor();
  const file={name:'encrypted-meals.json',mimeType:'application/json',buffer:Buffer.from(text)};
  async function uploadAndUnlock(file,password) {
    await restored.locator('#meal-library-import-file').setInputFiles(file);await restored.locator('#backup-password-input').fill(password);await restored.locator('[data-password-submit]').click();
    await restored.waitForFunction(()=>!document.querySelector('#backup-password')&&!document.querySelector('#meal-library-import').disabled);
  }
  await restored.locator('#meal-library-import-file').setInputFiles(file);
  await restored.locator('#backup-password').waitFor();
  assert.equal(await restored.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await restored.screenshot({path:'artifacts/security-encrypted-backup-mobile.png',fullPage:true});
  await restored.keyboard.press('Escape');await restored.waitForFunction(()=>!document.querySelector('#backup-password')&&!document.querySelector('#meal-library-import').disabled);
  assert.equal(await restored.locator('#library-diary-count').textContent(),'0');
  await uploadAndUnlock(file,'wrong password');
  assert.equal(await restored.locator('#library-diary-count').textContent(),'0');assert.match(await restored.locator('.toasts').textContent(),/Incorrect password/);
  const damaged={...encrypted,ciphertext:(encrypted.ciphertext[0]==='A'?'B':'A')+encrypted.ciphertext.slice(1)};
  await uploadAndUnlock({...file,buffer:Buffer.from(JSON.stringify(damaged))},password);assert.equal(await restored.locator('#library-diary-count').textContent(),'0');
  await uploadAndUnlock(file,password);assert.equal(await restored.locator('#library-diary-count').textContent(),'1');
  await uploadAndUnlock(file,password);assert.equal(await restored.locator('#library-diary-count').textContent(),'1');
  assert.equal(await restored.evaluate(()=>sessionStorage.getItem('nutrilens.credentials.v1')),null);
  assert.equal(await restored.evaluate(()=>localStorage.getItem('nutrilens.diary.v1').includes('Synthetic private breakfast')),true);
  assert.deepEqual(await page.evaluate(()=>window.securityViolations),[]);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.reload();assert.match(await page.evaluate(()=>localStorage.getItem('nutrilens.credentials.v1')),/synthetic-security-key/);
  await page.close();const fresh=await context.newPage();await fresh.goto(origin);assert.match(await fresh.evaluate(()=>localStorage.getItem('nutrilens.credentials.v1')),/synthetic-security-key/);
  console.log('PASS: encrypted download/restore, password confirmation/cancel, wrong password and tamper rejection with no writes, repeat restore, mobile layout, no CSP violations, browser-persistent credentials across reload/close. Synthetic data only.');
} finally {await browser?.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
