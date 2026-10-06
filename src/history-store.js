// Durable analysis snapshots. No entry cap, TTL, or automatic deletion.
// IndexedDB commits must finish before the UI claims an analysis is saved.
import { foodPicture, validFoodVisual } from './food-picture.js';
import { normalizeLanguage } from './languages.js';
import { cleanEstimateNotes } from './estimate-notes.js';
export const HISTORY_KEY = 'nutrilens.history.v1';
export const DB_NAME = 'nutrilens.meal-history.v2';
const STORE = 'analyses', META = 'meta';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const copy = value => structuredClone(value);
export const safeImage = value => typeof value === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/i.test(value) ? value : null;

export function historySnapshot(entry) {
  if (!plain(entry) || typeof entry.id !== 'string' || !entry.id || !Number.isFinite(entry.when) || !plain(entry.result) || !plain(entry.result.total) || !Array.isArray(entry.result.items) || !Array.isArray(entry.result.micros) || !Number.isFinite(entry.result.total.calories)) throw new Error('Invalid saved analysis. The original history has not been changed.');
  const source = plain(entry.input) ? entry.input : {};
  const image = plain(source.image) && safeImage(source.image.dataUrl) ? { dataUrl: source.image.dataUrl, name: String(source.image.name || 'photo'), bytes: Number(source.image.bytes) || 0, width: Number(source.image.width) || 0, height: Number(source.image.height) || 0 } : null;
  const input = { text: typeof source.text === 'string' ? source.text : String(entry.text || ''), image, attachments: Array.isArray(source.attachments) ? source.attachments.filter(a=>plain(a) && typeof a.name === 'string' && typeof a.text === 'string').map(a=>({name:a.name,text:a.text,type:String(a.type || 'txt'),size:Number(a.size)||0,pages:Number(a.pages)||null})) : [], diaryContext: plain(source.diaryContext) ? { id:String(source.diaryContext.id || ''),name:String(source.diaryContext.name || ''),estimateNotes:String(source.diaryContext.estimateNotes || '') } : null };
  const result = copy(entry.result);
  result.confidence_notes=cleanEstimateNotes(result.confidence_notes);
  const itemFields = ['name','quantity','grams','calories','protein_g','carbs_g','fat_g','fiber_g','sugar_g','sodium_mg'];
  result.items = result.items.map(item => ({...Object.fromEntries(itemFields.filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]])), ...(validFoodVisual(item.visual_food) ? {visual_food:item.visual_food} : {})}));
  // Never persist arbitrary result metadata or client settings (keys/headers).
  result.meta = { ...(result.meta?.language!==undefined?{language:normalizeLanguage(result.meta.language)}:{}), model: typeof result.meta?.model === 'string' ? result.meta.model : String(entry.model || ''), protocol: String(result.meta?.protocol || ''), attachments: Array.isArray(result.meta?.attachments) ? result.meta.attachments.filter(name=>typeof name==='string') : [], ...(result.meta?.demo !== undefined ? { demo:!!result.meta.demo } : {}) };
  const view=plain(entry.view) ? entry.view : {};
  return { version:2, id:entry.id, when:entry.when, dish:String(entry.dish || result.dish || 'Nutrition analysis'), calories:result.total.calories, score:result.health_score, summary:String(result.summary || ''), model:result.meta.model, thumb:safeImage(entry.thumb), text:input.text, input, result,
    view:{imageUrl:safeImage(view.imageUrl) || image?.dataUrl || safeImage(entry.thumb),model:typeof view.model==='string'?view.model:result.meta.model,showMicros:view.showMicros!==false,showItems:view.showItems!==false,showSwaps:view.showSwaps!==false,isEstimate:!!result.meta.demo},
    legacy:!!entry.legacy || entry.version!==2 && !entry.input,
  };
}

function metadata(entry) {
  return { id:entry.id,when:entry.when,dish:entry.dish,calories:entry.calories,confidence:typeof entry.result?.confidence==='number' && Number.isFinite(entry.result.confidence) ? entry.result.confidence : null,model:entry.model,thumb:entry.thumb,foodPicture:entry.thumb?null:foodPicture(entry.result),summary:entry.summary,legacy:entry.legacy };
}

export function createHistoryRepository({ indexedDB = globalThis.indexedDB, storage = globalThis.localStorage, name = DB_NAME, notify = () => {} } = {}) {
  let ready;
  let db;
  const sort = entries=>entries.sort((a,b)=>b.when-a.when || a.id.localeCompare(b.id));
  function readLegacy() {
    let raw;
    try { raw=storage?.getItem(HISTORY_KEY); } catch { throw new Error('Saved history cannot be read. Browser storage is blocked.'); }
    if (!raw) return [];
    let data;
    try { data=JSON.parse(raw); } catch { throw new Error('Existing history is unreadable. It has not been overwritten.'); }
    if (!Array.isArray(data)) throw new Error('Existing history has an invalid format. It has not been overwritten.');
    return data.map(historySnapshot);
  }
  function tx(storeNames, mode, action) {
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(storeNames,mode);
      let output;
      transaction.oncomplete=()=>resolve(output);
      transaction.onerror=()=>reject(new Error(transaction.error?.name==='QuotaExceededError' ? 'History storage is full. Download a backup or free browser storage; this analysis was not saved.' : 'History could not be saved or read. Existing results are unchanged.'));
      transaction.onabort=()=>reject(new Error('History transaction did not complete. Existing results are unchanged.'));
      try { action(transaction,value=>{output=value;}); } catch(error) { transaction.abort(); reject(error); }
    });
  }
  async function initialize() {
    if (ready) return ready;
    ready=(async()=>{
      if (!indexedDB) { readLegacy(); return; }
      db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open(name,1);
        request.onupgradeneeded=()=>{ const database=request.result;database.createObjectStore(STORE,{keyPath:'id'});database.createObjectStore(META); };
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(new Error('Persistent history could not be opened. Enable site storage in your browser.'));
        request.onblocked=()=>reject(new Error('History is blocked by another tab. Close older NutriLens tabs and reload.'));
      });
      db.onversionchange=()=>db.close();
      const migrated=await tx([META],'readonly',(t,set)=>{const r=t.objectStore(META).get('migrated-v1');r.onsuccess=()=>set(!!r.result);});
      if (!migrated) {
        const legacy=readLegacy();
        await tx([STORE,META],'readwrite',t=>{
          const store=t.objectStore(STORE);
          for (const entry of legacy) { const request=store.get(entry.id);request.onsuccess=()=>{if(!request.result)store.put(entry);}; }
          t.objectStore(META).put(true,'migrated-v1');
        });
        // Keep the legacy copy as a recovery backup; the migration marker prevents duplicates.
      }
    })();
    try { await ready; } catch(error) { db?.close(); db=null; ready=null; throw error; }
  }
  async function all() {
    await initialize();
    if (!db) return sort(readLegacy());
    const entries=await tx([STORE],'readonly',(t,set)=>{const r=t.objectStore(STORE).getAll();r.onsuccess=()=>set(r.result);});
    return sort(entries.map(historySnapshot));
  }
  return {
    async list() {
      await initialize();
      if(!db)return sort(readLegacy()).map(metadata);
      // Walk snapshots one at a time; the menu does not retain full photos/results in memory.
      const summaries=await tx([STORE],'readonly',(t,set)=>{
        const rows=[];const request=t.objectStore(STORE).openCursor();
        request.onsuccess=()=>{const cursor=request.result;if(!cursor){set(rows);return;}rows.push(metadata(cursor.value));cursor.continue();};
      });
      return sort(summaries);
    },
    async get(id) { await initialize(); if(!db)return readLegacy().find(e=>e.id===id)||null; return tx([STORE],'readonly',(t,set)=>{const r=t.objectStore(STORE).get(id);r.onsuccess=()=>set(r.result ? historySnapshot(r.result):null);}); },
    async put(entry) {
      const snapshot=historySnapshot(entry);await initialize();
      if(db) await tx([STORE],'readwrite',t=>t.objectStore(STORE).put(snapshot));
      else { const previous=readLegacy().filter(e=>e.id!==snapshot.id);try {storage.setItem(HISTORY_KEY,JSON.stringify([snapshot,...previous]));}catch {throw new Error('History storage is full or blocked. This analysis has not been saved. Download its result and retry.');} }
      notify();return copy(snapshot);
    },
    async remove(id) {
      await initialize();
      if(db)await tx([STORE],'readwrite',t=>t.objectStore(STORE).delete(id));
      else {try {storage.setItem(HISTORY_KEY,JSON.stringify(readLegacy().filter(e=>e.id!==id)));}catch{throw new Error('History entry could not be deleted.');}}
      notify();
    },
    async clear() {
      await initialize();
      // Clear the migration recovery copy too, so deleted meals cannot reappear.
      let legacy;
      try {
        legacy=storage?.getItem(HISTORY_KEY);
        if(legacy)storage.setItem(HISTORY_KEY,'[]');
      } catch { throw new Error('Saved analyses could not be deleted. Browser storage is blocked.'); }
      try {
        if(db)await tx([STORE],'readwrite',t=>t.objectStore(STORE).clear());
      } catch(error) {
        if(legacy) {
          try { storage.setItem(HISTORY_KEY,legacy); }
          catch { throw new Error('Analyses were not deleted, but the legacy recovery copy could not be restored.'); }
        }
        throw error;
      }
      // Keep the migration marker; clearing snapshots must not trigger re-import.
      notify();
    },
    async backup() { return {format:'nutrilens-history',version:2,exportedAt:new Date().toISOString(),analyses:await all()}; },
    async importBackup(data) {
      if(!plain(data) || data.format!=='nutrilens-history' || data.version!==2 || !Array.isArray(data.analyses))throw new Error('Choose a NutriLens history JSON backup.');
      const incoming=data.analyses.map(historySnapshot),unique=new Map(incoming.map(e=>[e.id,e]));
      await initialize();
      if(db) await tx([STORE],'readwrite',t=>{const store=t.objectStore(STORE);for(const entry of unique.values()){const r=store.get(entry.id);r.onsuccess=()=>{if(!r.result)store.put(entry);};}});
      else {const existing=readLegacy(),ids=new Set(existing.map(e=>e.id));try{storage.setItem(HISTORY_KEY,JSON.stringify([...existing,...[...unique.values()].filter(e=>!ids.has(e.id))]));}catch{throw new Error('Backup could not be restored. Existing history is unchanged.');}}
      notify();return unique.size;
    },
    async close() { if(ready)await ready.catch(()=>{});db?.close(); },
  };
}
