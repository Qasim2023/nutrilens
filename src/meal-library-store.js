import {loadDiary,saveDiary} from './diary-store.js';

// Each library tab owns its deletion: never touch the other storage engine.
export async function clearMealLibrarySource({source,history,storage=globalThis.localStorage}) {
  if(source==='history') {
    await history.clear();
  } else if(source==='diary') {
    // Validate first; unreadable diary data must not be silently overwritten.
    loadDiary(storage);
    saveDiary([],storage);
  } else {
    throw new Error('Choose analyses or diary meals before deleting.');
  }
}
