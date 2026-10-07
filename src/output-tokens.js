// Shared validation for the saved preference, settings input and request payload.
export const OUTPUT_TOKEN_LIMITS = Object.freeze({ min: 256, max: 32000, default: 20000 });
export function normalizeMaxTokens(value) {
  const { min, max, default: fallback } = OUTPUT_TOKEN_LIMITS;
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return fallback;
  const tokens = Number(value);
  return Number.isFinite(tokens) ? Math.round(Math.max(min, Math.min(max, tokens))) : fallback;
}
