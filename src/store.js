/* ==========================================================================
   NutriLens — settings + history persistence
   Connection settings and credentials stay in this browser until cleared.
   Requests use the visitor’s chosen provider and configured connection method.
   ========================================================================== */

import { DEFAULT_BASE_URL, DEFAULT_MODEL, PRESETS } from "./ai.js";
import { isStaticHosting } from "./hosting.js";
import { normalizeLanguage } from "./languages.js";
import { normalizeMaxTokens, OUTPUT_TOKEN_LIMITS } from "./output-tokens.js";
import { clearRelayOriginTrust } from "./relay-trust.js";

const SETTINGS_KEY = "nutrilens.settings.v1";
const SESSION_KEY = "nutrilens.session.v1";
const CREDENTIALS_KEY = "nutrilens.credentials.v1";
let volatileCredentials = {apiKey:"", extraHeaders:""};
const credentials = settings => ({apiKey:String(settings.apiKey || ""), extraHeaders:String(settings.extraHeaders || "")});
function loadCredentials(stored = {}) {
  // Prefer persistent credentials; accept the previous tab-scoped store once.
  for (const storageName of ["localStorage", "sessionStorage"]) {
    try {
      const raw = globalThis[storageName]?.getItem(CREDENTIALS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return credentials(parsed);
    } catch {}
  }
  // Older versions saved credentials alongside preferences.
  if (stored.apiKey || stored.extraHeaders) return credentials(stored);
  return {...volatileCredentials};
}

function saveCredentials(settings) {
  volatileCredentials = credentials(settings);
  const hasCredentials = Boolean(volatileCredentials.apiKey || volatileCredentials.extraHeaders);
  let persisted = false;
  try {
    if (hasCredentials) globalThis.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(volatileCredentials));
    else globalThis.localStorage.removeItem(CREDENTIALS_KEY);
    persisted = true;
  } catch {}
  try {
    // Remove migrated copies so an old tab key cannot reappear after reset.
    if (persisted || !hasCredentials) globalThis.sessionStorage?.removeItem(CREDENTIALS_KEY);
    else globalThis.sessionStorage?.setItem(CREDENTIALS_KEY, JSON.stringify(volatileCredentials));
  } catch {}
}

export const defaults = {
  connectionRevision: 3,
  outputTokensRevision: 1,
  language: "en",
  provider: "custom",
  baseUrl: DEFAULT_BASE_URL,
  endpointMode: "auto",
  apiFormat: "auto",
  transport: isStaticHosting() ? "direct" : "relay",
  demoMode: false,
  model: DEFAULT_MODEL,
  apiKey: "",
  auth: "bearer",
  keyHeader: "Authorization",
  extraHeaders: "",
  temperature: 0.2,
  maxTokens: OUTPUT_TOKEN_LIMITS.default,
  jsonMode: true,
  theme: "dark",
  accent: "emerald",
  units: "metric",
  showMicros: true,
  showItems: true,
  showSwaps: true,
  autoAnalyze: false,
  compressImages: true,
  maxImageDim: 1280,
};

function supportedSettings(stored) {
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => {
    if (key === "transport" && isStaticHosting()) return [key, "direct"];
    if (key === "language") return [key, normalizeLanguage(stored[key])];
    if (key === "maxTokens") return [key, normalizeMaxTokens(stored[key])];
    return [key, Object.hasOwn(stored, key) ? stored[key] : value];
  }));
}

export function loadSettings() {
  let stored = {};
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed;
  } catch {}
  const settings = {...supportedSettings(stored), ...loadCredentials(stored)};
  // Never inject a maintainer's endpoint during migration. Keep each visitor's
  // own connection and only normalize retired preset IDs to Custom.
  if (!Object.hasOwn(PRESETS, settings.provider)) settings.provider = "custom";
  settings.connectionRevision = defaults.connectionRevision;
  // Upgrade the old default once, without changing other user-selected limits.
  if (!(Number(stored.outputTokensRevision) >= defaults.outputTokensRevision) && settings.maxTokens === 4096) {
    settings.maxTokens = defaults.maxTokens;
  }
  settings.outputTokensRevision = defaults.outputTokensRevision;
  // Normalize preferences and migrate credentials without resetting the connection.
  saveSettings(settings);
  return settings;
}

export function saveSettings(settings) {
  saveCredentials(settings);
  try {
    const {apiKey, extraHeaders, ...preferences} = supportedSettings(settings);
    globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch (_) {
    /* storage may be unavailable (private mode / file://) — ignore */
  }
}

export function resetSettings() {
  clearRelayOriginTrust();
  volatileCredentials = {apiKey:"", extraHeaders:""};
  try { globalThis.sessionStorage?.removeItem(CREDENTIALS_KEY); } catch {}
  try { globalThis.localStorage?.removeItem(CREDENTIALS_KEY); } catch {}
  try { globalThis.localStorage?.removeItem(SETTINGS_KEY); } catch {}
  return { ...defaults };
}

/* -------------------------------------------------------------------------- */
/* Session — remembers the composer contents across reloads                    */

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

let sessionTimer = null;
export function saveSession(patch) {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    try {
      const current = loadSession();
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...current, ...patch }));
    } catch (_) {}
  }, 250);
}