import { effectiveTransport, isStaticHosting } from "./hosting.js";
import {HOSTED_RELAY_PATH, hostedProviderPath, HOSTED_ROUTES} from './hosted-provider.js';
import {validateEndpoint, validateHeader} from "./security-policy.js";
import {normalizeMaxTokens} from "./output-tokens.js";

// URL handling and transport shared by connection tests, model discovery and analysis.
// Fresh installs have no provider endpoint or account-specific configuration.
export const CUSTOM_ENDPOINT = "";

export function endpointUrl(baseUrl, provider, mode = "auto", protocol = "chat") {
  let url;
  try { url = new URL(String(baseUrl || "").trim()); }
  catch { throw new Error("Enter an HTTP(S) API URL, including https://."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP(S) URL without embedded credentials; put your key in the API key field.");
  }
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");
  const full = /\/(chat\/completions|responses)$/.test(path);
  if (mode === "full" && !full) throw new Error("Full URL must end in /chat/completions or /responses.");
  if (full && protocol === "auto") return url.toString();
  const base = full ? path.replace(/\/(chat\/completions|responses)$/, "") : path;
  url.pathname = `${base}/${protocol === "responses" ? "responses" : "chat/completions"}`;
  if (provider === "azure" && !url.searchParams.has("api-version")) url.searchParams.set("api-version", "2024-06-01");
  return url.toString();
}

export function modelsUrl(settings) {
  const url = new URL(endpointUrl(settings.baseUrl, settings.provider, "auto", "auto"));
  url.pathname = url.pathname.replace(/\/(chat\/completions|responses)$/, "/models");
  return url.toString();
}

export function buildHeaders(settings) {
  const headers = { "Content-Type": "application/json" };
  const key = String(settings.apiKey || "").trim().replace(/^Bearer\s+/i, "");
  if (settings.auth === "bearer" && key) headers.Authorization = `Bearer ${key}`;
  else if (["api-key", "header"].includes(settings.auth) && key) headers[settings.keyHeader || "api-key"] = key;
  for (const line of String(settings.extraHeaders || "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (settings.provider === "openrouter") {
    headers["HTTP-Referer"] = typeof location !== "undefined" ? location.origin : "http://localhost";
    headers["X-Title"] = "NutriLens";
  }
  for (const [name, value] of Object.entries(headers)) validateHeader(name, value);
  return headers;
}

export function redact(text, settings) {
  let safe = String(text || "");
  for (const value of Object.values(buildHeaders(settings))) {
    if (value.length > 8 && value !== "application/json" && !value.startsWith("http")) safe = safe.split(value).join("[redacted]");
  }
  const key = String(settings.apiKey || "").trim().replace(/^Bearer\s+/i, "");
  if (key) safe = safe.split(key).join("[redacted]");
  return safe.slice(0, 1200);
}

export function responseText(json) {
  if (json?.error) throw new Error(typeof json.error === "string" ? json.error : json.error.message || "Provider error");
  if (json?.status === "failed") throw new Error("The provider marked this response as failed.");
  if (json?.status === "incomplete" || json?.choices?.[0]?.finish_reason === "length") {
    throw new Error("The response was cut off. Increase Max output tokens in Settings, then retry.");
  }
  const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? json?.output_text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(p => p.text || "").join("");
  return (json?.output || []).flatMap(p => p.content || []).map(p => p.text || "").join("");
}

export function parseEventStream(text) {
  let chat = "", response = "", final;
  for (const block of text.replace(/\r\n/g, "\n").split(/\n\n/)) {
    const payload = block.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trimStart()).join("\n");
    if (!payload || payload === "[DONE]") continue;
    let event;
    try { event = JSON.parse(payload); } catch { continue; }
    if (event.error || /response\.(failed|incomplete)|^error$/.test(event.type || "")) throw new Error(event.error?.message || event.response?.error?.message || "Stream failed or was cut off.");
    if (event.choices?.[0]?.finish_reason === "length") throw new Error("Response was cut off. Increase Max output tokens in Settings.");
    chat += event.choices?.[0]?.delta?.content || "";
    if (event.type === "response.output_text.delta") response += event.delta || "";
    if (event.type === "response.completed") final = event.response;
  }
  if (final) return final;
  if (!chat && !response) throw new Error("The stream contained no output text.");
  return { output_text: response || chat };
}

export async function requestJson(settings, url, { method = "POST", body, signal } = {}) {
  validateEndpoint(url, {hosted:globalThis.location?.protocol === 'https:'});
  const timeout = AbortSignal.timeout(120000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const transport = effectiveTransport(settings);
  const useRelay = transport === 'relay' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  let hostedRequest;
  if (transport === 'hosted') {
    const path = hostedProviderPath(url);
    if (HOSTED_ROUTES[path] !== method) throw new Error('Unsupported hosted provider method.');
    if (settings.auth !== 'bearer') throw new Error('The hosted relay requires Bearer authentication with your own API key.');
    if (String(settings.extraHeaders || '').trim()) throw new Error('The hosted relay does not forward custom headers. Clear Extra headers in Settings.');
    const key = String(settings.apiKey || '').trim().replace(/^Bearer\s+/i, '');
    if (!key) throw new Error('Enter your provider API key in Settings. No shared key is configured.');
    validateHeader('Authorization', 'Bearer ' + key);
    hostedRequest = {method:'POST', headers:{'Content-Type':'application/json','X-NutriLens-Relay':'hosted-v1','Authorization':'Bearer '+key},body:JSON.stringify({path,method,body}),signal:combined,redirect:'error',credentials:'same-origin',referrerPolicy:'no-referrer',cache:'no-store'};
  }
  if (!hostedRequest && ["bearer", "api-key", "header"].includes(settings.auth) && !String(settings.apiKey || "").trim()) {
    const error = new Error("This endpoint requires an API key. Enter it in Settings, not in chat.");
    error.code = "API_KEY_MISSING";
    throw error;
  }
  let res;
  try {
    res = await fetch(hostedRequest ? HOSTED_RELAY_PATH : useRelay ? "/api/relay" : url, hostedRequest || (useRelay ? {
      method: "POST", headers: { "Content-Type": "application/json", "X-NutriLens-Relay": "1" },
      body: JSON.stringify({ url, method, headers: buildHeaders(settings), body }), signal: combined, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    } : { method, headers: buildHeaders(settings), body: body === undefined ? undefined : JSON.stringify(body), signal: combined, redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" }));
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (timeout.aborted) throw new Error("The endpoint timed out after 120 seconds. Try another model or a smaller request.");
    if (transport === 'hosted') throw new Error('Could not reach the hosted relay. Check the site and network, then try again.');
    throw new Error(isStaticHosting() ? "Could not connect to your provider from this static site. Your HTTPS endpoint must allow browser CORS requests from this site. This static deployment cannot run the local relay. Use a CORS-enabled provider or your own trusted authenticated proxy; check the endpoint and network." : "Could not connect. Run node server.mjs and choose Local relay to avoid browser CORS blocks. Check your endpoint and network.");
  }
  const limit = 24 * 1024 * 1024;
  if (Number(res.headers.get('content-length')) > limit) {
    await res.body?.cancel();
    throw new Error('Provider response is too large (24 MB maximum).');
  }
  let text;
  if (res.body?.getReader) {
    const reader = res.body.getReader(), decoder = new TextDecoder(), chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) { await reader.cancel(); throw new Error('Provider response is too large (24 MB maximum).'); }
        chunks.push(decoder.decode(value, {stream:true}));
      }
      chunks.push(decoder.decode()); text = chunks.join('');
    } finally { reader.releaseLock(); }
  } else {
    text = await res.text();
    if (new TextEncoder().encode(text).length > limit) throw new Error('Provider response is too large (24 MB maximum).');
  }
  if (!res.ok) {
    let detail = text;
    try { const j = JSON.parse(text); detail = j.error?.message || j.message || j.error || text; } catch {}
    const labels = { 401: "API key missing or rejected", 403: "Access denied", 404: "Endpoint or model not found", 429: "Rate limit or quota exceeded", 502: "Relay could not reach the provider", 504: "Provider timed out" };
    const error = new Error(`HTTP ${res.status}: ${labels[res.status] || "Request rejected"}. ${redact(detail, settings)}`);
    error.status = res.status;
    throw error;
  }
  let json;
  try { json = res.headers.get("content-type")?.includes("text/event-stream") || text.trimStart().startsWith("data:") || text.trimStart().startsWith("event:") ? parseEventStream(text) : JSON.parse(text); }
  catch (error) { throw new Error(`The endpoint did not return a usable API response. ${redact(error.message, settings)}`); }
  if (json?.error || json?.code === "API_KEY_REQUIRED") throw new Error(redact(json.error?.message || json.message || "Provider error", settings));
  return json;
}

function makeBody(settings, messages, protocol, maxTokens) {
  const model = String(settings.model || "").trim();
  if (!model) throw new Error("Choose a model. Use Fetch available models to find a valid model ID.");
  const body = { model, stream: false };
  if (protocol === "responses") {
    body.store = false;
    body.input = messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.map(p => p.type === "image_url" ? { type: "input_image", image_url: p.image_url.url } : { type: "input_text", text: p.text }) }));
    body.max_output_tokens = maxTokens;
    if (settings.jsonMode) body.text = { format: { type: "json_object" } };
  } else {
    body.messages = messages;
    body[/^(o[134](?:-|$)|gpt-5|gpt-6)/i.test(model) ? "max_completion_tokens" : "max_tokens"] = maxTokens;
    if (settings.jsonMode) body.response_format = { type: "json_object" };
  }
  if (!/^(o[134](?:-|$)|gpt-5|gpt-6)/i.test(model)) body.temperature = settings.temperature ?? 0.2;
  return body;
}

export async function complete(settings, messages, { signal, maxTokens = settings.maxTokens, onStatus = () => {} } = {}) {
  maxTokens = normalizeMaxTokens(maxTokens);
  const auto = !settings.apiFormat || settings.apiFormat === "auto";
  let protocol = settings.apiFormat === "responses" || /\/responses\/?(?:\?|$)/.test(settings.baseUrl) ? "responses" : "chat";
  let body = makeBody(settings, messages, protocol, maxTokens);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const json = await requestJson(settings, endpointUrl(settings.baseUrl, settings.provider, settings.endpointMode, protocol), { body, signal });
      return { json, text: responseText(json), protocol };
    } catch (error) {
      if (auto && protocol === "chat" && (error.status === 404 || error.status === 405 || /responses.*(only|use|support)|not.*support.*chat|use.*responses/i.test(error.message))) {
        protocol = "responses";
        body = makeBody(settings, messages, protocol, maxTokens);
        onStatus("Trying the Responses API…");
        continue;
      }
      if ([400, 422].includes(error.status)) {
        if (/response_format|json_object|text.format/i.test(error.message) && (body.response_format || body.text)) {
          delete body.response_format; delete body.text;
          onStatus("Retrying without forced JSON mode…"); continue;
        }
        if (/temperature/i.test(error.message) && body.temperature !== undefined) { delete body.temperature; continue; }
        if (/max_tokens|max_completion_tokens/i.test(error.message) && body.max_tokens !== undefined) { body.max_completion_tokens = body.max_tokens; delete body.max_tokens; continue; }
        if (/stream.*(true|required|only)/i.test(error.message) && !body.stream) { body.stream = true; continue; }
      }
      throw error;
    }
  }
  throw new Error("This model rejected the supported request formats. Check the model ID and API format in Settings.");
}
