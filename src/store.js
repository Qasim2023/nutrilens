/* ==========================================================================
   NutriLens — settings + history persistence
   API keys stay in tab-scoped sessionStorage. Requests use the visitor’s
   chosen provider and configured connection method.
   ========================================================================== */

import { DEFAULT_BASE_URL, DEFAULT_MODEL, PRESETS } from "./ai.js";
import { isStaticHosting } from "./hosting.js";
import { normalizeLanguage } from "./languages.js";
import { normalizeMaxTokens, OUTPUT_TOKEN_LIMITS } from "./output-tokens.js";

const SETTINGS_KEY = "nutrilens.settings.v1";
const SESSION_KEY = "nutrilens.session.v1";
const CREDENTIALS_KEY = "nutrilens.credentials.v1";
let volatileCredentials = {apiKey:"", extraHeaders:""};
const credentials = settings => ({apiKey:String(settings.apiKey || ""), extraHeaders:String(settings.extraHeaders || "")});
function loadCredentials() {
  try { const raw = globalThis.sessionStorage?.getItem(CREDENTIALS_KEY); if(raw) return credentials(JSON.parse(raw)); } catch {}
  return {...volatileCredentials};
}

export const defaults = {
  connectionRevision: 3,
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
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaults, ...loadCredentials() };
    const parsed = JSON.parse(raw);
    const stored = parsed && typeof parsed === "object" ? parsed : {};
    const settings = {...supportedSettings(stored), ...loadCredentials()};
    // Migrate legacy credentials once, then remove their persistent copies.
    if (stored.apiKey || stored.extraHeaders) Object.assign(settings, credentials(stored));
    // Never inject a maintainer's endpoint during migration. Keep each visitor's
    // own connection and only normalize retired preset IDs to Custom.
    if (!Object.hasOwn(PRESETS, settings.provider)) settings.provider = 'custom';
    settings.connectionRevision = defaults.connectionRevision;
    // Drop retired options and credentials without resetting active provider settings.
    saveSettings(settings);
    return settings;
  } catch (_) {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try {
    volatileCredentials = credentials(settings);
    try {
      if (volatileCredentials.apiKey || volatileCredentials.extraHeaders) globalThis.sessionStorage?.setItem(CREDENTIALS_KEY, JSON.stringify(volatileCredentials));
      else globalThis.sessionStorage?.removeItem(CREDENTIALS_KEY);
    } catch {}
    const {apiKey, extraHeaders, ...preferences} = supportedSettings(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
  } catch (_) {
    /* storage may be unavailable (private mode / file://) — ignore */
  }
}

export function resetSettings() {
  volatileCredentials = {apiKey:"", extraHeaders:""};
  try { globalThis.sessionStorage?.removeItem(CREDENTIALS_KEY); } catch {}
  try { localStorage.removeItem(SETTINGS_KEY); } catch (_) {}
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