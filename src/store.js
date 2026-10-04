/* ==========================================================================
   NutriLens — settings + history persistence
   API keys stay in this browser's localStorage and go only to the endpoint
   the user configures. Nothing is sent to NutriLens servers (there are none).
   ========================================================================== */

import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "./ai.js";
import { normalizeLanguage } from "./languages.js";

const SETTINGS_KEY = "nutrilens.settings.v1";
const SESSION_KEY = "nutrilens.session.v1";

export const defaults = {
  connectionRevision: 2,
  language: "en",
  provider: "wikivibe",
  baseUrl: DEFAULT_BASE_URL,
  endpointMode: "auto",
  apiFormat: "auto",
  transport: "relay",
  demoMode: false,
  model: DEFAULT_MODEL,
  apiKey: "",
  auth: "bearer",
  keyHeader: "Authorization",
  extraHeaders: "",
  temperature: 0.2,
  maxTokens: 4096,
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
  return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,key==="language"?normalizeLanguage(stored[key]):Object.hasOwn(stored,key)?stored[key]:value]));
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    const stored = parsed && typeof parsed === "object" ? parsed : {};
    const settings = supportedSettings(stored);
    if (stored.connectionRevision !== 2) {
      Object.assign(settings, { provider: 'wikivibe', baseUrl: DEFAULT_BASE_URL, endpointMode: 'auto', apiFormat: 'auto', transport: 'relay', demoMode: false, autoAnalyze: false, connectionRevision: 2 });
    }
    // Drop retired options and credentials without resetting active provider settings.
    saveSettings(settings);
    return settings;
  } catch (_) {
    return { ...defaults };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(supportedSettings(settings)));
  } catch (_) {
    /* storage may be unavailable (private mode / file://) — ignore */
  }
}

export function resetSettings() {
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