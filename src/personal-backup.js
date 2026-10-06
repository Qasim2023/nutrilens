// All-meals backups deliberately exclude application settings and credentials.
import {loadDiary,saveDiary,DIARY_KEY} from './diary-store.js';
import {historySnapshot} from './history-store.js';
const plain = value=>value && typeof value==='object' && !Array.isArray(value);
const validateHistory = data=>{
  if(!plain(data) || data.format!=='nutrilens-history' || data.version!==2 || !Array.isArray(data.analyses))throw new Error('Choose a valid NutriLens meals or history JSON backup.');
  return {format:'nutrilens-history',version:2,analyses:data.analyses.map(historySnapshot)};
};
export async function createPersonalBackup({history,storage=globalThis.localStorage}) {
  const savedHistory=validateHistory(await history.backup());
  const entries=loadDiary(storage);
  return {format:'nutrilens-personal-backup',version:1,exportedAt:new Date().toISOString(),history:savedHistory,diary:{version:1,entries}};
}
export async function restorePersonalBackup(data,{history,storage=globalThis.localStorage}) {
  // Continue accepting older history-only exports without touching the diary.
  if(plain(data) && data.format==='nutrilens-history')return {analyses:await history.importBackup(validateHistory(data)),diaryEntries:0};
  if(!plain(data) || data.format!=='nutrilens-personal-backup' || data.version!==1 || !plain(data.diary))throw new Error('Choose a valid NutriLens meals or history JSON backup.');
  // Validate BOTH halves fully before any writes. Use the same sanitization as
  // normal diary loading; unsupported fields never reach local storage.
  const incomingHistory=validateHistory(data.history);
  let incomingDiary;
  try {incomingDiary=loadDiary({getItem:()=>JSON.stringify(data.diary)});}
  catch {throw new Error('This backup contains invalid diary entries. Existing meals were not changed.');}
  const existingDiary=loadDiary(storage),ids=new Set(existingDiary.map(entry=>entry.id));
  const additions=incomingDiary.filter(entry=>!ids.has(entry.id));
  const merged=[...existingDiary,...additions];
  let previousRaw;
  try {previousRaw=storage.getItem(DIARY_KEY);} catch {throw new Error('Browser storage is unavailable. No meals were restored.');}
  const writtenRaw=JSON.stringify({version:1,entries:merged});
  // Write the diary first: quota failures must not cause a partial history import.
  if(additions.length)saveDiary(merged,storage);
  let analyses;
  try {analyses=await history.importBackup(incomingHistory);}
  catch(error) {
    if(additions.length) {
      try {
        // Do not overwrite newer edits made in a different tab during import.
        if(storage.getItem(DIARY_KEY)!==writtenRaw)throw new Error('concurrent diary edit');
        if(previousRaw===null)storage.removeItem(DIARY_KEY);else storage.setItem(DIARY_KEY,previousRaw);
      } catch {
        throw new Error('Analysis restore failed. Diary changes could not be rolled back safely. Existing meals were not replaced; keep your backup and check both lists before retrying.');
      }
    }
    throw error;
  }
  return {analyses,diaryEntries:additions.length};
}
