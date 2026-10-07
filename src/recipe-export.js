import { recipeSnapshot } from './recipe-store.js';

export const RECIPE_NUTRITION_NOTICE = 'Nutrition is estimated, not medical advice. Allergy safety and cross-contact cannot be guaranteed; check ingredient labels and preparation.';
// Export plain text, not executable HTML or model-supplied Markdown links.
const md = value => String(value).replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]<>()#!|]/g, '\\$&');
export function recipeToMarkdown(value) {
  const recipe = recipeSnapshot(value);
  const n = recipe.nutrition;
  return [
    '# ' + md(recipe.title),
    recipe.description ? md(recipe.description) : '',
    '**Servings:** ' + recipe.servings + ' · **Prep:** ' + recipe.prep_minutes + ' min · **Cook:** ' + recipe.cook_minutes + ' min · **Difficulty:** ' + recipe.difficulty,
    recipe.tags.length ? '**Tags:** ' + recipe.tags.map(md).join(', ') : '',
    '## Ingredients\n' + recipe.ingredients.map(item => '- ' + md([item.amount, item.name].filter(Boolean).join(' '))).join('\n'),
    '## Steps\n' + recipe.steps.map((step, index) => (index + 1) + '. ' + md(step)).join('\n'),
    '## Estimated nutrition per serving\n' + [
      '- Calories: ' + n.calories + ' kcal', '- Protein: ' + n.protein_g + ' g',
      '- Carbs: ' + n.carbs_g + ' g', '- Fat: ' + n.fat_g + ' g', '- Fiber: ' + n.fiber_g + ' g',
    ].join('\n'),
    recipe.chef_tip ? '## Chef’s tip\n' + md(recipe.chef_tip) : '',
    recipe.swaps.length ? '## Possible swaps\n' + recipe.swaps.map(swap => '- ' + md(swap)).join('\n') : '',
    RECIPE_NUTRITION_NOTICE,
  ].filter(Boolean).join('\n\n');
}
export function exportRecipes(values, { format = 'markdown', now = new Date() } = {}) {
  if (!Array.isArray(values) || !values.length) throw new Error('No recipes to export.');
  const recipes = values.map(recipeSnapshot);
  const slug = recipes.length === 1 ? recipes[0].title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'recipe' : '';
  const filename = slug ? 'nutrilens-recipe-' + slug : 'nutrilens-recipes';
  if (format === 'json') return {
    content: JSON.stringify({ format: 'nutrilens-recipes', version: 1, exportedAt: now.toISOString(), nutritionNotice: RECIPE_NUTRITION_NOTICE, recipes }, null, 2) + '\n',
    mime: 'application/json', filename: filename + '.json',
  };
  if (format !== 'markdown') throw new Error('Choose Markdown or JSON.');
  return { content: recipes.map(recipeToMarkdown).join('\n\n---\n\n') + '\n', mime: 'text/markdown;charset=utf-8', filename: filename + '.md' };
}
