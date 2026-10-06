import {createPersonalBackup,restorePersonalBackup} from './personal-backup.js';
import {encryptBackup,decryptBackup,ENCRYPTED_BACKUP_FORMAT} from './encrypted-backup.js';
import {askBackupPassword} from './backup-password.js';
import {foodPicture} from './food-picture.js';
import {renderConfidenceBadge,renderDiaryConfidence} from './diary.js';
import {confirmDelete} from './delete-confirmation.js';
import {esc,fmt,ICONS} from './render.js';
import {loadDiary,DIARY_KEY,MEALS,removeEntry,saveDiary} from './diary-store.js';
import {clearMealLibrarySource} from './meal-library-store.js';

function analysisThumbnail(entry) {
  if (entry.thumb) return `<img src="${esc(entry.thumb)}" alt="" loading="lazy">`;
  const picture = entry.foodPicture || foodPicture(entry);
  return `<img class="food-illustration" src="${esc(picture.src)}" alt="${esc(picture.alt)}" title="${esc(picture.title)}" data-food-theme="${picture.theme}" data-food-multiple="${picture.multiple}" loading="lazy">`;
}

export function diaryAnalysisSelection(entry) {
  if(!entry || !String(entry.name || '').trim() || entry.name==='Calorie entry') throw new Error('This diary entry has only a calorie amount. Edit it to add a food description before analysing.');
  const description=String(entry.name).trim();
  return { text:description, diaryContext:{id:entry.id,name:description,calories:entry.calories,estimateNotes:entry.source==='ai'?String(entry.estimateNotes || ''):''}, label:`From diary: ${description}` };
}
export function diaryRequestText(text,context) {
  if(!context)return text;
  return `${text}\n\nThis is a food previously logged in my diary. Give a full nutrition estimate for the described amount; do not treat any earlier calorie number as authoritative.${context.estimateNotes ? '\nEarlier estimated portion for reference (reassess if my description differs): '+context.estimateNotes : ''}`;
}

export function initMealLibrary({history,onOpenAnalysis,onChooseDiary,onReanalyse,onBeforeOpen,onAllDeleted,isBusy,toast}) {
  const $=selector=>document.querySelector(selector);
  const panel=$('#meal-library'),scrim=$('#meal-library-scrim'),host=$('#meal-library-list');
  let source='history',analyses=[],diaryEntries=[],opened=false,activeId=null,limit=30,refreshNumber=0,returnFocus,clearing=false,transferring=false,loaded=false,loadFailed={history:true,diary:true};
  const controls=()=>[...panel.querySelectorAll('button,input,summary')].filter(e=>!e.disabled && e.getClientRects().length);
  function close() {
    if(!opened || clearing || transferring)return;
    opened=false;panel.hidden=true;panel.inert=true;scrim.hidden=true;$('.app').inert=false;
    $('#meal-library-toggle').setAttribute('aria-expanded','false');
    $('#history-btn').setAttribute('aria-expanded','false');
    if(returnFocus?.isConnected && returnFocus.getClientRects().length)returnFocus.focus();
  }
  async function open(tab=source) {
    if(isBusy()){toast('Finish or cancel the current analysis or calorie estimate before opening your meal library.');return;}
    if(opened){setSource(tab);return;}
    onBeforeOpen?.();returnFocus=document.activeElement;opened=true;
    panel.hidden=false;panel.inert=false;scrim.hidden=false;$('.app').inert=true;
    $('#meal-library-toggle').setAttribute('aria-expanded','true');$('#history-btn').setAttribute('aria-expanded','true');
    setSource(tab);$('#meal-library-close').focus();
    await refresh();
  }
  function setSource(tab) {
    source=tab==='diary'?'diary':'history';limit=30;
    for(const kind of ['history','diary']) $('#library-tab-'+kind).setAttribute('aria-pressed',String(kind===source));
    $('#meal-library-intro').textContent=source==='history'?'View a full saved result without analysing it again, or prepare a new analysis. Originals are never replaced.':'Choose a logged food to load its description into Analyse Food. Your diary entry will not change.';
    $('#meal-library-search').placeholder=source==='history'?'Search previous analyses…':'Search diary meals…';
    render();
  }
  function render() {
    const query=$('#meal-library-search').value.trim().toLowerCase();
    const data=source==='history'?analyses:diaryEntries;
    const filtered=data.filter(entry=>(entry.dish || entry.name || '').toLowerCase().includes(query));
    $('#library-history-count').textContent=analyses.length;
    $('#library-diary-count').textContent=diaryEntries.length;
    $('#meal-library-count').textContent=filtered.length+' '+(source==='history'?'saved analyses':'diary entries');
    if(!filtered.length)host.innerHTML=`<div class="library-empty">${ICONS.history}<p>${query?'No meals match your search.':source==='history'?'Your full analyses will appear here after you analyse a meal.':'No diary meals yet. Log a named food in Daily Food Diary first.'}</p></div>`;
    else host.innerHTML=filtered.slice(0,limit).map(entry=>source==='history'?`<article class="library-meal ${entry.id===activeId?'is-selected':''}">
      <button type="button" class="library-select" data-open-analysis="${esc(entry.id)}" aria-label="View saved analysis: ${esc(entry.dish)}">
        ${analysisThumbnail(entry)}
        <span class="library-meal-description"><strong data-i18n-skip>${esc(entry.dish)}</strong><small>${esc(new Date(entry.when).toLocaleString())} · ${fmt(entry.calories,1)} kcal</small>${renderConfidenceBadge(entry.confidence)}<small>${entry.model?`<span data-i18n-skip>${esc(entry.model)}</span>`:'Saved result'}${entry.legacy?' · Imported history':''}</small></span>
      </button>
      <div class="library-meal-actions"><button class="btn btn-sm" type="button" data-open-analysis="${esc(entry.id)}">View full result</button><button class="btn btn-ghost btn-sm" type="button" data-reanalyse="${esc(entry.id)}" aria-label="Analyse again: ${esc(entry.dish)}">Analyse again</button><button class="icon-btn library-delete" type="button" data-remove-analysis="${esc(entry.id)}" aria-label="Delete saved analysis: ${esc(entry.dish)}">${ICONS.trash}</button></div>
    </article>`:`<article class="library-meal"><button type="button" class="library-select" data-choose-diary="${esc(entry.id)}" aria-label="Select diary meal: ${esc(entry.name)}"><span class="library-food-icon">${ICONS.diary}</span><span class="library-meal-description"><strong data-i18n-skip>${esc(entry.name)}</strong><small>${esc(entry.date)} · ${esc(MEALS.find(([key])=>key===entry.meal)?.[1] || entry.meal)} · ${fmt(entry.calories,1)} logged kcal</small><small>${entry.source==='ai'?'Estimated nutrition':'Manual entry'} · Select to analyse in detail</small>${renderDiaryConfidence(entry)}</span></button><div class="library-meal-actions"><button class="btn btn-sm" type="button" data-choose-diary="${esc(entry.id)}">Analyse meal</button><button class="icon-btn library-delete" type="button" data-remove-diary="${esc(entry.id)}" aria-label="Delete diary meal: ${esc(entry.name)}" title="Delete diary meal">${ICONS.trash}</button></div></article>`).join('');
    $('#meal-library-more').hidden=filtered.length<=limit;
    // Lock actions while clearing, including restore, row actions and closing.
    for(const control of panel.querySelectorAll('button,input'))control.disabled=clearing || transferring;
    const clearButton=$('#meal-library-clear-all');
    clearButton.disabled=clearing || transferring || !loaded || loadFailed[source] || !data.length;
    clearButton.textContent=clearing?'Deleting...':source==='history'?'Delete all analyses':'Delete all diary meals';
    $('#meal-library-clear-note').textContent=source==='history'
      ? 'Deletes every saved analysis, not just search results. Diary meals are kept. Cannot be undone.'
      : 'Deletes diary meals from every date, not just search results. Saved analyses are kept. Cannot be undone.';
    for(const button of host.querySelectorAll('[data-open-analysis]'))button.addEventListener('click',async()=>{
      button.disabled=true;try{const entry=await history.get(button.dataset.openAnalysis);if(!entry)throw new Error('This analysis is no longer saved.');close();onOpenAnalysis(entry);activeId=entry.id;}catch(error){toast(error.message,'error');}finally{button.disabled=false;}
    });
    for(const button of host.querySelectorAll('[data-reanalyse]'))button.addEventListener('click',async()=>{
      button.disabled=true;try{const entry=await history.get(button.dataset.reanalyse);if(!entry)throw new Error('This analysis is no longer saved.');close();onReanalyse(entry);}catch(error){toast(error.message,'error');}finally{button.disabled=false;}
    });
    for(const button of host.querySelectorAll('[data-choose-diary]'))button.addEventListener('click',()=>{
      const entry=diaryEntries.find(e=>e.id===button.dataset.chooseDiary);try{diaryAnalysisSelection(entry);close();onChooseDiary(entry);}catch(error){toast(error.message,'error');}
    });
    for(const button of host.querySelectorAll('[data-remove-diary]'))button.addEventListener('click',async()=>{
      const entry=diaryEntries.find(e=>e.id===button.dataset.removeDiary);
      if(!entry || !await confirmDelete({title:'Delete diary meal?',subject:entry.name || 'Calorie entry',detail:fmt(entry.calories,1)+' kcal · '+entry.date,message:'This diary meal will be deleted. Other diary meals and saved analyses will be kept.',confirmLabel:'Delete meal',fallbackFocus:'#meal-library-close'}))return;
      button.disabled=true;
      try {
        const next=removeEntry(loadDiary(),entry.id);
        saveDiary(next);
        document.dispatchEvent(new CustomEvent('nutrilens:diary-changed'));
        await refresh();
        toast('Diary meal deleted. Daily total updated.','success');
      } catch(error) { toast(error.message,'error');button.disabled=false; }
    });
    for(const button of host.querySelectorAll('[data-remove-analysis]'))button.addEventListener('click',async()=>{
      const entry=analyses.find(e=>e.id===button.dataset.removeAnalysis);
      if(!entry || !await confirmDelete({title:'Delete saved analysis?',subject:entry.dish || 'Saved result',detail:fmt(entry.calories,1)+' kcal',message:'Other analyses and diary entries will be kept.',confirmLabel:'Delete analysis',fallbackFocus:'#meal-library-close'}))return;
      button.disabled=true;try{await history.remove(button.dataset.removeAnalysis);await refresh();$('#meal-library-close').focus();toast('Saved analysis deleted.','success');}catch(error){toast(error.message,'error');button.disabled=false;}
    });
  }
  async function refresh() {
    const ticket=++refreshNumber;
    const errors=[],failures={history:false,diary:false};
    try{const loaded=await history.list();if(ticket!==refreshNumber)return;analyses=loaded;}catch(error){failures.history=true;errors.push(error.message);}
    if(ticket!==refreshNumber)return;
    try{diaryEntries=loadDiary().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);}catch(error){failures.diary=true;errors.push(error.message);}
    loaded=true;loadFailed=failures;
    const status=$('#meal-library-error');status.hidden=!errors.length;status.textContent=errors.join(' ');
    render();
  }
  $('#meal-library-clear-all').addEventListener('click',async()=>{
    if(clearing || transferring || isBusy())return;
    const deletingSource=source;
    clearing=true;render();
    try {
      await refresh();
      if(loadFailed[deletingSource])throw new Error('The selected list could not be read. Nothing was deleted. Resolve the storage error and try again.');
      const count=deletingSource==='history'?analyses.length:diaryEntries.length;
      if(!count)return;
      const message=deletingSource==='history'
        ? 'Every saved analysis will be deleted, including those outside your search. Diary meals and daily calorie totals will be kept. Download a history backup first if needed.'
        : 'Diary meals from every date will be deleted, including those outside your search. Daily calorie totals will reset. Saved analyses will be kept.';
      if(!await confirmDelete({title:deletingSource==='history'?'Delete all analyses?':'Delete all diary meals?',subject:count+' '+(deletingSource==='history'?(count===1?'saved analysis':'saved analyses'):(count===1?'diary entry':'diary entries')),subjectIsFood:false,message,confirmLabel:deletingSource==='history'?'Delete all analyses':'Delete all diary meals',fallbackFocus:'#meal-library-close'}))return;
      await clearMealLibrarySource({source:deletingSource,history});
      if(deletingSource==='history')activeId=null;
      $('#meal-library-search').value='';limit=30;
      onAllDeleted?.(deletingSource);
      if(deletingSource==='diary')document.dispatchEvent(new CustomEvent('nutrilens:diary-changed'));
      toast(deletingSource==='history'?'All saved analyses deleted. Diary meals kept.':'All diary meals deleted. Saved analyses kept. Daily totals updated.','success');
    } catch(error) {
      if(deletingSource==='diary')document.dispatchEvent(new CustomEvent('nutrilens:diary-changed'));
      toast(error.message,'error');
    }
    finally {
      clearing=false;await refresh();
      if(opened)$('#meal-library-close').focus();
    }
  });
  $('#meal-library-close').addEventListener('click',close);scrim.addEventListener('click',close);
  $('#meal-library-toggle').addEventListener('click',()=>opened?close():open());
  $('#history-btn').addEventListener('click',()=>opened?close():open('history'));
  $('#choose-diary-meal').addEventListener('click',()=>open('diary'));
  $('#library-tab-history').addEventListener('click',()=>setSource('history'));
  $('#library-tab-diary').addEventListener('click',()=>setSource('diary'));
  $('#meal-library-search').addEventListener('input',()=>{limit=30;render();});
  $('#meal-library-more').addEventListener('click',()=>{limit+=30;render();});
  async function downloadBackup(encrypted) {
    if(clearing || transferring || isBusy())return;
    transferring=true;render();
    try {
      let password = encrypted ? await askBackupPassword({creating:true}) : null;
      if(encrypted && password === null)return;
      let backup;
      try {
        const meals=await createPersonalBackup({history});
        backup=encrypted ? await encryptBackup(meals,password) : meals;
      } finally {password=null;}
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='nutrilens-all-meals-'+(encrypted?'encrypted-':'')+new Date().toISOString().slice(0,10)+'.json';
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      toast(encrypted ? 'Encrypted meals backup prepared. Keep the password safe; it cannot be recovered.' : 'Unencrypted all-meals backup prepared. Keep it private: it contains meals, photos and recipe text, but no settings or API keys.','success',6500);
    } catch(error) {toast(error.message,'error');}
    finally {transferring=false;render();}
  }
  $('#meal-library-backup').addEventListener('click',()=>downloadBackup(false));
  $('#meal-library-backup-encrypted').addEventListener('click',()=>downloadBackup(true));
  $('#meal-library-import').addEventListener('click',()=>$('#meal-library-import-file').click());
  $('#meal-library-import-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(clearing || transferring || isBusy()){event.target.value='';return;}
    transferring=true;render();
    try {
      if(file.size>100*1024*1024)throw new Error('Choose a meals backup smaller than 100 MB.');
      let data=JSON.parse(await file.text());
      if(data?.format===ENCRYPTED_BACKUP_FORMAT) {
        let password=await askBackupPassword();
        if(password===null)return;
        try {data=await decryptBackup(data,password);} finally {password=null;}
      }
      await restorePersonalBackup(data,{history});
      document.dispatchEvent(new CustomEvent('nutrilens:diary-changed'));
      await refresh();toast('Meals restored. Existing analyses and diary entries were kept.','success');
    } catch(error) {document.dispatchEvent(new CustomEvent('nutrilens:diary-changed'));toast(error.message,'error');}
    finally {transferring=false;event.target.value='';await refresh();}
  });
  document.addEventListener('keydown',event=>{
    if(!opened || document.querySelector('#delete-confirmation[open], #backup-password[open]'))return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){const elements=controls();if(event.shiftKey && document.activeElement===elements[0]){event.preventDefault();elements.at(-1)?.focus();}else if(!event.shiftKey && document.activeElement===elements.at(-1)){event.preventDefault();elements[0]?.focus();}}
  });
  document.addEventListener('nutrilens:diary-changed',()=>refresh());
  window.addEventListener('storage',event=>{if(event.key===DIARY_KEY || event.key===null)refresh();});
  window.addEventListener('focus',()=>{if(opened)refresh();});
  refresh();
  return {open,close,refresh,setActive:id=>{activeId=id;render();}};
}
