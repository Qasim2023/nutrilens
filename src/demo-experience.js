import {demoAnalyze} from './demo.js';
import {createEntry, validateCalories, DIARY_KEY} from './diary-store.js';
import {DEMO_DIARY_KEY} from './onboarding-store.js';
import {normalizeRecipes} from './recipe-ai.js';

// Every sample is computed locally, without credentials, network requests or real diary writes.
export function waitForDemo(signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 450);
    signal?.addEventListener('abort', abort, {once: true});
  });
}
export function demoDiaryInput(input) {
  const name = String(input.name || '').trim();
  const needsEstimate = String(input.calories ?? '').trim() === '';
  createEntry({...input, name, calories: needsEstimate ? 0 : input.calories});
  if (needsEstimate && !name) throw new Error('Describe a food or enter calories to try the demo diary');
  return {...input, name, calories: needsEstimate ? demoAnalyze(name, false).total.calories : validateCalories(input.calories), source: 'manual'};
}
const SAMPLE_RECIPES = [
  {
    title: 'Lemon chickpea bowl', description: 'A sample recipe to explore ingredients, cooking steps and nutrition',
    prep_minutes: 10, cook_minutes: 5, servings: 2, difficulty: 'Easy', tags: ['Demo recipe', 'Vegetarian'],
    ingredients: [{amount: '1 can (400 g)', name: 'chickpeas, drained'}, {amount: '1', name: 'cucumber, diced'}, {amount: '2', name: 'tomatoes, chopped'}, {amount: '1 tbsp', name: 'olive oil'}, {amount: '1 tbsp', name: 'lemon juice'}],
    steps: ['Rinse the chickpeas and drain well', 'Warm the chickpeas in a pan over medium heat for 5 minutes, stirring occasionally', 'Mix the cucumber and tomatoes with olive oil and lemon juice', 'Divide between two bowls and add the warm chickpeas'],
    nutrition: {calories: 310, protein_g: 12, carbs_g: 39, fat_g: 11, fiber_g: 10},
    chef_tip: 'This is a fixed demo example, not a recipe tailored to your request or dietary needs', swaps: [],
  },
  {
    title: 'Apple oat bowl', description: 'A sample breakfast recipe with simple preparation steps',
    prep_minutes: 5, cook_minutes: 10, servings: 2, difficulty: 'Easy', tags: ['Demo recipe', 'Breakfast'],
    ingredients: [{amount: '100 g', name: 'rolled oats'}, {amount: '400 ml', name: 'milk'}, {amount: '1', name: 'apple, diced'}, {amount: '½ tsp', name: 'cinnamon'}, {amount: '2 tbsp', name: 'plain yogurt'}],
    steps: ['Combine oats and milk in a small saucepan', 'Simmer over low heat for 8–10 minutes, stirring until the oats soften', 'Stir in the apple and cinnamon', 'Divide between two bowls and top with yogurt'],
    nutrition: {calories: 325, protein_g: 13, carbs_g: 52, fat_g: 8, fiber_g: 7},
    chef_tip: 'Check ingredient labels and preparation practices for allergies', swaps: [],
  },
];
export function demoRecipe(index = 0) { return normalizeRecipes([structuredClone(SAMPLE_RECIPES[Math.min(Math.max(index, 0), 1)])]); }

export function demoDiaryStorage(storage = globalThis.localStorage) {
  const key = value => { if (value !== DIARY_KEY) throw new Error('Unexpected demo storage key'); return DEMO_DIARY_KEY; };
  return {getItem: value => storage.getItem(key(value)), setItem: (value, data) => storage.setItem(key(value), data)};
}
