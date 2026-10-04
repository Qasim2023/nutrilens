import { cleanEstimateNotes } from './estimate-notes.js';
// Independent local diary storage: never sent to an AI endpoint.
export const DIARY_KEY = 'nutrilens.diary.v1';
export const MEALS = [ ['breakfast','Breakfast'], ['lunch','Lunch'], ['dinner','Dinner'], ['snack','Snacks'], ['other','Other'] ];
export const MAX_CALORIES = 100000;

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(year,month-1,day,12);
  return date.getFullYear() === year && date.getMonth() === month-1 && date.getDate() === day;
}

export function shiftDay(day, offset) {
  if (!validDay(day) || !Number.isInteger(offset)) throw new Error('Choose a valid date.');
  const [year,month,date] = day.split('-').map(Number);
  const next = new Date(year,month-1,date,12);
  next.setDate(next.getDate()+offset);
  const result = localDay(next);
  if (!validDay(result)) throw new Error('That date is outside the supported range.');
  return result;
}

export function validateCalories(value) {
  if (value === null || value === undefined || String(value).trim() === '') throw new Error('Enter the calories for the amount you ate.');
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_CALORIES) throw new Error(`Calories must be between 0 and ${MAX_CALORIES.toLocaleString()} kcal.`);
  // One decimal place, exact integer-tenths arithmetic when adding.
  return Math.round((number + Number.EPSILON) * 10) / 10;
}

export function createEntry(input, { id = crypto.randomUUID(), now = Date.now() } = {}) {
  if (!validDay(input.date)) throw new Error('Choose a valid diary date.');
  if (!MEALS.some(([key])=>key===input.meal)) throw new Error('Choose a meal category.');
  const rawName = String(input.name || '').trim();
  if (rawName.length > 160) throw new Error('Food names must be 160 characters or fewer.');
  return { id, date: input.date, name: rawName || 'Calorie entry', meal: input.meal, calories: validateCalories(input.calories), source: input.source === 'ai' ? 'ai' : 'manual', nutrients: input.source==='ai' && input.nutrients && typeof input.nutrients==='object' ? Object.fromEntries(['calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg'].filter(k=>input.nutrients[k]===null||typeof input.nutrients[k]==='number'&&Number.isFinite(input.nutrients[k])&&input.nutrients[k]>=0).map(k=>[k,input.nutrients[k]])) : null, estimateNotes: input.source === 'ai' && typeof input.estimateNotes === 'string' ? cleanEstimateNotes(input.estimateNotes).slice(0,800) : '', createdAt: now, updatedAt: now };
}

export function dayEntries(entries, date) {
  return entries.filter(e=>e.date===date).sort((a,b)=>a.createdAt-b.createdAt);
}
export function daySummary(entries, date) {
  const items = dayEntries(entries,date);
  const totals = Object.fromEntries(MEALS.map(([key])=>[key,0]));
  for (const item of items) totals[item.meal] += Math.round(item.calories * 10);
  for (const key in totals) totals[key] /= 10;
  return { total: items.reduce((sum,e)=>sum+Math.round(e.calories*10),0)/10, count: items.length, meals: totals };
}
export function updateEntry(entries, id, input, now = Date.now()) {
  const existing = entries.find(e=>e.id===id);
  if (!existing) throw new Error('This entry no longer exists. Reload the diary.');
  const updated = createEntry(input, { id, now: existing.createdAt });
  updated.updatedAt=now;
  return entries.map(e=>e.id===id ? updated : e);
}
export function removeEntry(entries, id) { return entries.filter(e=>e.id!==id); }

export function loadDiary(storage = localStorage) {
  let raw;
  try { raw=storage.getItem(DIARY_KEY); } catch { throw new Error('Browser storage is unavailable. Enable local storage to use the diary.'); }
  if (!raw) return [];
  try {
    const parsed=JSON.parse(raw);
    if (parsed.version!==1 || !Array.isArray(parsed.entries)) throw new Error('shape');
    const ids=new Set();
    return parsed.entries.map(entry=>{
      if (!entry || typeof entry.id!=='string' || !entry.id || ids.has(entry.id) || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt) || typeof entry.name!=='string' || typeof entry.calories!=='number') throw new Error('entry');
      ids.add(entry.id);
      return { ...createEntry(entry,{id:entry.id,now:entry.createdAt}),updatedAt:entry.updatedAt };
    });
  } catch { throw new Error('Saved diary data could not be read. It has not been changed. Restore a valid backup or contact support before adding entries.'); }
}

export function saveDiary(entries, storage = localStorage) {
  try { storage.setItem(DIARY_KEY,JSON.stringify({version:1,entries})); }
  catch { throw new Error('Your diary could not be saved. Browser storage may be full or blocked. Nothing was added or changed.'); }
}
