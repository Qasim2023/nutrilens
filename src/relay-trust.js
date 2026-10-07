// An explicit, browser-local approval for one exact provider origin.
// The local server still validates every URL, route, method and request header.
import {validateEndpoint} from './security-policy.js';
import {translate} from './i18n.js';

const STORAGE_KEY = 'nutrilens.relay-trust.v1';
let volatileOrigins = new Set(), volatileOnly = false;

function loadOrigins() {
  try {
    if (volatileOnly || !globalThis.localStorage) return new Set(volatileOrigins);
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return new Set();
    return new Set(values.filter(value => {
      try { return typeof value === 'string' && validateEndpoint(value).origin === value; }
      catch { return false; }
    }));
  } catch {
    return new Set(volatileOrigins);
  }
}

export function isRelayOriginTrusted(value) {
  return loadOrigins().has(validateEndpoint(value).origin);
}

export function requestRelayOriginTrust(value) {
  const origin = validateEndpoint(value).origin;
  const origins = loadOrigins();
  if (origins.has(origin)) return true;
  if (typeof globalThis.confirm !== 'function') return false;
  const approved = globalThis.confirm([
    translate('Trust this provider for the local relay?'),
    origin,
    translate('Your API key and submitted food data will be sent to this provider. Only approve a provider you trust. Reset settings clears this approval.'),
  ].join('\n\n'));
  if (!approved) return false;
  origins.add(origin);
  volatileOrigins = new Set(origins);
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([...origins]));
    volatileOnly = false;
  } catch { volatileOnly = true; }
  return true;
}

export function clearRelayOriginTrust() {
  volatileOrigins.clear();
  volatileOnly = false;
  try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch {}
}
