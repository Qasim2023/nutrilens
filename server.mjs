import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Transform } from "node:stream";
import {securityHeaders, validateEndpoint, validateHeader, unsafeHeader} from "./src/security-policy.js";
import { extractRecipeDocument } from "./server/recipe-parser.mjs";
import { pipeline } from "node:stream/promises";

const root = path.dirname(fileURLToPath(import.meta.url));
const defaultOrigins = ["https://api.openai.com", "https://openrouter.ai", "https://api.groq.com", "https://api.together.xyz", "https://api.deepseek.com", "https://api.mistral.ai", "https://api.x.ai", "http://localhost:11434", "http://127.0.0.1:11434", "http://localhost:1234", "http://127.0.0.1:1234"];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
function sendJson(res, status, message) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: { message } }));
}

// Bind only to loopback. The relay has no key storage and never logs request bodies.
export function createAppServer({ allowedOrigins = defaultOrigins.concat(String(process.env.NUTRILENS_ALLOWED_ORIGINS || "").split(",").filter(Boolean)), maxRequestsPerMinute = 120, maxConcurrentRequests = 4 } = {}) {
  const allowed = new Set(allowedOrigins.map(s => validateEndpoint(s.trim()).origin));
  let windowStart = Date.now(), requestCount = 0, active = 0;
  const server = http.createServer({maxHeaderSize: 16 * 1024, headersTimeout: 15000, requestTimeout: 30000, keepAliveTimeout: 5000}, async (req, res) => {
    for (const [name, value] of Object.entries(securityHeaders({local:true}))) res.setHeader(name, value);
    try {
      const port = req.socket.localPort;
      const hosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
      if (!hosts.has(req.headers.host)) return sendJson(res, 403, "Invalid local host.");
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) return sendJson(res, 403, 'Cross-origin API requests are not allowed.');
        if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); requestCount = 0; }
        if (++requestCount > maxRequestsPerMinute) { res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60000 - (Date.now() - windowStart)) / 1000)))); return sendJson(res, 429, 'Too many requests. Try again shortly.'); }
        if (active >= maxConcurrentRequests) { res.setHeader('Retry-After', '5'); return sendJson(res, 429, 'Too many simultaneous requests.'); }
        active++;
        let released = false;
        const release = () => { if (!released) { released = true; active--; } };
        res.once('finish', release); res.once('close', release);
      }
      if (url.pathname === "/api/health") {
        if (!['GET', 'HEAD'].includes(req.method)) return sendJson(res, 405, 'Method not allowed.');
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        return res.end(JSON.stringify({ relay: true, attachments: true }));
      }
      if (url.pathname === "/api/attachments") {
        if (req.method !== "POST" || req.headers.origin !== `http://${req.headers.host}` || req.headers["x-nutrilens-upload"] !== "1" || !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) {
          return sendJson(res, 403, "Document reading accepts only same-origin NutriLens requests.");
        }
        if (Number(req.headers['content-length']) > 7 * 1024 * 1024) { req.resume(); return sendJson(res, 413, 'Request body is too large.'); }
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req.iterator({destroyOnReturn:false})) {
          bytes += chunk.length;
          if (bytes > 7 * 1024 * 1024) { req.resume(); return sendJson(res, 413, "Each recipe attachment must be 5 MB or smaller."); }
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { return sendJson(res, 400, "Invalid attachment request."); }
        try {
          const parsed = await extractRecipeDocument(input);
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          return res.end(JSON.stringify(parsed));
        } catch (error) { return sendJson(res, 422, error.message); }
      }
      if (url.pathname === "/api/relay") {
        // CORS is intentionally NOT enabled. Require a same-origin browser request.
        if (req.method !== "POST" || req.headers.origin !== `http://${req.headers.host}` || req.headers["x-nutrilens-relay"] !== "1" || !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) {
          return sendJson(res, 403, "The relay accepts only same-origin NutriLens requests.");
        }
        if (Number(req.headers['content-length']) > 18 * 1024 * 1024) { req.resume(); return sendJson(res, 413, 'Request body is too large.'); }
        const buffers = [];
        let bytes = 0;
        for await (const chunk of req.iterator({destroyOnReturn:false})) {
          bytes += chunk.length;
          if (bytes > 18 * 1024 * 1024) { req.resume(); return sendJson(res, 413, "Photo request exceeds 18 MB. Enable photo compression."); }
          buffers.push(chunk);
        }
        let envelope;
        try { envelope = JSON.parse(Buffer.concat(buffers).toString()); }
        catch { return sendJson(res, 400, "Invalid relay request JSON."); }
        if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || typeof envelope.url !== "string" || (envelope.headers !== undefined && (!envelope.headers || typeof envelope.headers !== "object" || Array.isArray(envelope.headers)))) return sendJson(res, 400, "Invalid relay request shape.");
        let target;
        try { target = validateEndpoint(envelope.url); }
        catch { return sendJson(res, 403, "Invalid or insecure endpoint URL."); }
        if (!allowed.has(target.origin) || target.username || target.password || target.hash || !/\/(models|chat\/completions|responses)\/?$/.test(target.pathname)) {
          return sendJson(res, 403, "Endpoint not allowed by the local relay. To trust another provider, add its origin to NUTRILENS_ALLOWED_ORIGINS and restart the server, or choose Direct browser requests.");
        }
        const method = envelope.method || "POST";
        if (!["GET", "POST"].includes(method) || (method === "GET" && !/\/models\/?$/.test(target.pathname)) || (method === "POST" && /\/models\/?$/.test(target.pathname))) return sendJson(res, 400, "Unsupported relay route or method.");
        if (method === "POST" && (!envelope.body || typeof envelope.body !== "object" || Array.isArray(envelope.body))) return sendJson(res, 400, "The relay body must be a JSON object.");
        if (Object.keys(envelope.headers || {}).length > 32) return sendJson(res, 400, "Too many provider headers.");
        const headers = new Headers();
        for (const [name, value] of Object.entries(envelope.headers || {})) {
          if (unsafeHeader(name)) continue;
          try { validateHeader(name, value); headers.set(name, value); }
          catch { return sendJson(res, 400, 'Invalid provider header.'); }
        }
        headers.set("Content-Type", "application/json");
        const abort = new AbortController();
        res.on("close", () => { if (!res.writableEnded) abort.abort(); });
        let upstream;
        try {
          upstream = await fetch(target, { method, headers, body: method === "POST" ? JSON.stringify(envelope.body) : undefined, redirect: "error", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(115000)]) });
        } catch (error) {
          if (!res.destroyed) sendJson(res, error.name === "TimeoutError" ? 504 : 502, "Could not reach the configured provider. Check network access, URL and provider availability.");
          return;
        }
        res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type")?.includes("text/event-stream") ? "text/event-stream" : "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        if (upstream.body) {
          let responseBytes = 0;
          const limit = new Transform({transform(chunk, encoding, callback) {
            responseBytes += chunk.length;
            callback(responseBytes > 24 * 1024 * 1024 ? new Error('Provider response exceeds limit.') : null, chunk);
          }});
          await pipeline(Readable.fromWeb(upstream.body), limit, res);
        }
        else res.end();
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) return sendJson(res, 405, "Method not allowed.");
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { return sendJson(res, 400, 'Invalid URL encoding.'); }
      const relative = decoded.replace(/^\/+/, "") || "index.html";
      // Explicit public file allowlist: never expose .env, server code or credentials.
      if (!(relative === "index.html" || /^(src|public)\/[a-zA-Z0-9_.-]+\.(js|css|svg|webmanifest)$/.test(relative))) return sendJson(res, 404, "Not found.");
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) return sendJson(res, 403, "Forbidden.");
      let data;
      try { data = await fs.readFile(target); } catch { return sendJson(res, 404, "Not found."); }
      res.writeHead(200, { "Content-Type": `${mime[path.extname(target)] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      if (!res.headersSent && !res.destroyed) sendJson(res, 500, "Local server error.");
      else if (!res.destroyed) res.destroy();
    }
  });
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || Number(process.env.PORT) || 5173;
  const server = createAppServer();
  server.on("error", error => { console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use. Stop the old server or choose another port.` : "Could not start local server."); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => console.log(`NutriLens: http://localhost:${port} (local relay enabled)`));
}
