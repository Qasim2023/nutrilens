import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createAppServer} from '../server.mjs';
import {requestJson} from '../src/connection.js';
import {resetSettings} from '../src/store.js';
import {isRelayOriginTrusted, requestRelayOriginTrust, clearRelayOriginTrust} from '../src/relay-trust.js';
import {translate} from '../src/i18n.js';

const TRUST_KEY = 'nutrilens.relay-trust.v1';
const settings = {transport:'relay', auth:'bearer', apiKey:'synthetic-relay-key', extraHeaders:'X-Custom: synthetic-extra'};
const denied = () => Response.json({error:{code:'RELAY_ORIGIN_NOT_ALLOWED', message:'This provider origin needs your approval.'}}, {status:403, headers:{'X-NutriLens-Relay-Error':'origin-not-allowed'}});
function memory() {
  const values = new Map();
  return {getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value)), removeItem:key=>values.delete(key)};
}
function isolate(t) {
  const keys = ['localStorage','sessionStorage','location','confirm','fetch'];
  const descriptors = new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  globalThis.localStorage=memory();globalThis.sessionStorage=memory();
  globalThis.location={hostname:'127.0.0.1',protocol:'http:',origin:'http://127.0.0.1:5173'};
  clearRelayOriginTrust();
  t.after(()=>{
    clearRelayOriginTrust();
    for(const [key,descriptor] of descriptors) {
      if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
    }
  });
}
async function listen(server) {server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function close(server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

test('relay approval shows only the exact origin, persists across reload, and reset clears it',async t=>{
  isolate(t);const prompts=[];globalThis.confirm=message=>{prompts.push(message);return true;};
  assert.equal(requestRelayOriginTrust('https://custom.example:9443/v1/models?token=synthetic-query'),true);
  assert.equal(prompts.length,1);assert.match(prompts[0],/https:\/\/custom\.example:9443/);assert.doesNotMatch(prompts[0],/synthetic-query|synthetic-relay-key/);
  assert.deepEqual(JSON.parse(localStorage.getItem(TRUST_KEY)),['https://custom.example:9443']);
  assert.equal(requestRelayOriginTrust('https://custom.example:9443/v2/responses'),true);assert.equal(prompts.length,1);
  const fresh=await import('../src/relay-trust.js?reload-relay-consent');
  assert.equal(fresh.isRelayOriginTrusted('https://custom.example:9443/v1/models'),true);
  for(const value of ['https://custom.example/v1/models','https://custom.example.evil.test:9443/v1/models','https://another.example:9443/v1/models'])assert.equal(isRelayOriginTrusted(value),false,value);
  resetSettings();assert.equal(localStorage.getItem(TRUST_KEY),null);assert.equal(isRelayOriginTrusted('https://custom.example:9443/v1/models'),false);assert.equal(fresh.isRelayOriginTrusted('https://custom.example:9443/v1/models'),false);
});

test('cancelled, missing, corrupt and invalid approval never grant wildcard access',t=>{
  isolate(t);globalThis.confirm=()=>false;
  assert.equal(requestRelayOriginTrust('https://custom.example/v1/models'),false);assert.equal(localStorage.getItem(TRUST_KEY),null);
  delete globalThis.confirm;assert.equal(requestRelayOriginTrust('https://custom.example/v1/models'),false);
  for(const value of ['*','file:///secret','http://example.test/v1/models','https://user:secret@example.test/v1/models'])assert.throws(()=>requestRelayOriginTrust(value));
  for(const raw of ['not-json','null','{}',JSON.stringify(['*','https://custom.example/path',{},'http://example.test'])]){
    localStorage.setItem(TRUST_KEY,raw);assert.equal(isRelayOriginTrusted('https://custom.example/v1/models'),false);
  }
});

test('blocked browser storage keeps consent in memory and reset removes that fallback',t=>{
  isolate(t);globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('blocked');},removeItem:()=>{throw new Error('blocked');}};
  let prompts=0;globalThis.confirm=()=>{prompts++;return true;};
  assert.equal(requestRelayOriginTrust('https://custom.example/v1/models'),true);
  assert.equal(requestRelayOriginTrust('https://custom.example/v1/chat/completions'),true);assert.equal(prompts,1);
  resetSettings();assert.equal(isRelayOriginTrusted('https://custom.example/v1/models'),false);
});

test('a local origin rejection prompts once and retries only that relay request',async t=>{
  isolate(t);const calls=[],prompts=[];
  globalThis.confirm=message=>{prompts.push(message);return true;};
  globalThis.fetch=async(url,init)=>{
    calls.push({url,init,body:JSON.parse(init.body)});
    return calls.length===1?denied():Response.json({data:[{id:'custom-model'}]});
  };
  const target='https://custom.example/v1/models';
  assert.deepEqual(await requestJson(settings,target,{method:'GET'}),{data:[{id:'custom-model'}]});
  assert.equal(calls.length,2);assert.equal(prompts.length,1);
  assert.equal(calls[0].body.trustedOrigin,undefined);assert.equal(calls[1].body.trustedOrigin,'https://custom.example');
  for(const call of calls){assert.equal(call.url,'/api/relay');assert.equal(call.body.url,target);assert.equal(call.body.method,'GET');assert.equal(call.body.headers.Authorization,'Bearer synthetic-relay-key');assert.equal(call.init.redirect,'error');assert.equal(call.init.credentials,'omit');}
  await requestJson(settings,'https://custom.example/v1/responses',{body:{model:'custom-model'}});
  assert.equal(calls.length,3);assert.equal(prompts.length,1);assert.equal(calls[2].body.trustedOrigin,'https://custom.example');
});

test('declining relay trust sends no provider request and leaves settings unchanged',async t=>{
  isolate(t);let calls=0;globalThis.confirm=()=>false;globalThis.fetch=async()=>{calls++;return denied();};
  await assert.rejects(requestJson(settings,'https://custom.example/v1/models',{method:'GET'}),error=>error.status===403&&error.code==='RELAY_ORIGIN_NOT_ALLOWED');
  assert.equal(calls,1);assert.equal(localStorage.getItem(TRUST_KEY),null);assert.equal(settings.transport,'relay');
});

test('upstream/provider and other local 403 errors cannot trigger relay approvals or retries',async t=>{
  isolate(t);globalThis.confirm=()=>{throw new Error('Unexpected trust prompt');};let calls=0;
  for(const response of [Response.json({error:{code:'RELAY_ORIGIN_NOT_ALLOWED',message:'Provider denied access'}},{status:403}),Response.json({error:{message:'Invalid endpoint route'}},{status:403})]){
    globalThis.fetch=async()=>{calls++;return response;};
    await assert.rejects(requestJson(settings,'https://custom.example/v1/models',{method:'GET'}),error=>error.status===403);
  }
  assert.equal(calls,2);assert.equal(localStorage.getItem(TRUST_KEY),null);
});

test('direct/static requests and pre-aborted calls never ask for relay trust',async t=>{
  isolate(t);globalThis.confirm=()=>{throw new Error('Unexpected trust prompt');};const urls=[];
  globalThis.fetch=async(url)=>{urls.push(url);return Response.json({ok:true});};
  await requestJson({...settings,transport:'direct'},'https://custom.example/v1/models',{method:'GET'});
  globalThis.location={hostname:'example.netlify.app',protocol:'https:'};
  await requestJson(settings,'https://custom.example/v1/models',{method:'GET'});
  assert.deepEqual(urls,['https://custom.example/v1/models','https://custom.example/v1/models']);
  globalThis.location={hostname:'localhost',protocol:'http:'};
  const controller=new AbortController();controller.abort();globalThis.fetch=async()=>denied();
  await assert.rejects(requestJson(settings,'https://custom.example/v1/models',{method:'GET',signal:controller.signal}));
  assert.equal(localStorage.getItem(TRUST_KEY),null);
});

test('local relay trusts only the approved origin and retains origin, route, method, header and redirect protections',async()=>{
  const forwarded=[];
  const provider=http.createServer(async(req,res)=>{
    if(req.url==='/redirect/chat/completions'){res.writeHead(302,{Location:'/v1/models'});res.end();return;}
    let body='';for await(const chunk of req)body+=chunk;
    forwarded.push({path:req.url,headers:req.headers,body});
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'custom-model'}]}));
  });
  const remote=await listen(provider),app=createAppServer({allowedOrigins:[]}),origin=await listen(app);
  const headers={Origin:origin,'Content-Type':'application/json','X-NutriLens-Relay':'1'};
  const envelope={url:remote+'/v1/models',method:'GET',headers:{Authorization:'Bearer synthetic-relay-key'}};
  const send=(body,requestHeaders=headers)=>fetch(origin+'/api/relay',{method:'POST',headers:requestHeaders,body:JSON.stringify(body)});
  try {
    const rejection=await send(envelope);assert.equal(rejection.status,403);assert.equal(rejection.headers.get('X-NutriLens-Relay-Error'),'origin-not-allowed');assert.equal((await rejection.json()).error.code,'RELAY_ORIGIN_NOT_ALLOWED');assert.equal(forwarded.length,0);
    for(const trustedOrigin of ['*','https://other.example',remote+'/v1',true])assert.equal((await send({...envelope,trustedOrigin})).status,403);
    const approved={...envelope,trustedOrigin:remote};
    const models=await send(approved);assert.equal(models.status,200);assert.equal((await models.json()).data[0].id,'custom-model');
    const completion=await send({...approved,url:remote+'/v1/chat/completions',method:'POST',body:{model:'custom-model'}});assert.equal(completion.status,200);await completion.text();
    assert.equal(forwarded.length,2);assert.equal(forwarded[0].headers.authorization,'Bearer synthetic-relay-key');assert.deepEqual(JSON.parse(forwarded[1].body),{model:'custom-model'});
    assert.equal(forwarded[1].headers.trustedorigin,undefined);
    assert.equal((await send(envelope)).status,403,'approval is not a global server allowlist change');
    assert.equal((await send(approved,{...headers,Origin:'https://evil.example'})).status,403);
    assert.equal((await send(approved,{Origin:origin,'Content-Type':'application/json'})).status,403);
    assert.equal((await send({...approved,url:remote+'/admin'})).status,403);
    assert.equal((await send({...approved,method:'DELETE'})).status,400);
    assert.equal((await send({...approved,headers:{'X-Unsafe':'line\nbreak'}})).status,400);
    assert.equal((await send({...approved,url:'http://169.254.169.254/v1/models',trustedOrigin:'http://169.254.169.254'})).status,403);
    assert.equal((await send({...approved,url:'https://user:secret@custom.example/v1/models',trustedOrigin:'https://custom.example'})).status,403);
    assert.equal((await send({...approved,url:remote+'/redirect/chat/completions',method:'POST',body:{model:'custom-model'}})).status,502);
    assert.equal(forwarded.length,2);
  } finally {await close(app);await close(provider);}
});

test('relay consent and settings guidance are translated for every supported non-English language',()=>{
  for(const code of ['nb','pl','de','tl','fr','es','nn','ru','hi','ur']){
    for(const phrase of ['Trust this provider for the local relay?','Your API key and submitted food data will be sent to this provider. Only approve a provider you trust. Reset settings clears this approval.','Custom relay providers require a one-time trust confirmation. Reset settings clears remembered approvals.'])assert.notEqual(translate(phrase,code),phrase,code);
  }
});
