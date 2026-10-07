// Provider-key authenticated forwarding, NOT a general-purpose public URL proxy.
// Origin checks are CSRF protection, not identity authentication. The upstream
// authenticates each visitor's key. Add edge/WAF limits for public deployments.
import {createHash} from 'node:crypto';
import {HOSTED_ROUTES, WIKIVIBE_BASE_URL} from '../src/hosted-provider.js';
export const MAX_HOSTED_REQUEST_BYTES = 4 * 1024 * 1024;
export const MAX_HOSTED_RESPONSE_BYTES = 4 * 1024 * 1024;

class RelayError extends Error {
  constructor(status, message) {super(message);this.status=status;}
}
function send(res, status, message, extra={}) {
  for (const [name,value] of Object.entries(extra)) res.setHeader(name,value);
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({error:{message}}));
}
function sameOrigin(req) {
  const host=req.headers.host, origin=req.headers.origin, site=req.headers['sec-fetch-site'];
  if (typeof host!=='string'||typeof origin!=='string'||(site&&site!=='same-origin')) return false;
  try {
    const url=new URL(origin);
    return url.origin===origin&&url.host===host&&(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)));
  } catch {return false;}
}
async function readEnvelope(req) {
  if (Number(req.headers['content-length'])>MAX_HOSTED_REQUEST_BYTES) throw new RelayError(413,'Photo/request exceeds the 4 MB hosted relay limit. Enable photo compression or reduce attachments.');
  let text;
  if (req.body!==undefined) {
    text=Buffer.isBuffer(req.body)?req.body.toString('utf8'):typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if (typeof text!=='string'||Buffer.byteLength(text)>MAX_HOSTED_REQUEST_BYTES) throw new RelayError(413,'Photo/request exceeds the 4 MB hosted relay limit. Enable photo compression or reduce attachments.');
  } else {
    const chunks=[];let size=0;
    for await(const chunk of req.iterator({destroyOnReturn:false})) {
      size+=chunk.length;
      if(size>MAX_HOSTED_REQUEST_BYTES){req.resume();throw new RelayError(413,'Photo/request exceeds the 4 MB hosted relay limit. Enable photo compression or reduce attachments.');}
      chunks.push(chunk);
    }
    text=Buffer.concat(chunks).toString('utf8');
  }
  try {return JSON.parse(text);} catch {throw new RelayError(400,'Invalid relay JSON.');}
}
function validateEnvelope(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['path','method','body'].includes(key))) throw new RelayError(400,'Invalid relay request. URLs and custom provider headers cannot be forwarded.');
  if(typeof value.path!=='string'||!Object.hasOwn(HOSTED_ROUTES,value.path)) throw new RelayError(403,'This relay only supports approved provider routes.');
  const method=HOSTED_ROUTES[value.path];
  if(value.method!==method) throw new RelayError(400,'Unsupported provider method.');
  if(method==='GET') {
    if(value.body!==undefined) throw new RelayError(400,'Model discovery must not contain a request body.');
    return value;
  }
  const body=value.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.model!=='string'||!body.model.trim()||body.model.length>256) throw new RelayError(400,'Choose a model and send a valid completion object.');
  const responses=value.path==='/v1/responses';
  const allowed=responses?['model','stream','input','max_output_tokens','text','store','temperature']:['model','stream','messages','max_tokens','max_completion_tokens','temperature','response_format','store'];
  if(Object.keys(body).some(key=>!allowed.includes(key))) throw new RelayError(400,'Unsupported completion parameter.');
  const messages=responses?body.input:body.messages;
  if(!Array.isArray(messages)||!messages.length||messages.length>64||messages.some(message=>!message||typeof message!=='object'||!['system','developer','user','assistant'].includes(message.role)||!(typeof message.content==='string'||Array.isArray(message.content)))) throw new RelayError(400,'Invalid completion messages.');
  if(body.stream!==undefined&&body.stream!==false) throw new RelayError(400,'The hosted relay uses non-streaming completions.');
  for(const key of ['max_tokens','max_completion_tokens','max_output_tokens']) {
    if(body[key]!==undefined&&(!Number.isInteger(body[key])||body[key]<1||body[key]>32000)) throw new RelayError(400,'Token limits must be integers from 1 to 32000.');
  }
  // Do not opt visitors into provider-side response storage.
  return {...value,body:{...body,stream:false,...(responses||body.store!==undefined?{store:false}:{})}};
}
async function readResponse(upstream, limit) {
  if(Number(upstream.headers.get('content-length'))>limit){await upstream.body?.cancel();throw new RelayError(502,'Provider response exceeds the hosted relay limit.');}
  if(!upstream.body) return '';
  const reader=upstream.body.getReader(),decoder=new TextDecoder(),chunks=[];let size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RelayError(502,'Provider response exceeds the hosted relay limit.');}chunks.push(decoder.decode(value,{stream:true}));}
    chunks.push(decoder.decode());return chunks.join('');
  } finally {reader.releaseLock();}
}
export function createHostedRelay({fetchImpl=globalThis.fetch,now=Date.now,perKeyLimit=30,instanceLimit=120,concurrentLimit=4,timeoutMs=50000}={}) {
  // Best-effort per-instance limits; they are NOT distributed across Vercel replicas.
  let windowStart=now(),requests=0,active=0;const buckets=new Map();
  return async function hostedRelay(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    if(req.method!=='POST')return send(res,405,'Use a same-origin POST request.',{Allow:'POST'});
    if(!sameOrigin(req)||req.headers['x-nutrilens-relay']!=='hosted-v1'||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))return send(res,403,'The hosted relay accepts only same-origin NutriLens JSON requests.');
    const authorization=req.headers.authorization;
    const match=typeof authorization==='string'&&/^Bearer ([A-Za-z0-9._~+/=-]{8,512})$/i.exec(authorization);
    if(!match)return send(res,401,'Enter your own valid provider API key. No shared API key is configured.');
    const apiKey=match[1];
    if(now()-windowStart>=60000){windowStart=now();requests=0;buckets.clear();}
    const bucket=createHash('sha256').update(apiKey).digest('base64url');
    if(requests>=instanceLimit||(buckets.get(bucket)||0)>=perKeyLimit)return send(res,429,'Relay request limit reached. Wait one minute.',{'Retry-After':'60'});
    if(active>=concurrentLimit)return send(res,429,'The relay is busy. Try again shortly.',{'Retry-After':'5'});
    requests++;buckets.set(bucket,(buckets.get(bucket)||0)+1);active++;
    const abort=new AbortController(),timeout=AbortSignal.timeout(timeoutMs);
    const signal=AbortSignal.any([abort.signal,timeout]);
    const onClose=()=>{if(!res.writableEnded)abort.abort();};res.on('close',onClose);
    try {
      const envelope=validateEnvelope(await readEnvelope(req));
      const target=new URL(WIKIVIBE_BASE_URL);target.pathname=envelope.path;
      // Only this fixed host and the client's Bearer key are forwarded. No cookies,
      // arbitrary URLs, custom headers, request logs, shared secrets or redirects.
      const upstream=await fetchImpl(target.toString(),{method:envelope.method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:envelope.method==='POST'?JSON.stringify(envelope.body):undefined,redirect:'error',credentials:'omit',signal});
      if(upstream.status>=300&&upstream.status<400)throw new RelayError(502,'Provider redirects are not permitted.');
      const contentType=upstream.headers.get('content-type')||'';
      if(!/application\/json|text\/event-stream/i.test(contentType))throw new RelayError(502,'Provider returned a non-API response.');
      const text=(await readResponse(upstream,MAX_HOSTED_RESPONSE_BYTES)).replaceAll(apiKey,'[redacted]');
      if(!text.trim())throw new RelayError(502,'Provider returned an empty response.');
      res.statusCode=upstream.status;res.setHeader('Content-Type',/text\/event-stream/i.test(contentType)?'text/event-stream':'application/json');res.end(text);
    } catch(error) {
      const timedOut=timeout.aborted||error.name==='TimeoutError';
      if(!res.destroyed&&!res.writableEnded)send(res,error instanceof RelayError?error.status:timedOut?504:502,error instanceof RelayError?error.message:timedOut?'Provider timed out. Try a faster model or smaller photo.':'The relay could not reach the provider. Check provider availability and try again.');
    } finally {abort.abort();active--;res.off('close',onClose);}
  };
}
