import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createAppServer} from '../server.mjs';
import {securityHeaders,validateEndpoint} from '../src/security-policy.js';
import {requestJson,buildHeaders} from '../src/connection.js';
import {encryptBackup,decryptBackup} from '../src/encrypted-backup.js';

const backup = {format:'nutrilens-personal-backup',version:1,history:{format:'nutrilens-history',version:2,analyses:[]},diary:{version:1,entries:[]},privateMarker:'synthetic meal note'};
const password = 'correct horse battery staple test';
const memory = () => { const items=new Map(); return {getItem:key=>items.get(key)??null,setItem:(key,value)=>items.set(key,String(value)),removeItem:key=>items.delete(key)}; };
async function listen(server) { server.listen(0,'127.0.0.1'); await once(server,'listening'); return 'http://127.0.0.1:'+server.address().port; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }

test('encrypted backups round-trip without plaintext; each uses fresh salt and IV',async()=>{
  const a=await encryptBackup(backup,password),b=await encryptBackup(backup,password);
  assert.equal(a.cipher,'AES-256-GCM');assert.equal(a.iterations,600000);
  assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);
  assert.doesNotMatch(JSON.stringify(a),/synthetic meal note|correct horse/);
  assert.deepEqual(await decryptBackup(a,password),backup);
});
test('wrong passwords, tampering and unsupported parameters fail before any restore',async()=>{
  const encrypted=await encryptBackup(backup,password);
  await assert.rejects(decryptBackup(encrypted,'different passphrase'),/Incorrect password/);
  const tampered={...encrypted,ciphertext:(encrypted.ciphertext[0]==='A'?'B':'A')+encrypted.ciphertext.slice(1)};
  await assert.rejects(decryptBackup(tampered,password),/Incorrect password|damaged/);
  for(const patch of [{iterations:1},{iterations:999999999},{cipher:'AES-CBC'},{version:2},{kdf:'none'}])await assert.rejects(decryptBackup({...encrypted,...patch},password),/Unsupported/);
  for(const patch of [{iv:'AAAA'},{salt:'AAAA'},{ciphertext:'not base64'},{iv:null}])await assert.rejects(decryptBackup({...encrypted,...patch},password),/Invalid/);
  await assert.rejects(encryptBackup(backup,'short'),/at least 12/);
});
test('base64 validation works on realistic photo-sized backup files',async()=>{
  const large={...backup,photo:'x'.repeat(1024*1024)};
  assert.deepEqual(await decryptBackup(await encryptBackup(large,password),password),large);
});
test('API keys/custom headers persist in browser storage and reset clears credentials',async()=>{
  const oldLocal=globalThis.localStorage,oldSession=globalThis.sessionStorage;
  globalThis.localStorage=memory();globalThis.sessionStorage=memory();
  const {loadSettings,saveSettings,resetSettings,defaults}=await import('../src/store.js');
  try {
    localStorage.setItem('nutrilens.settings.v1',JSON.stringify({...defaults,apiKey:'synthetic-secret',extraHeaders:'X-Token: synthetic-extra',model:'chosen-model'}));
    const settings=loadSettings();assert.equal(settings.apiKey,'synthetic-secret');
    assert.doesNotMatch(localStorage.getItem('nutrilens.settings.v1'),/synthetic-secret|synthetic-extra|apiKey|extraHeaders/);
    assert.equal(JSON.parse(localStorage.getItem('nutrilens.credentials.v1')).apiKey,'synthetic-secret');assert.equal(sessionStorage.getItem('nutrilens.credentials.v1'),null);
    saveSettings({...settings,theme:'light',baseUrl:'https://provider.example/v1',model:'chosen-model'});
    const reloaded=loadSettings();assert.equal(reloaded.apiKey,'synthetic-secret');assert.equal(reloaded.baseUrl,'https://provider.example/v1');assert.equal(reloaded.model,'chosen-model');
    localStorage.removeItem('nutrilens.credentials.v1');
    // A new module instance models a new tab without the in-memory fallback.
    const fresh=await import('../src/store.js?fresh-tab-security-test');assert.equal(fresh.loadSettings().apiKey,'');
    assert.equal(fresh.loadSettings().model,'chosen-model');
    resetSettings();const reset=loadSettings();assert.equal(reset.apiKey,'');assert.equal(reset.baseUrl,'');assert.equal(reset.model,'');assert.equal(localStorage.getItem('nutrilens.credentials.v1'),null);assert.equal(sessionStorage.getItem('nutrilens.credentials.v1'),null);
  } finally {globalThis.localStorage=oldLocal;globalThis.sessionStorage=oldSession;}
});
test('plaintext remote endpoints, URL credentials and unsafe headers are rejected',()=>{
  for(const url of ['http://example.test/v1/models','http://169.254.169.254/v1/models','https://user:secret@example.test/v1/models','file:///etc/passwd','https://example.test/#secret'])assert.throws(()=>validateEndpoint(url));
  assert.equal(validateEndpoint('http://127.0.0.1:11434/v1/models').protocol,'http:');
  assert.throws(()=>validateEndpoint('http://localhost:11434/v1/models',{hosted:true}),/HTTPS/);
  assert.throws(()=>createAppServer({allowedOrigins:['http://example.test']}),/HTTPS/);
  for(const extraHeaders of ['Cookie: secret','Host: evil.test','X-Token: safe\runsafe','X-Token: safe\u0000unsafe'])assert.throws(()=>buildHeaders({extraHeaders}),/unsafe/);
});
test('direct requests do not follow redirects, send ambient cookies or leak referrers',async()=>{
  const oldFetch=globalThis.fetch;let options;
  globalThis.fetch=async(url,opts)=>{options=opts;return Response.json({ok:true});};
  try {
    await requestJson({transport:'direct',auth:'bearer',apiKey:'synthetic-key'},'https://example.test/v1/models',{method:'GET'});
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.cache,'no-store');
    globalThis.fetch=async()=>new Response('{}',{headers:{'content-length':String(25*1024*1024)}});
    await assert.rejects(requestJson({transport:'direct'},'https://example.test/v1/models'),/too large/);
    globalThis.fetch=async()=>new Response(new Uint8Array(25*1024*1024));
    await assert.rejects(requestJson({transport:'direct'},'https://example.test/v1/models'),/too large/);
  } finally {globalThis.fetch=oldFetch;}
});
test('security headers apply to local success and error responses, HTTPS policy has HSTS',async()=>{
  const server=createAppServer(),origin=await listen(server);
  try {
    for(const route of ['/','/src/app.js','/.env','/server.mjs','/src/%ZZ.js']) {
      const res=await fetch(origin+route);
      assert.equal(res.headers.get('x-frame-options'),'DENY');assert.equal(res.headers.get('cross-origin-resource-policy'),'same-origin');
      assert.match(res.headers.get('content-security-policy'),/script-src 'self'/);assert.match(res.headers.get('content-security-policy'),/script-src-attr 'none'/);
      assert.equal(res.headers.get('strict-transport-security'),null);await res.arrayBuffer();
    }
    assert.equal((await fetch(origin+'/src/%ZZ.js')).status,400);
    assert.equal((await fetch(origin+'/api/health',{method:'POST'})).status,405);
    assert.equal((await fetch(origin+'/api/health',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
    const invalidHostStatus=await new Promise((resolve,reject)=>{
      const req=http.get(origin+'/api/health',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);
    });
    assert.equal(invalidHostStatus,403);
    assert.match(securityHeaders()['Strict-Transport-Security'],/31536000/);
    assert.equal(server.requestTimeout,30000);assert.equal(server.headersTimeout,15000);assert.equal(server.maxHeadersCount,64);
  } finally {await close(server);}
});
test('rate limit returns a retry hint instead of doing more work',async()=>{
  const server=createAppServer({maxRequestsPerMinute:2}),origin=await listen(server);
  try {
    for(let i=0;i<2;i++)assert.equal((await fetch(origin+'/api/health')).status,200);
    const res=await fetch(origin+'/api/health');assert.equal(res.status,429);assert.ok(Number(res.headers.get('retry-after'))>0);
  } finally {await close(server);}
});
test('relay rejects invalid envelopes and oversized bodies before fetching a provider',async()=>{
  const server=createAppServer(),origin=await listen(server),headers={Origin:origin,'Content-Type':'application/json','X-NutriLens-Relay':'1'};
  try {
    for(const body of ['null','[]','{}','{"url":true}','{"url":"https://api.openai.com/v1/models","headers":[]}','{broken'])assert.equal((await fetch(origin+'/api/relay',{method:'POST',headers,body})).status,400);
    assert.equal((await fetch(origin+'/api/relay',{method:'POST',headers:{...headers,'Content-Type':'application/jsonp'},body:'{}'})).status,403);
    assert.equal((await fetch(origin+'/api/relay',{method:'POST',headers,body:'x'.repeat(18*1024*1024+1)})).status,413);
  } finally {await close(server);}
});
test('relay limits concurrent work and releases slots when a response completes',async()=>{
  let release,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const upstream=http.createServer(async(req,res)=>{started();await new Promise(resolve=>{release=resolve;});res.end('{}');});
  const remote=await listen(upstream),server=createAppServer({allowedOrigins:[remote],maxConcurrentRequests:1}),origin=await listen(server);
  const request=()=>fetch(origin+'/api/relay',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-NutriLens-Relay':'1'},body:JSON.stringify({url:remote+'/v1/models',method:'GET'})});
  try {
    const pending=request();await ready;
    assert.equal((await fetch(origin+'/api/health')).status,429);
    release();const res=await pending;assert.equal(res.status,200);await res.text();
    assert.equal((await fetch(origin+'/api/health')).status,200);
  } finally {release?.();await close(server);await close(upstream);}
});

test('SQL-looking and HTML-looking meal text stays data, and rendering escapes executable markup',async()=>{
  const {createEntry,saveDiary,loadDiary}=await import('../src/diary-store.js');
  const {normalize}=await import('../src/ai.js');const {renderResult}=await import('../src/render.js');
  const storage=memory(),name="Lunch'); DROP TABLE meals; -- <script>alert(1)</script>";
  const entry=createEntry({name,date:'2026-10-06',meal:'lunch',calories:150},{id:'hostile-text-fixture',now:1});
  saveDiary([entry],storage);assert.equal(loadDiary(storage)[0].name,name);
  const result=normalize({dish:name,summary:'<img src=x onerror=alert(1)>',items:[{name:'<script>alert(1)</script>',calories:150}],total:{calories:150}});
  const html=renderResult(result);assert.doesNotMatch(html,/<script>|<img src=x onerror=/i);assert.match(html,/&lt;script&gt;/);assert.match(html,/DROP TABLE meals/);
});
