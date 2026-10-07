import { normalizeRecipes } from './recipe-ai.js';

// Explicitly saved recipes only. Requests, settings and credentials are excluded.
export const RECIPES_KEY = 'nutrilens.recipes.v1';
export function recipeSnapshot(value) {
  const { number, ...recipe } = normalizeRecipes([value])[0];
  return recipe;
}
const identity = recipe => JSON.stringify(recipeSnapshot(recipe));
export function findSavedRecipe(entries, recipe) {
  const key = identity(recipe);
  return entries.find(entry => identity(entry.recipe) === key) || null;
}
export function loadSavedRecipes(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(RECIPES_KEY);
    if (raw == null) return [];
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.recipes)) throw new Error('Invalid recipe storage');
    const ids = new Set();
    return data.recipes.map(entry => {
      if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.id) || ids.has(entry.id) || !Number.isSafeInteger(entry.savedAt) || entry.savedAt < 0) throw new Error('Invalid saved recipe');
      ids.add(entry.id);
      return { id: entry.id, savedAt: entry.savedAt, recipe: recipeSnapshot(entry.recipe) };
    });
  } catch {
    throw new Error('Saved recipes could not be loaded. Your stored data was not changed.');
  }
}
function persistRecipes(entries, storage) {
  try { storage.setItem(RECIPES_KEY, JSON.stringify({ version: 1, recipes: entries })); }
  catch { throw new Error('Could not save recipes in this browser. Export them instead.'); }
}
export function saveRecipe(recipe, { storage = globalThis.localStorage, id = crypto.randomUUID(), now = Date.now() } = {}) {
  // Read the latest collection before each write to preserve other tabs' saves.
  const entries = loadSavedRecipes(storage);
  const snapshot = recipeSnapshot(recipe);
  const existing = findSavedRecipe(entries, snapshot);
  if (existing) return { entry: existing, created: false };
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || entries.some(entry => entry.id === id) || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid saved recipe metadata.');
  const entry = { id, savedAt: now, recipe: snapshot };
  persistRecipes([entry, ...entries], storage);
  return { entry, created: true };
}
export function removeSavedRecipe(id, { storage = globalThis.localStorage } = {}) {
  const entries = loadSavedRecipes(storage);
  const remaining = entries.filter(entry => entry.id !== id);
  if (remaining.length !== entries.length) persistRecipes(remaining, storage);
  return remaining;
}
