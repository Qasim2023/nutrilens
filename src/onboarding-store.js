// Onboarding belongs to this browser, independently of connection settings and credentials.
export const ONBOARDING_KEY = 'nutrilens.onboarding.v1';
export const DEMO_DIARY_KEY = 'nutrilens.demoDiary.v1';
export const DEMO_LIMITS = Object.freeze({analysis: 2, diary: 2, recipes: 2});
const previousUseKeys = ['nutrilens.settings.v1', 'nutrilens.credentials.v1', 'nutrilens.session.v1', 'nutrilens.history.v1', 'nutrilens.diary.v1', 'nutrilens.recipes.v1'];
const initialState = () => ({version: 1, status: 'welcome', demoFinished: false, used: {analysis: 0, diary: 0, recipes: 0}});
function normalize(value) {
  if (!value || value.version !== 1 || !['welcome', 'demo', 'normal'].includes(value.status)) return null;
  const used = Object.fromEntries(Object.entries(DEMO_LIMITS).map(([feature, limit]) => {
    const count = value.used?.[feature];
    return [feature, Number.isInteger(count) && count >= 0 ? Math.min(count, limit) : 0];
  }));
  const exhausted = Object.entries(DEMO_LIMITS).every(([feature, limit]) => used[feature] >= limit);
  const demoFinished = value.demoFinished === true || exhausted;
  return {version: 1, status: demoFinished ? 'normal' : value.status, demoFinished, used};
}
export function createOnboardingStore({storage} = {}) {
  if (!storage) { try { storage = globalThis.localStorage; } catch {} }
  let state = initialState();
  const pending = {analysis: 0, diary: 0, recipes: 0};
  let saved = null;
  try { saved = normalize(JSON.parse(storage?.getItem(ONBOARDING_KEY) || 'null')); } catch {}
  if (saved) state = saved;
  else { try { if (previousUseKeys.some(key => storage?.getItem(key))) state.status = 'normal'; } catch {} }
  // Browser storage failures keep a usable, in-memory experience
  let persisted = true;
  function write() { try { storage?.setItem(ONBOARDING_KEY, JSON.stringify(state)); persisted = true; } catch { persisted = false; } }
  function refresh() {
    try { const saved = persisted ? normalize(JSON.parse(storage?.getItem(ONBOARDING_KEY) || 'null')) : null; if (saved) state = saved; } catch {}
    return structuredClone(state);
  }
  write();
  return {
    snapshot: refresh,
    startDemo() {
      refresh();
      if (state.demoFinished) return false;
      state.status = 'demo'; write(); return true;
    },
    skipDemo() { refresh(); state.status = 'normal'; write(); },
    finishDemo() { refresh(); state.status = 'normal'; state.demoFinished = true; write(); },
    reserve(feature) {
      refresh();
      if (!Object.hasOwn(DEMO_LIMITS, feature)) throw new Error('Unknown demo feature');
      if (state.status !== 'demo' || state.used[feature] + pending[feature] >= DEMO_LIMITS[feature]) return null;
      pending[feature]++;
      let settled = false;
      return {
        release() { if (!settled) { settled = true; pending[feature]--; } },
        complete() {
          if (settled) return {accepted: false, finished: false};
          settled = true; pending[feature]--; refresh();
          if (state.status !== 'demo' || state.used[feature] >= DEMO_LIMITS[feature]) return {accepted: false, finished: false};
          state.used[feature]++;
          const finished = Object.entries(DEMO_LIMITS).every(([key, limit]) => state.used[key] >= limit);
          if (finished) { state.status = 'normal'; state.demoFinished = true; }
          write(); return {accepted: true, finished};
        },
      };
    },
  };
}
