import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES_KEY, loadSavedRecipes, saveRecipe, removeSavedRecipe, recipeSnapshot } from '../src/recipe-store.js';
import { exportRecipes, recipeToMarkdown, RECIPE_NUTRITION_NOTICE } from '../src/recipe-export.js';
import { recipe } from './recipe-studio-fixture.mjs';
function storage(initial = []) {
  const data = new Map(initial);
  return { data, writes: 0, getItem: key => data.get(key) ?? null, setItem(key, value) { this.writes++; data.set(key, value); } };
}

test('explicit saves survive reload with full recipe content and no settings or credentials', () => {
  const store = storage([['nutrilens.diary.v1', 'keep diary'], ['nutrilens.settings.v1', 'keep settings'], ['nutrilens.history.v1', 'keep history']]);
  assert.deepEqual(loadSavedRecipes(store), []);
  const input = { ...recipe, apiKey: 'secret-key', extraHeaders: 'secret-header', settings: { baseUrl: 'secret-endpoint' } };
  const saved = saveRecipe(input, { storage: store, id: 'first', now: 100 });
  assert.equal(saved.created, true);
  input.ingredients = [];
  const reloaded = loadSavedRecipes(store);
  assert.deepEqual(reloaded, [{ id: 'first', savedAt: 100, recipe: recipeSnapshot(recipe) }]);
  assert.doesNotMatch(store.data.get(RECIPES_KEY), /secret|apiKey|extraHeaders|settings/);
  assert.equal(store.data.get('nutrilens.diary.v1'), 'keep diary');
  assert.equal(store.data.get('nutrilens.settings.v1'), 'keep settings');
  assert.equal(store.data.get('nutrilens.history.v1'), 'keep history');
});

test('saving the same content twice is idempotent, but different recipes with the same title are kept', () => {
  const store = storage();
  saveRecipe(recipe, { storage: store, id: 'first', now: 100 });
  const again = saveRecipe(recipeSnapshot(recipe), { storage: store, id: 'duplicate', now: 200 });
  assert.equal(again.created, false); assert.equal(again.entry.id, 'first'); assert.equal(store.writes, 1);
  saveRecipe({ ...recipe, chef_tip: 'A different recipe variant.' }, { storage: store, id: 'second', now: 300 });
  assert.deepEqual(loadSavedRecipes(store).map(entry => entry.id), ['second', 'first']);
});

test('removing one saved recipe preserves the rest and reads the latest stored collection', () => {
  const store = storage();
  saveRecipe(recipe, { storage: store, id: 'first', now: 100 });
  saveRecipe({ ...recipe, title: 'Second bowl' }, { storage: store, id: 'second', now: 200 });
  assert.deepEqual(removeSavedRecipe('first', { storage: store }).map(entry => entry.id), ['second']);
  const writes = store.writes;
  removeSavedRecipe('missing', { storage: store });
  assert.equal(store.writes, writes);
  assert.equal(loadSavedRecipes(store)[0].recipe.title, 'Second bowl');
});

test('invalid or unreadable storage is reported without overwriting existing recipe data', () => {
  for (const raw of ['not JSON', '{"version":2,"recipes":[]}', '{"version":1,"recipes":[{}]}']) {
    const store = storage([[RECIPES_KEY, raw]]);
    assert.throws(() => loadSavedRecipes(store), /stored data was not changed/);
    assert.throws(() => saveRecipe(recipe, { storage: store }), /stored data was not changed/);
    assert.throws(() => removeSavedRecipe('anything', { storage: store }), /stored data was not changed/);
    assert.equal(store.data.get(RECIPES_KEY), raw); assert.equal(store.writes, 0);
  }
  assert.throws(() => loadSavedRecipes({ getItem() { throw new Error('unavailable'); } }), /could not be loaded/);
});

test('quota errors do not claim saves or removals succeeded and leave the previous data intact', () => {
  const store = storage();
  saveRecipe(recipe, { storage: store, id: 'first', now: 100 });
  const previous = store.data.get(RECIPES_KEY);
  store.setItem = () => { throw new Error('quota'); };
  assert.throws(() => saveRecipe({ ...recipe, title: 'Second bowl' }, { storage: store }), /Export them instead/);
  assert.throws(() => removeSavedRecipe('first', { storage: store }), /Export them instead/);
  assert.equal(store.data.get(RECIPES_KEY), previous);
});

test('saved recipe metadata and contents are validated, detached and stripped to known fields', () => {
  const store = storage();
  assert.throws(() => saveRecipe(recipe, { storage: store, id: '../bad', now: 100 }), /metadata/);
  assert.throws(() => saveRecipe(recipe, { storage: store, id: 'ok', now: NaN }), /metadata/);
  assert.throws(() => saveRecipe({ title: 'incomplete' }, { storage: store }), /incomplete recipe/);
  const duplicateIds = { version: 1, recipes: [{ id: 'same', savedAt: 1, recipe }, { id: 'same', savedAt: 2, recipe }] };
  assert.throws(() => loadSavedRecipes(storage([[RECIPES_KEY, JSON.stringify(duplicateIds)]])), /stored data was not changed/);
});

test('Markdown exports all recipe details and the estimate/allergy notice', () => {
  const markdown = recipeToMarkdown(recipe);
  for (const phrase of ['# Lemon chickpea bowl', String.raw`1 can \(400 g\)`, '1. Cook the rice for 20 minutes.', 'Calories: 420 kcal', 'Protein: 19 g', 'Carbs: 60 g', 'Fat: 11 g', 'Fiber: 12 g', 'Reserve a little lemon zest.', 'Use quinoa instead of rice.', RECIPE_NUTRITION_NOTICE]) assert.ok(markdown.includes(phrase), phrase);
  const exported = exportRecipes([recipe]);
  assert.equal(exported.filename, 'nutrilens-recipe-lemon-chickpea-bowl.md');
  assert.equal(exported.mime, 'text/markdown;charset=utf-8');
});

test('JSON collection exports preserve more than three recipes and exclude unknown or secret fields', () => {
  const values = Array.from({ length: 5 }, (_, index) => ({ ...recipe, title: 'Recipe ' + index, apiKey: 'secret-key', settings: { model: 'secret-model' } }));
  const file = exportRecipes(values, { format: 'json', now: new Date('2026-01-01T00:00:00Z') });
  const data = JSON.parse(file.content);
  assert.equal(file.filename, 'nutrilens-recipes.json'); assert.equal(file.mime, 'application/json');
  assert.equal(data.format, 'nutrilens-recipes'); assert.equal(data.version, 1);
  assert.equal(data.exportedAt, '2026-01-01T00:00:00.000Z'); assert.equal(data.recipes.length, 5);
  assert.equal(data.nutritionNotice, RECIPE_NUTRITION_NOTICE);
  assert.deepEqual(data.recipes[0], recipeSnapshot(values[0]));
  assert.doesNotMatch(file.content, /secret|apiKey|settings/);
});

test('exports reject empty collections and unsupported formats, and filenames cannot traverse paths', () => {
  assert.throws(() => exportRecipes([]), /No recipes to export/);
  assert.throws(() => exportRecipes([recipe], { format: 'html' }), /Markdown or JSON/);
  const file = exportRecipes([{ ...recipe, title: '../../سالم <b> Bowl' }]);
  assert.doesNotMatch(file.filename, /[\/\\<>]/);
  assert.ok(file.filename.startsWith('nutrilens-recipe-'));
  const markdown = recipeToMarkdown({ ...recipe, description: '[click](javascript:bad)\n<img src="https://bad.example">' });
  assert.ok(markdown.includes('\\[click\\]\\(javascript:bad\\)'));
  assert.ok(markdown.includes('\\<img')); assert.doesNotMatch(markdown, /\n<img/);
});
