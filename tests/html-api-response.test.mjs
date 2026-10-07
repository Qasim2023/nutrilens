import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJson, complete} from '../src/connection.js';
import {analyzeFood, listModels, testConnection} from '../src/ai.js';
import {translate} from '../src/i18n.js';

const settings={provider:'custom',baseUrl:'https://custom.example/v1',model:'gpt-6-fixture',auth:'bearer',apiKey:'synthetic-html-key',transport:'direct',apiFormat:'auto',jsonMode:true,maxTokens:20000,language:'en'};
const nutrition={dish:'Fixture apple',summary:'Synthetic test only',confidence:.8,items:[{name:'Apple',quantity:'1 apple',grams:100,calories:95}],total:{calories:95,protein_g:.5,carbs_g:25,fat_g:.3},health_score:80};
const html='<!DOCTYPE html><html><head><title>Provider website</title></head><body>synthetic-html-key private-page-text</body></html>';
const chat=text=>({choices:[{message:{content:text}}]});
const responses=text=>({output:[{type:'message',content:[{type:'output_text',text}]}]});
const mockedTests=new WeakSet();
function mockFetch(t,fn){
  if(!mockedTests.has(t)){
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'fetch');
    t.after(()=>Object.defineProperty(globalThis,'fetch',descriptor));mockedTests.add(t);
  }
  globalThis.fetch=fn;
}

test('HTML returned with HTTP 200 is classified without exposing page content, keys or query values',async t=>{
  mockFetch(t,async()=>new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
  await assert.rejects(requestJson(settings,settings.baseUrl+'/chat/completions?token=synthetic-query'),error=>{
    assert.equal(error.code,'API_RESPONSE_HTML');assert.equal(error.status,200);
    assert.match(error.message,/HTML page.*usable API response/);assert.match(error.message,/\/v1\/chat\/completions/);assert.match(error.message,/API base URL.*API format/);
    assert.doesNotMatch(error.message,/synthetic-html-key|private-page-text|synthetic-query|<!DOCTYPE|Unexpected token/i);return true;
  });
});

test('Auto format falls back once when model discovery succeeds but Chat returns an HTML website',async t=>{
  const calls=[],statuses=[];
  mockFetch(t,async(url,init)=>{
    calls.push({url,init,body:init.body?JSON.parse(init.body):null});
    if(url.endsWith('/models'))return Response.json({data:[{id:settings.model}]});
    if(url.endsWith('/chat/completions'))return new Response(html,{headers:{'Content-Type':'text/html'}});
    assert.equal(url,settings.baseUrl+'/responses');
    return Response.json(responses(JSON.stringify(nutrition)));
  });
  assert.deepEqual(await listModels(settings),[settings.model]);
  const result=await analyzeFood({text:'One apple',imageDataUrl:'data:image/jpeg;base64,YWJj',settings,onStatus:status=>statuses.push(status)});
  assert.equal(result.total.calories,95);assert.equal(result.meta.protocol,'responses');assert.equal(calls.length,3);
  assert.deepEqual(statuses,['Analysing your photo…'],'background format changes keep the original analysis status');
  const first=calls[1],last=calls[2];
  assert.equal(first.body.max_completion_tokens,20000);assert.equal(last.body.max_output_tokens,20000);assert.equal(last.body.store,false);assert.equal(last.body.model,settings.model);
  assert.deepEqual(last.body.input[1].content.find(item=>item.type==='input_image'),{type:'input_image',image_url:'data:image/jpeg;base64,YWJj'});
  assert.deepEqual(last.body.input[0],{role:first.body.messages[0].role,content:first.body.messages[0].content});
  assert.equal(first.init.headers.Authorization,'Bearer synthetic-html-key');assert.equal(last.init.headers.Authorization,'Bearer synthetic-html-key');
});

test('connection tests use the same HTML fallback but retain their tiny 256-token request',async t=>{
  const bodies=[];
  mockFetch(t,async(url,init)=>{bodies.push(JSON.parse(init.body));return url.endsWith('/chat/completions')?new Response(html):Response.json(responses('ok'));});
  assert.equal((await testConnection(settings)).protocol,'responses');
  assert.deepEqual(bodies.map(body=>body.max_completion_tokens??body.max_output_tokens),[256,256]);
});

test('both HTML routes fail after exactly two attempts with an actionable error, never a fake result',async t=>{
  const urls=[];mockFetch(t,async url=>{urls.push(url);return new Response(html,{headers:{'Content-Type':'text/html'}});});
  await assert.rejects(analyzeFood({text:'One apple',settings}),error=>{
    assert.equal(error.code,'API_RESPONSE_HTML');assert.match(error.message,/\/responses/);assert.match(error.message,/API base URL.*API format/);assert.doesNotMatch(error.message,/Unexpected token|private-page-text/);return true;
  });
  assert.deepEqual(urls,[settings.baseUrl+'/chat/completions',settings.baseUrl+'/responses']);
});

test('explicit Chat and Responses formats do not silently switch after HTML',async t=>{
  const urls=[];mockFetch(t,async url=>{urls.push(url);return new Response(html);});
  for(const apiFormat of ['chat','responses'])await assert.rejects(complete({...settings,apiFormat},[{role:'user',content:'test'}]),error=>error.code==='API_RESPONSE_HTML');
  assert.deepEqual(urls,[settings.baseUrl+'/chat/completions',settings.baseUrl+'/responses']);
});

test('successful Chat JSON remains a single request even with a mislabelled HTML Content-Type',async t=>{
  let calls=0;mockFetch(t,async()=>{calls++;return new Response(JSON.stringify(chat('ok')),{headers:{'Content-Type':'text/html'}});});
  assert.equal((await complete(settings,[{role:'user',content:'test'}])).text,'ok');assert.equal(calls,1);
});

test('malformed JSON, empty responses and truncated model replies are not treated as route mismatches',async t=>{
  for(const response of [()=>new Response('{invalid-json'),()=>new Response(''),()=>Response.json({...chat('partial'),choices:[{message:{content:'partial'},finish_reason:'length'}]})]){
    let calls=0;mockFetch(t,async()=>{calls++;return response();});
    await assert.rejects(complete(settings,[{role:'user',content:'test'}]));assert.equal(calls,1);
  }
});

test('HTML on model discovery never falls back to a completion or invents model IDs',async t=>{
  const urls=[];mockFetch(t,async url=>{urls.push(url);return new Response(html);});
  await assert.rejects(listModels(settings),error=>error.code==='API_RESPONSE_HTML');assert.deepEqual(urls,[settings.baseUrl+'/models']);
});

test('authentication, quota and server errors do not switch formats even with misleading hints',async t=>{
  for(const status of [401,403,429,500,502,503]){
    let calls=0;mockFetch(t,async()=>{calls++;return Response.json({error:{code:'API_RESPONSE_HTML',message:'Use responses API only'}},{status});});
    await assert.rejects(complete(settings,[{role:'user',content:'test'}]),error=>error.status===status);assert.equal(calls,1,String(status));
  }
});

test('a Responses-only provider can request streaming after the HTML fallback',async t=>{
  const calls=[];
  mockFetch(t,async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({url,body});
    if(url.endsWith('/chat/completions'))return new Response(html);
    if(!body.stream)return Response.json({error:{message:'stream must be true'}},{status:400});
    const data=JSON.stringify({type:'response.completed',response:responses('ok')});
    return new Response('event: response.completed\ndata: '+data+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
  });
  const result=await complete(settings,[{role:'user',content:'test'}]);assert.equal(result.protocol,'responses');assert.equal(result.text,'ok');assert.equal(calls.length,3);assert.equal(calls[2].body.max_output_tokens,20000);
});


test('description status stays unchanged through request compatibility retries and nutrition repair in every tested language',async t=>{
  for(const language of ['en','nb','ur']){
    const statuses=[];let calls=0,answers=0;
    mockFetch(t,async(_url,init)=>{
      calls++;const body=JSON.parse(init.body);
      if(body.response_format)return Response.json({error:{message:'response_format unsupported'}},{status:400});
      if(body.temperature!==undefined)return Response.json({error:{message:'temperature unsupported'}},{status:400});
      answers++;return Response.json(chat(JSON.stringify(answers===1?{incomplete:true}:nutrition)));
    });
    const result=await analyzeFood({text:'One apple',settings:{...settings,model:'fixture',language},onStatus:status=>statuses.push(status)});
    assert.equal(result.total.calories,95);assert.equal(calls,6);
    assert.deepEqual(statuses,[translate('Analysing your description…',language)]);
  }
});
