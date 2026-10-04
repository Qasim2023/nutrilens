import { getLocale } from "./i18n.js";
import { esc, fmt, ICONS } from './render.js';
import { DIARY_KEY, MEALS, localDay, validDay, shiftDay, createEntry, dayEntries, daySummary, updateEntry, removeEntry, loadDiary, saveDiary } from './diary-store.js';

import { cleanEstimateNotes } from './estimate-notes.js';
import { resolveDiaryInput } from "./diary-estimate.js";

export function initDiary({ toast, getSettings, onAnalyseEntry }) {
  const $ = selector=>document.querySelector(selector);
  let entries=[], selected=localDay(), editing=null, draft=null, blocked=false, view='analysis', pending=null;
  const form=$('#diary-form');
  const message=$('#diary-message');
  try { entries=loadDiary(); } catch(error) { blocked=true; message.textContent=error.message; message.hidden=false; }
  const todayBadge=$('#diary-today-total');
  const caloriesLabel=n=>fmt(n,1);

  function setView(next) {
    view=next;
    $('#analysis-view').hidden=next!=='analysis';
    $('#diary-panel').hidden=next!=='diary';
    for (const name of ['analysis','diary']) $('#view-'+name).setAttribute('aria-pressed',String(next===name));
    if(next==='diary') render();
  }
  function resetForm() {
    if(pending)return;
    editing=null; draft=null; form.reset();
    $('#diary-save').textContent='Add entry';
    $('#diary-cancel-edit').hidden=true;
    $('#diary-draft-note').hidden=true;
  }
  function render() {
    const summary=daySummary(entries,selected), todays=daySummary(entries,localDay());
    $('#diary-date').value=selected;
    $('#diary-day-label').textContent=selected===localDay() ? 'Today’s food diary' : new Date(selected+'T12:00:00').toLocaleDateString(getLocale(),{weekday:'long',month:'long',day:'numeric',year:'numeric'});
    $('#diary-total').textContent=caloriesLabel(summary.total);
    $('#diary-count').textContent=summary.count+' '+(summary.count===1?'entry':'entries')+' logged';
    todayBadge.textContent=caloriesLabel(todays.total)+' kcal today';
    $('#diary-today').disabled=selected===localDay();
    $('#diary-meal-totals').innerHTML=MEALS.map(([key,label])=>`<div class="diary-meal-total"><span>${label}</span><strong>${caloriesLabel(summary.meals[key])}<small> kcal</small></strong></div>`).join('');
    const items=dayEntries(entries,selected);
    $('#diary-entries').innerHTML=items.length ? items.map(entry=>`<article class="diary-entry" data-diary-entry="${esc(entry.id)}">
      <div class="diary-entry-icon">${ICONS.leaf}</div>
      <div class="diary-entry-description"><strong data-i18n-skip>${esc(entry.name)}</strong><small>${esc(MEALS.find(([key])=>key===entry.meal)[1])} · ${entry.source==='ai'?'AI estimate':'Manual entry'}</small>${entry.nutrients ? `<small>Protein ${fmt(entry.nutrients.protein_g,1)} g · Carbs ${fmt(entry.nutrients.carbs_g,1)} g · Fat ${fmt(entry.nutrients.fat_g,1)} g · Fibre ${fmt(entry.nutrients.fiber_g,1)} g · Sugar ${fmt(entry.nutrients.sugar_g,1)} g · Sodium ${fmt(entry.nutrients.sodium_mg)} mg</small>` : ""}${cleanEstimateNotes(entry.estimateNotes) ? `<details class="diary-estimate-details"><summary>Estimated portion</summary><p data-i18n-skip>${esc(cleanEstimateNotes(entry.estimateNotes))}</p></details>` : ''}</div>
      <div class="diary-entry-calories">${caloriesLabel(entry.calories)}<small> kcal</small></div>
      <div class="diary-entry-actions"><button class="btn btn-sm diary-detail-button" type="button" data-analyse-diary="${esc(entry.id)}" aria-label="Detailed nutrition for ${esc(entry.name)}">Detailed nutrition</button><button class="icon-btn" type="button" data-edit-entry="${esc(entry.id)}" aria-label="Edit ${esc(entry.name)}" title="Edit entry">${ICONS.edit}</button><button class="icon-btn" type="button" data-remove-entry="${esc(entry.id)}" aria-label="Delete ${esc(entry.name)}" title="Delete entry">${ICONS.trash}</button></div>
    </article>`).join('') : '<div class="diary-empty"><span>'+ICONS.diary+'</span><h3>No foods logged for this day</h3><p>Enter a food and leave calories blank for an AI estimate, add a calorie-only amount, or log an analysed meal.</p></div>';
    $('#diary-clear').disabled=!items.length || blocked || !!pending;
    for(const control of form.elements) control.disabled=blocked || !!pending;
    for(const control of document.querySelectorAll('#diary-date, #diary-prev, #diary-next, [data-edit-entry], [data-remove-entry], [data-analyse-diary]')) control.disabled=!!pending || blocked;
    $('#diary-today').disabled=!!pending || selected===localDay();
    for(const button of document.querySelectorAll('[data-analyse-diary]')) button.addEventListener('click',()=>{if(pending)return;onAnalyseEntry?.(entries.find(entry=>entry.id===button.dataset.analyseDiary));});
    for(const button of document.querySelectorAll('[data-edit-entry]')) button.addEventListener('click',()=>edit(button.dataset.editEntry));
    for(const button of document.querySelectorAll('[data-remove-entry]')) button.addEventListener('click',()=>{
      const item=entries.find(e=>e.id===button.dataset.removeEntry);
      if(!item || !confirm(`Delete “${item.name}” (${caloriesLabel(item.calories)} kcal) from this day?`)) return;
      if(commit(removeEntry(entries,item.id))) { if(editing===item.id)resetForm(); toast('Entry deleted. Daily total updated.','success'); }
    });
  }
  function commit(next) {
    if(blocked) { toast('Diary storage is unavailable.','error'); return false; }
    try { saveDiary(next); entries=next; message.hidden=true; render(); document.dispatchEvent(new CustomEvent('nutrilens:diary-changed')); return true; }
    catch(error) { message.textContent=error.message; message.hidden=false; toast(error.message,'error'); return false; }
  }
  function edit(id) {
    if(pending)return;
    const entry=entries.find(e=>e.id===id); if(!entry)return;
    resetForm(); editing=id; draft=entry;
    $('#diary-food').value=entry.name; $('#diary-calories').value=entry.calories; $('#diary-meal').value=entry.meal;
    $('#diary-save').textContent='Save changes'; $('#diary-cancel-edit').hidden=false;
    $('#diary-food').focus();
  }
  function changeDate(next) {
    if(pending)return;
    if(!validDay(next)){toast('Choose a valid diary date.','error');$('#diary-date').value=selected;return;}
    if(editing && !confirm('Switch day and discard the unsaved edit?')){$('#diary-date').value=selected;return;}
    selected=next;if(editing)resetForm();render();
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault(); if(blocked || pending)return;
    const input={date:selected,name:$('#diary-food').value,meal:$('#diary-meal').value,calories:$('#diary-calories').value};
    const needsEstimate=input.calories.trim()==='';
    const editId=editing, original=draft;
    const controller=new AbortController();
    pending=controller;
    $('#diary-save').textContent=needsEstimate?'Estimating…':'Saving…';
    $('#diary-estimating').hidden=!needsEstimate;
    $('#diary-estimate-status').textContent='Estimating calories for your food…';
    message.hidden=true;render();
    let saved=false;
    try {
      const resolved=await resolveDiaryInput({input,settings:{...getSettings()},original,signal:controller.signal,onStatus:status=>{$('#diary-estimate-status').textContent=status;}});
      if(controller.signal.aborted)return;
      // Keep a completed estimate in the form if saving fails; retry will not make a second AI call.
      if(needsEstimate){$('#diary-calories').value=resolved.calories;draft=resolved;}
      const current=loadDiary();
      const next=editId ? updateEntry(current,editId,resolved) : [...current,createEntry(resolved)];
      saved=commit(next);
      if(saved)toast(needsEstimate?'AI calories estimated and logged. Daily total updated.':editId?'Entry updated. Daily total recalculated.':'Food logged. Daily total updated.','success');
    } catch(error) {
      const text=error.name==='AbortError'?'Estimation cancelled. No food was logged.':error.message;
      message.textContent=text;message.hidden=false;
      toast(text,error.name==='AbortError'?'info':'error',6500);
    } finally {
      pending=null;$('#diary-estimating').hidden=true;
      if(saved)resetForm();
      else $('#diary-save').textContent=editing?'Save changes':'Add entry';
      render();
      if(saved)$('#diary-food').focus();
    }
  });
  $('#diary-cancel-estimate').addEventListener('click',()=>pending?.abort());
  $('#diary-date').addEventListener('change',event=>changeDate(event.target.value));
  $('#diary-prev').addEventListener('click',()=>{try{changeDate(shiftDay(selected,-1));}catch(error){toast(error.message,'error');}});
  $('#diary-next').addEventListener('click',()=>{try{changeDate(shiftDay(selected,1));}catch(error){toast(error.message,'error');}});
  $('#diary-today').addEventListener('click',()=>changeDate(localDay()));
  $('#diary-cancel-edit').addEventListener('click',resetForm);
  $('#diary-clear').addEventListener('click',()=>{
    if(confirm('Delete all diary entries for '+selected+'? Other days will be kept.') && commit(entries.filter(e=>e.date!==selected))){resetForm();toast('Selected day cleared.','success');}
  });
  $('#view-analysis').addEventListener('click',()=>setView('analysis'));
  $('#view-diary').addEventListener('click',()=>setView('diary'));
  $('#diary-analyse-food').addEventListener('click',()=>{setView('analysis');$('#input').focus();});
  function reload() {
    try {
      entries=loadDiary();blocked=false;message.hidden=true;
      if(editing && !entries.some(entry=>entry.id===editing))resetForm();
    } catch(error) { blocked=true;message.textContent=error.message;message.hidden=false; }
    render();
  }
  document.addEventListener('nutrilens:diary-changed',reload);
  window.addEventListener('storage',event=>{
    if(event.key!==DIARY_KEY && event.key!==null)return;
    reload();
  });
  // Update "today" at local midnight and after returning to the app.
  function refreshDay(){if(view==='diary' || todayBadge)render();}
  window.addEventListener('focus',refreshDay);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay();});
  setInterval(refreshDay,60000);
  render();
  return {
    isBusy:()=>!!pending,
    refreshLanguage:()=>render(),
    showAnalysis:()=>setView('analysis'),
    prepareResult(result) {
      if(pending){toast('Finish or cancel the current calorie estimate first.');return;}
      if(!result)return;
      if(result.meta?.demo){toast('Demo estimates cannot be logged as foods you ate. Add a manual calorie entry instead.','error');return;}
      if(blocked){toast('Diary storage is unavailable.','error');return;}
      selected=localDay();resetForm();setView('diary');
      draft={name:result.dish.slice(0,160),calories:result.total.calories,source:'ai',nutrients:result.total,estimateNotes:result.portion_notes || ''};
      $('#diary-food').value=draft.name;$('#diary-calories').value=draft.calories;
      $('#diary-draft-note').textContent='Prefilled from your AI result. Check the calories for the amount you actually ate (the estimate may cover a whole recipe). Nothing is logged until you press Add entry. Choose another date above if needed.';
      $('#diary-draft-note').hidden=false;$('#diary-cancel-edit').hidden=false;
      $('#diary-calories').focus();
    },
  };
}
