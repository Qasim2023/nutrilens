import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDisplayText, withoutTextDashes} from '../src/interface-text.js';
import {normalize} from '../src/ai.js';
import {renderResult, resultToMarkdown} from '../src/render.js';

test('display text removes hyphens and Unicode dashes from prose', () => {
  for (const dash of ['-', '‐', '‑', '‒', '–', '—', '―', '--']) {
    assert.equal(withoutTextDashes(`Meal ${dash} ready`), 'Meal ready');
    assert.equal(withoutTextDashes(`protein${dash}rich`), 'protein rich');
  }
  assert.equal(withoutTextDashes('Protein-rich/fibre-rich'), 'Protein rich/fibre rich');
  assert.equal(withoutTextDashes('Temperature —'), 'Temperature');
  assert.equal(withoutTextDashes('—'), '');
  assert.equal(withoutTextDashes('- Add food\n- Add calories'), 'Add food\nAdd calories');
  assert.equal(withoutTextDashes('  Food - ready  '), '  Food ready  ');
  assert.equal(withoutTextDashes('Food - '), 'Food ');
});

test('dash removal preserves numeric signs, ranges, dates and technical references', () => {
  const references = [
    '-5 °C', '−5 °C', '0–0.4', '256–32,000 tokens', '20-30 g', '0 - 0.4', '20g–30g', '2026-10-08',
    'https://my-provider.example/v1/chat-completions', 'www.my-provider.example',
    'meal-notes.json', 'recipe-notes.pdf', '"meal-notes.csv"',
    'food-notes@example.test', '/src/recipe-notes.js', 'C:\\food-notes\\recipe.txt',
  ];
  for (const reference of references) assert.equal(withoutTextDashes(reference), reference);
  assert.equal(withoutTextDashes('Protein-rich — use meal-notes.json'), 'Protein rich use meal-notes.json');
});

test('the display formatter keeps existing sentence-period formatting', () => {
  assert.equal(formatDisplayText('Protein-rich. Ready — serve.'), 'Protein rich Ready serve');
  assert.equal(formatDisplayText('Use 12.5 g. Visit https://my-provider.example/v1. Loading…'), 'Use 12.5 g Visit https://my-provider.example/v1 Loading…');
  assert.equal(formatDisplayText(null), '');
});

test('dash-free result presentation leaves saved data, model IDs, filenames and exports intact', () => {
  const result = normalize({
    dish: 'Whole-grain bowl', summary: 'Protein-rich — ready to eat.',
    items: [{name: 'Whole-grain oats', quantity: '20–30 g', calories: 100}],
    total: {calories: 100}, health_label: 'Heart-friendly',
    health_summary: 'Well-balanced - with fibre.',
    pros: ['Protein-rich.'], cons: ['Sugar-heavy.'],
    allergens: ['Tree-nuts'],
    swaps: [{from: 'Sugar-heavy oats', to: 'Low-sugar oats', why: 'Less sugar — more fibre.'}],
  }, {attachments: ['recipe-notes.json']});
  const original = structuredClone(result), markdown = resultToMarkdown(result);
  const html = renderResult(result, {showItems: true, showSwaps: true, model: 'fixture-model'});
  for (const text of ['Whole grain bowl', 'Whole grain oats', 'Protein rich ready to eat', 'Heart friendly', 'Well balanced with fibre', 'Tree nuts', 'Low sugar oats', 'Less sugar more fibre']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('20–30 g'));
  assert.ok(html.includes('fixture-model'));
  assert.ok(html.includes('recipe-notes.json'));
  assert.deepEqual(result, original);
  assert.equal(resultToMarkdown(result), markdown);
  assert.ok(markdown.includes('Whole-grain bowl'));
});
