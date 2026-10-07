import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import hostedHandler from '../api/wikivibe.js';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import {createHostedRelay,MAX_HOSTED_REQUEST_BYTES,MAX_HOSTED_RESPONSE_BYTES} from '../server/hosted-relay.mjs';
import {WIKIVIBE_BASE_URL,hostedProviderPath,HOSTED_RELAY_PATH} from '../src/hosted-provider.js';
import {effectiveTransport} from '../src/hosting.js';
import {listModels,testConnection,PRESETS} from '../src/ai.js';
const key='synthetic-visitor-key';
const modelRequest={path:'/v1/models',method:'GET'};
const completion={path:'/v1/chat/completions',method:'POST',body:{model:'fixture-vision',stream:false,messages:[{role:'user',content:'One apple'}],max_tokens:4096}};
const headers={host:'example.vercel.app',origin:'https://example.vercel.app','sec-fetch-site':'same-origin','x-nutrilens-relay':'hosted-v1','content-type':'application/json',authorization:`Bearer ${key}`};
function response(){const res=new EventEmitter();res.headers={};res.statusCode=200;res.writableEnded=false;res.destroyed=false;res.setHeader=(key,value)=>res.headers[key.toLowerCase()]=value;res.end=text=>{res.text=text;res.writableEnded=true;};return res;}
async function invoke(handler,{body=modelRequest,method='POST',requestHeaders={}}={}){const req={method,headers:{...headers,...requestHeaders},body},res=response();await handler(req,res);return res;}
const ok=()=>Response.json({data:[{id:'fixture-vision'}]});

test('only the exact public provider routes are approved',()=>{
  assert.equal(Object.hasOwn(PRESETS,'wikivibe'),false);
  assert.equal(hostedProviderPath(WIKIVIBE_BASE_URL+'/models'),'/v1/models');
  for(const url of ['https://api.wikivibe.dev.evil.test/v1/models','http://api.wikivibe.dev/v1/models','https://user:secret@api.wikivibe.dev/v1/models','https://api.wikivibe.dev/v1/models?token=private','https://api.wikivibe.dev/v1/models#private','https://api.wikivibe.dev/admin','http://169.254.169.254/v1/models'])assert.throws(()=>hostedProviderPath(url));
});

test('Vercel automatically relays WikiVibe, retaining direct other-provider and local behavior',()=>{
  const settings={baseUrl:WIKIVIBE_BASE_URL,transport:'relay'};
  assert.equal(effectiveTransport(settings,{hostname:'example.vercel.app'}),'hosted');
  assert.equal(effectiveTransport({...settings,baseUrl:'https://provider.example/v1'},{hostname:'example.vercel.app'}),'direct');
  assert.equal(effectiveTransport(settings,{hostname:'example.netlify.app'}),'direct');
  assert.equal(effectiveTransport(settings,{hostname:'localhost'}),'relay');
  assert.equal(effectiveTransport(settings,{hostname:'vercel.app.evil.test'}),'relay');
});

test('relay requires a visitor key, same-origin POST, JSON and the custom marker before calling provider',async()=>{
  let calls=0;const handler=createHostedRelay({fetchImpl:async()=>{calls++;return ok();}});
  for(const options of [
    {method:'GET'},{method:'OPTIONS'},
    {requestHeaders:{origin:'https://evil.test'}},{requestHeaders:{origin:undefined}},
    {requestHeaders:{origin:'https://example.vercel.app.evil.test'}},
    {requestHeaders:{'sec-fetch-site':'cross-site'}},{requestHeaders:{'x-nutrilens-relay':undefined}},
    {requestHeaders:{'content-type':'text/plain'}},
    {requestHeaders:{authorization:undefined}},{requestHeaders:{authorization:'Bearer short'}},
    {requestHeaders:{authorization:'Bearer synthetic-key\r\nInjected: yes'}},
  ]){assert.ok((await invoke(handler,options)).statusCode>=400);}
  assert.equal(calls,0);
});

test('relay has no arbitrary URL/header/method surface and blocks SSRF before fetching',async()=>{
  let calls=0;const handler=createHostedRelay({fetchImpl:async()=>{calls++;return ok();}});
  for(const body of [null,[],{...modelRequest,url:'http://169.254.169.254/latest/meta-data/'},{...modelRequest,headers:{Host:'evil.test'}},
    {...modelRequest,path:'https://evil.test/v1/models'},{...modelRequest,path:'/v1/models?redirect=evil'},
    {...modelRequest,path:'/v1/../admin'},{...modelRequest,method:'DELETE'},{...modelRequest,method:'POST'},
    {...modelRequest,body:{model:'invalid'}}, {...completion,body:{...completion.body,tools:[]}},
    {...completion,body:{...completion.body,stream:true}}, {...completion,body:{...completion.body,max_tokens:32001}},
    {...completion,body:{...completion.body,messages:[]}},
  ])assert.ok((await invoke(handler,{body})).statusCode>=400);
  assert.equal(calls,0);
});

test('models/completions/responses use only the fixed provider, visitor bearer and approved method',async()=>{
  const forwarded=[];const handler=createHostedRelay({fetchImpl:async(url,options)=>{forwarded.push({url,options});return ok();}});
  assert.equal((await invoke(handler,{requestHeaders:{cookie:'private-cookie','x-private':'not-forwarded'}})).statusCode,200);
  assert.equal((await invoke(handler,{body:completion})).statusCode,200);
  const responses={path:'/v1/responses',method:'POST',body:{model:'fixture',input:[{role:'user',content:'One apple'}],store:true,max_output_tokens:4096}};
  assert.equal((await invoke(handler,{body:responses})).statusCode,200);
  assert.deepEqual(forwarded.map(entry=>entry.url),['https://api.wikivibe.dev/v1/models','https://api.wikivibe.dev/v1/chat/completions','https://api.wikivibe.dev/v1/responses']);
  for(const {options} of forwarded){assert.deepEqual(options.headers,{'Content-Type':'application/json','Authorization':`Bearer ${key}`});assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');}
  assert.equal(forwarded[0].options.body,undefined);
  assert.equal(JSON.parse(forwarded[2].options.body).store,false);
  assert.equal(JSON.parse(forwarded[2].options.body).stream,false);
});

test('all API responses disable caching, redact echoed credentials and never forward cookies/CORS',async()=>{
  const handler=createHostedRelay({fetchImpl:async()=>Response.json({error:{message:'Rejected '+key}},{status:401,headers:{'Set-Cookie':'private=1','Access-Control-Allow-Origin':'*'}})});
  const res=await invoke(handler);assert.equal(res.statusCode,401);assert.ok(!res.text.includes(key));assert.match(res.text,/redacted/);
  for(const name of ['cache-control','cdn-cache-control','vercel-cdn-cache-control'])assert.equal(res.headers[name],'no-store');
  assert.equal(res.headers['set-cookie'],undefined);assert.equal(res.headers['access-control-allow-origin'],undefined);
});

test('parsed Vercel bodies, raw JSON and real IncomingMessage bodies are supported',async()=>{
  let calls=0;const handler=createHostedRelay({fetchImpl:async()=>{calls++;return ok();}});
  assert.equal((await invoke(handler,{body:JSON.stringify(modelRequest)})).statusCode,200);
  assert.equal((await invoke(handler,{body:Buffer.from(JSON.stringify(modelRequest))})).statusCode,200);
  assert.equal((await invoke(handler,{body:'not json'})).statusCode,400);
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const origin=`http://127.0.0.1:${server.address().port}`;const res=await fetch(origin+HOSTED_RELAY_PATH,{method:'POST',headers:{...headers,host:new URL(origin).host,origin},body:JSON.stringify(modelRequest)});assert.equal(res.status,200);assert.deepEqual(await res.json(),{data:[{id:'fixture-vision'}]});}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
  assert.equal(calls,3);
});

test('oversized request bodies are rejected before forwarding',async()=>{
  let calls=0;const handler=createHostedRelay({fetchImpl:async()=>{calls++;return ok();}});
  assert.equal((await invoke(handler,{requestHeaders:{'content-length':String(MAX_HOSTED_REQUEST_BYTES+1)}})).statusCode,413);
  assert.equal((await invoke(handler,{body:'x'.repeat(MAX_HOSTED_REQUEST_BYTES+1)})).statusCode,413);
  assert.equal(calls,0);
});

test('redirects, non-API data, oversized/empty responses and provider failures are bounded and sanitized',async()=>{
  const fixtures=[
    ()=>new Response(null,{status:302,headers:{Location:'http://169.254.169.254/'}}),
    ()=>new Response('<html>'+key+'</html>',{headers:{'Content-Type':'text/html'}}),
    ()=>new Response('x',{headers:{'Content-Type':'application/json','Content-Length':String(MAX_HOSTED_RESPONSE_BYTES+1)}}),
    ()=>new Response('x'.repeat(MAX_HOSTED_RESPONSE_BYTES+1),{headers:{'Content-Type':'application/json'}}),
    ()=>new Response('',{headers:{'Content-Type':'application/json'}}),
    ()=>{throw new Error('Secret debug info '+key);},
  ];
  for(const fixture of fixtures){const res=await invoke(createHostedRelay({fetchImpl:async()=>fixture()}));assert.equal(res.statusCode,502);assert.ok(!res.text.includes(key));}
  const timeout=await invoke(createHostedRelay({fetchImpl:async()=>{throw new DOMException('private','TimeoutError');}}));assert.equal(timeout.statusCode,504);
});

test('per-key/instance limits return 429, expire, and do not prevent another visitor using their key',async()=>{
  let time=0;const handler=createHostedRelay({now:()=>time,perKeyLimit:1,instanceLimit:3,fetchImpl:async()=>ok()});
  assert.equal((await invoke(handler)).statusCode,200);
  const limited=await invoke(handler);assert.equal(limited.statusCode,429);assert.equal(limited.headers['retry-after'],'60');
  assert.equal((await invoke(handler,{requestHeaders:{authorization:'Bearer synthetic-other-key'}})).statusCode,200);
  time=60000;assert.equal((await invoke(handler)).statusCode,200);
  const global=createHostedRelay({instanceLimit:1,fetchImpl:async()=>ok()});await invoke(global);assert.equal((await invoke(global,{requestHeaders:{authorization:'Bearer synthetic-other-key'}})).statusCode,429);
});

test('concurrency limits reject excess work and release capacity after provider failure',async()=>{
  let resolve,started;const ready=new Promise(r=>started=r);const handler=createHostedRelay({concurrentLimit:1,fetchImpl:async()=>{started();return new Promise(r=>resolve=r);}});
  const first=invoke(handler);await ready;assert.equal((await invoke(handler)).statusCode,429);resolve(ok());assert.equal((await first).statusCode,200);
  let attempts=0;const errors=createHostedRelay({concurrentLimit:1,fetchImpl:async()=>{if(++attempts===1)throw new Error('provider unavailable');return ok();}});
  assert.equal((await invoke(errors)).statusCode,502);assert.equal((await invoke(errors)).statusCode,200);
});

test('browser model discovery and connection testing call only same-origin hosted route',async()=>{
  const old={fetch:globalThis.fetch,location:globalThis.location};const requests=[];
  globalThis.location={hostname:'example.vercel.app',protocol:'https:',origin:'https://example.vercel.app'};
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return JSON.parse(options.body).path.endsWith('models')?ok():Response.json({choices:[{message:{content:'ok'}}]});};
  const settings={baseUrl:WIKIVIBE_BASE_URL,provider:'custom',apiKey:key,auth:'bearer',model:'fixture-vision',transport:'direct'};
  try{
    assert.deepEqual(await listModels(settings),['fixture-vision']);await testConnection(settings);
    for(const {url,options}of requests){assert.equal(url,HOSTED_RELAY_PATH);assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,`Bearer ${key}`);assert.ok(!options.body.includes(key));assert.equal(options.credentials,'same-origin');}
    const before=requests.length;
    await assert.rejects(listModels({...settings,apiKey:''}),/provider API key/);
    await assert.rejects(listModels({...settings,extraHeaders:'X-Private: synthetic-private'}),/custom headers/);
    await assert.rejects(listModels({...settings,auth:'none'}),/Bearer authentication/);
    await assert.rejects(listModels({...settings,baseUrl:WIKIVIBE_BASE_URL+'?token=synthetic'}),/without query/);
    assert.equal(requests.length,before);
  }finally{Object.assign(globalThis,old);}
});

test('the function has no key environment fallback, logs or general CORS bypass',async()=>{
  const source=await fs.readFile(new URL('../server/hosted-relay.mjs',import.meta.url),'utf8');
  assert.equal(typeof hostedHandler,'function');
  assert.doesNotMatch(source,/console\.(log|error|warn)|process\.env|Access-Control-Allow-Origin/);
  const config=JSON.parse(await fs.readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.functions['api/wikivibe.js'].maxDuration,60);
  const apiRule=config.headers.find(rule=>rule.source==='/api/wikivibe');
  assert.deepEqual(Object.fromEntries(apiRule.headers.map(({key,value})=>[key,value])),{'Cache-Control':'no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store'});
});


test('relay route and availability errors use provider-neutral wording',async()=>{
  const unavailable=createHostedRelay({fetchImpl:async()=>{throw new Error('Provider unavailable');}});
  const responses=[await invoke(unavailable,{body:{path:'/admin',method:'GET'}}),await invoke(unavailable)];
  assert.equal(responses[0].statusCode,403);assert.equal(responses[1].statusCode,502);
  for(const res of responses)assert.doesNotMatch(JSON.parse(res.text).error.message,/wikivibe|vercel/i);
});
