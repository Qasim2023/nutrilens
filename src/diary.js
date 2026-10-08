import {formatDisplayText,withoutTextDashes} from "./interface-text.js";
import {demoAnalyze} from "./demo.js";
import {demoDiaryInput, demoDiaryStorage, waitForDemo} from "./demo-experience.js";
import {foodPicture} from './food-picture.js';
import {confirmDelete} from './delete-confirmation.js';
import { getLocale, translate } from "./i18n.js";
import { esc, fmt, ICONS, renderResult } from './render.js';
import { DIARY_KEY, MEALS, diaryThumbnail, diaryConfidence, localDay, validDay, shiftDay, createEntry, dayEntries, daySummary, cacheDiaryAnalysis, updateEntry, removeEntry, loadDiary, saveDiary } from './diary-store.js';

import { cleanEstimateNotes } from './estimate-notes.js';
import { resolveDiaryInput, resolveDiaryAnalysis } from "./diary-estimate.js";


export function renderDiaryThumbnail(entry, analysis = entry.analysis) {
  const photo = diaryThumbnail(entry.thumb);
  if (photo) return '<img class="diary-entry-image" src="' + esc(photo) + '" alt="Analysed food photo" width="56" height="56" loading="lazy" decoding="async">';
  if (!analysis && entry.name === 'Calorie entry') return '<div class="diary-entry-image diary-entry-placeholder" aria-hidden="true">' + ICONS.leaf + '</div>';
  const picture = foodPicture(analysis || {name: entry.name});
  return '<img class="diary-entry-image food-illustration" src="' + esc(picture.src) + '" alt="' + esc(picture.alt) + '" title="' + esc(picture.title) + '" data-food-theme="' + picture.theme + '" data-food-multiple="' + picture.multiple + '" width="56" height="56" loading="lazy" decoding="async">';
}

export function renderConfidenceBadge(value) {
  const confidence=diaryConfidence(value);
  const percent=confidence===null?null:Math.round(confidence*100);
  const level=percent===null?'unavailable':percent>=70?'high':percent>=40?'medium':'low';
  const label=percent===null?'Estimate confidence unavailable':percent+'% estimate confidence';
  return `<span class="diary-confidence diary-confidence-${level}">${esc(label)}</span>`;
}

export function renderDiaryConfidence(entry) {
  return entry.source==='ai' ? renderConfidenceBadge(entry.confidence) : '';
}

export function renderDiaryNutrition(entry, detail={}) {
  const analysis=entry.analysis || detail.analysis;
  if(analysis) return `<p class="diary-nutrition-note">${analysis.meta?.demo ? 'Sample nutrition for the demo diary — not a record of food you ate' : detail.saveFailed ? 'This analysis is not saved yet.' : 'Saved with this diary entry. Reopen it without analysing again.'}</p>
    ${detail.saveFailed ? '<button class="btn btn-sm" type="button" data-save-diary-nutrition="'+esc(entry.id)+'">Retry saving</button>' : ''}
    ${renderResult(analysis,{imageUrl:diaryThumbnail(entry.thumb),model:analysis.meta?.model,showMicros:true,showItems:true,showSwaps:true,showActions:false,isEstimate:Boolean(analysis.meta?.demo)})}`;
  if(detail.loading) return `<div class="diary-nutrition-status" role="status"><span class="spinner" aria-hidden="true"></span><span data-nutrition-status>${esc(detail.status || 'Analysing detailed nutrition…')}</span><button class="btn btn-sm" type="button" data-cancel-diary-nutrition>Cancel</button></div>`;
  if(detail.error) return `<div class="diary-warning" role="alert"><strong>Analysis failed</strong><p data-i18n-skip>${esc(formatDisplayText(translate(detail.error)))}</p><button class="btn btn-sm" type="button" data-retry-diary-nutrition="${esc(entry.id)}">Retry</button></div>`;
  return '';
}

export function initDiary({ toast, getSettings, isAnalysisBusy=()=>false, beginDemoUse=()=>null }) {
  const $ = selector=>document.querySelector(selector);
  let entries=[], selected=localDay(), editing=null, draft=null, blocked=false, view='analysis', pending=null;
  let expandedId=null, nutritionPending=null;
  const nutritionStates=new Map();
  let demoView=Boolean(getSettings().demoMode);
  const readEntries=()=>loadDiary(demoView ? demoDiaryStorage() : localStorage);
  const writeEntries=next=>saveDiary(next,demoView ? demoDiaryStorage() : localStorage);
  const form=$('#diary-form');
  const message=$('#diary-message');
  try { entries=readEntries(); } catch(error) { blocked=true; message.textContent=error.message; message.hidden=false; }
  const todayBadge=$('#diary-today-total');
  const caloriesLabel=n=>fmt(n,1);

  function setView(next) {
    if(!['analysis','diary','recipes'].includes(next))return;
    view=next;
    const panels={analysis:'#analysis-view',diary:'#diary-panel',recipes:'#recipes-panel'};
    for(const [name,selector] of Object.entries(panels)) {
      $(selector).hidden=next!==name;
      $('#view-'+name).setAttribute('aria-pressed',String(next===name));
    }
    if(next==='diary') render();
    if(next==='recipes') document.dispatchEvent(new Event('nutrilens:recipes-open'));
  }
  function resetForm() {
    if(pending)return;
    editing=null; draft=null; form.reset();
    $('#diary-save').textContent='Add entry';
    $('#diary-cancel-edit').hidden=true;
    $('#diary-draft-note').hidden=true;
  }
  function render() {
    for(const [id,detail] of nutritionStates) {
      const entry=entries.find(item=>item.id===id);
      if(!entry || entry.name!==detail.name || entry.calories!==detail.calories) {
        nutritionStates.delete(id);
        if(nutritionPending===id)pending?.abort();
      }
    }
    const expanded=entries.find(entry=>entry.id===expandedId);
    if(!expanded || !expanded.analysis && !nutritionStates.has(expandedId))expandedId=null;
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
      ${renderDiaryThumbnail(entry, entry.analysis || nutritionStates.get(entry.id)?.analysis)}
      <div class="diary-entry-description"><strong data-i18n-skip>${esc(withoutTextDashes(entry.name))}</strong><small>${esc(MEALS.find(([key])=>key===entry.meal)[1])} · ${entry.source==='ai'?'Estimated nutrition':'Manual entry'}</small>${entry.nutrients ? `<small>Protein ${fmt(entry.nutrients.protein_g,1)} g · Carbs ${fmt(entry.nutrients.carbs_g,1)} g · Fat ${fmt(entry.nutrients.fat_g,1)} g · Fibre ${fmt(entry.nutrients.fiber_g,1)} g · Sugar ${fmt(entry.nutrients.sugar_g,1)} g · Sodium ${fmt(entry.nutrients.sodium_mg)} mg</small>` : ""}${cleanEstimateNotes(entry.estimateNotes) ? `<details class="diary-estimate-details"><summary>Estimated portion</summary><p data-i18n-skip>${esc(formatDisplayText(cleanEstimateNotes(entry.estimateNotes)))}</p></details>` : ''}</div>
      <div class="diary-entry-calories">${caloriesLabel(entry.calories)}<small> kcal</small>${renderDiaryConfidence(entry)}</div>
      <div class="diary-entry-actions"><button class="btn btn-sm diary-detail-button" type="button" data-analyse-diary="${esc(entry.id)}" aria-label="Detailed nutrition for ${esc(entry.name)}" aria-expanded="${expandedId===entry.id}" aria-controls="diary-nutrition-${esc(entry.id)}">Detailed nutrition</button><button class="icon-btn" type="button" data-edit-entry="${esc(entry.id)}" aria-label="Edit ${esc(entry.name)}" title="Edit entry">${ICONS.edit}</button><button class="icon-btn" type="button" data-remove-entry="${esc(entry.id)}" aria-label="Delete ${esc(entry.name)}" title="Delete entry">${ICONS.trash}</button></div>
      <section class="diary-nutrition" id="diary-nutrition-${esc(entry.id)}" data-diary-nutrition="${esc(entry.id)}" aria-label="Detailed nutrition for ${esc(entry.name)}" ${expandedId===entry.id?'':'hidden'}>
        ${expandedId===entry.id ? '<div class="diary-nutrition-heading"><h3>Detailed nutrition</h3><button class="icon-btn" type="button" data-close-diary-nutrition="'+esc(entry.id)+'" aria-label="Close detailed nutrition">'+ICONS.x+'</button></div>'+renderDiaryNutrition(entry,nutritionStates.get(entry.id)) : ''}
      </section>
    </article>`).join('') : '<div class="diary-empty"><span>'+ICONS.diary+'</span><h3>No foods logged for this day</h3><p>Enter a food and leave calories blank for an estimate, add a calorie-only amount, or log an analysed meal.</p></div>';
    $('#diary-clear').disabled=!items.length || blocked || !!pending;
    for(const control of form.elements) control.disabled=blocked || !!pending;
    for(const control of document.querySelectorAll('#diary-date, #diary-prev, #diary-next, [data-edit-entry], [data-remove-entry], [data-analyse-diary]')) control.disabled=!!pending || blocked;
    $('#diary-today').disabled=!!pending || selected===localDay();
    for(const button of document.querySelectorAll('[data-analyse-diary]')) button.addEventListener('click',()=>{
      if(pending)return;
      if(expandedId===button.dataset.analyseDiary)closeNutrition(expandedId);
      else openNutrition(button.dataset.analyseDiary);
    });
    for(const button of document.querySelectorAll('[data-close-diary-nutrition]')) button.addEventListener('click',()=>closeNutrition(button.dataset.closeDiaryNutrition));
    for(const button of document.querySelectorAll('[data-retry-diary-nutrition]')) button.addEventListener('click',()=>openNutrition(button.dataset.retryDiaryNutrition));
    for(const button of document.querySelectorAll('[data-cancel-diary-nutrition]')) button.addEventListener('click',()=>pending?.abort());
    for(const button of document.querySelectorAll('[data-save-diary-nutrition]')) button.addEventListener('click',()=>{
      const entry=entries.find(item=>item.id===button.dataset.saveDiaryNutrition),detail=nutritionStates.get(entry?.id);
      if(entry && detail?.analysis){detail.saveFailed=!rememberAnalysis(entry,detail.analysis);render();}
    });
    for(const button of document.querySelectorAll('[data-edit-entry]')) button.addEventListener('click',()=>edit(button.dataset.editEntry));
    for(const button of document.querySelectorAll('[data-remove-entry]')) button.addEventListener('click',async()=>{
      const item=entries.find(e=>e.id===button.dataset.removeEntry);
      if(!item || !await confirmDelete({title:'Delete diary meal?',subject:item.name,detail:caloriesLabel(item.calories)+' kcal · '+item.date,message:'This meal will be removed from your diary and the daily calorie total will be updated. Your saved analyses will be kept.',confirmLabel:'Delete meal',fallbackFocus:'#diary-food'})) return;
      if(commit(removeEntry(entries,item.id))) { if(editing===item.id)resetForm(); toast('Entry deleted. Daily total updated.','success'); $('#diary-food').focus(); }
    });
  }
  function nutritionButton(id) {
    return [...document.querySelectorAll('[data-analyse-diary]')].find(button=>button.dataset.analyseDiary===id);
  }
  function closeNutrition(id) {
    if(nutritionPending===id)pending?.abort();
    expandedId=null;render();nutritionButton(id)?.focus({preventScroll:true});
  }
  function rememberAnalysis(context,result) {
    try {
      const current=readEntries(), next=cacheDiaryAnalysis(current,context,result);
      return next!==current && commit(next);
    } catch(error) { toast(error.message,'error'); return false; }
  }
  async function openNutrition(id) {
    if(pending)return;
    const entry=entries.find(item=>item.id===id);if(!entry)return;
    if(!entry.analysis && !nutritionStates.get(id)?.analysis && isAnalysisBusy()){toast("Finish the current request first.");return;}
    expandedId=id;
    if(entry.analysis || nutritionStates.get(id)?.analysis){render();nutritionButton(id)?.focus({preventScroll:true});return;}
    if(demoView) {
      nutritionStates.set(id,{analysis:demoAnalyze(entry.name,false),name:entry.name,calories:entry.calories});
      render();nutritionButton(id)?.focus({preventScroll:true});return;
    }
    const controller=new AbortController();pending=controller;nutritionPending=id;
    const detail={name:entry.name,calories:entry.calories,loading:true,status:'Analysing detailed nutrition…'};
    nutritionStates.set(id,detail);render();
    document.getElementById('diary-nutrition-'+id)?.querySelector('[data-cancel-diary-nutrition]')?.focus({preventScroll:true});
    let restoreNutritionFocus=false;
    try {
      detail.analysis=await resolveDiaryAnalysis({entry,settings:{...getSettings()},signal:controller.signal,onStatus:status=>{
        detail.status=status;
        const panel=document.getElementById('diary-nutrition-'+id);
        const statusLabel=panel?.querySelector('[data-nutrition-status]');
        if(statusLabel)statusLabel.textContent=status;
      }});
      if(controller.signal.aborted)return;
      restoreNutritionFocus=document.activeElement?.closest('[data-diary-nutrition]')?.dataset.diaryNutrition===id;
      detail.saveFailed=!rememberAnalysis(entry,detail.analysis);
    } catch(error) {
      detail.error=error.name==='AbortError' ? 'Analysis cancelled. Your diary has not been changed.' : error.message;
    } finally {
      const restoreFocus=restoreNutritionFocus || document.activeElement?.closest('[data-diary-nutrition]')?.dataset.diaryNutrition===id || document.activeElement===nutritionButton(id);
      detail.loading=false;pending=null;nutritionPending=null;render();
      // Only restore focus from controls replaced inside this nutrition panel.
      if(restoreFocus)nutritionButton(id)?.focus({preventScroll:true});
    }
  }
  function commit(next) {
    if(blocked) { toast('Diary storage is unavailable.','error'); return false; }
    try { writeEntries(next); entries=next; message.hidden=true; render(); document.dispatchEvent(new CustomEvent('nutrilens:diary-changed')); return true; }
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
    let demoInput=null, demoTicket=null;
    if(demoView) {
      try { demoInput=demoDiaryInput(input); }
      catch(error) { message.textContent=error.message;message.hidden=false;toast(error.message,'error');return; }
      if(!editId) { demoTicket=beginDemoUse('diary');if(!demoTicket)return; }
    }
    const controller=new AbortController();
    pending=controller;
    $('#diary-save').textContent=needsEstimate?'Estimating…':'Saving…';
    $('#diary-estimating').hidden=!needsEstimate;
    $('#diary-estimate-status').textContent='Estimating calories for your food…';
    message.hidden=true;render();
    let saved=false;
    try {
      let resolved;
      if(demoInput) { await waitForDemo(controller.signal); resolved=demoInput; }
      else resolved=await resolveDiaryInput({input,settings:{...getSettings()},original,signal:controller.signal,onStatus:status=>{$('#diary-estimate-status').textContent=status;}});
      if(controller.signal.aborted)return;
      // Keep a completed estimate in the form if saving fails; retry will not make a second AI call.
      if(needsEstimate){$('#diary-calories').value=resolved.calories;draft=resolved;}
      const current=readEntries();
      const next=editId ? updateEntry(current,editId,resolved) : [...current,createEntry(resolved)];
      saved=commit(next);
      if(saved)toast(demoInput ? 'Sample meal added to the demo diary' : needsEstimate?'Calories estimated and logged. Daily total updated.':editId?'Entry updated. Daily total recalculated.':'Food logged. Daily total updated.','success');
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
      if(saved)demoTicket?.complete();else demoTicket?.release();
    }
  });
  $('#diary-cancel-estimate').addEventListener('click',()=>pending?.abort());
  $('#diary-date').addEventListener('change',event=>changeDate(event.target.value));
  $('#diary-prev').addEventListener('click',()=>{try{changeDate(shiftDay(selected,-1));}catch(error){toast(error.message,'error');}});
  $('#diary-next').addEventListener('click',()=>{try{changeDate(shiftDay(selected,1));}catch(error){toast(error.message,'error');}});
  $('#diary-today').addEventListener('click',()=>changeDate(localDay()));
  $('#diary-cancel-edit').addEventListener('click',resetForm);
  $('#diary-clear').addEventListener('click',async()=>{
    const day=selected, count=dayEntries(entries,day).length;
    if(!count || pending || blocked)return;
    if(await confirmDelete({title:'Clear this day?',subject:count+' '+(count===1?'entry logged':'entries logged'),detail:day,subjectIsFood:false,message:'All meals for this day will be deleted and its calorie total will reset. Other days and saved analyses will be kept.',confirmLabel:'Clear this day',fallbackFocus:'#diary-food'}) && commit(entries.filter(e=>e.date!==day))){resetForm();toast('Selected day cleared.','success');$('#diary-food').focus();}
  });
  $('#view-analysis').addEventListener('click',()=>setView('analysis'));
  $('#view-diary').addEventListener('click',()=>setView('diary'));
  $('#view-recipes').addEventListener('click',()=>setView('recipes'));
  $('#diary-analyse-food').addEventListener('click',()=>{setView('analysis');$('#input').focus();});
  function reload() {
    try {
      entries=readEntries();blocked=false;message.hidden=true;
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
    cancel:()=>pending?.abort(),
    refreshMode() {
      const next=Boolean(getSettings().demoMode);
      if(next===demoView){render();return;}
      pending?.abort();demoView=next;editing=null;draft=null;expandedId=null;nutritionStates.clear();blocked=false;
      form.reset();$('#diary-cancel-edit').hidden=true;$('#diary-draft-note').hidden=true;$('#diary-save').textContent='Add entry';
      try { entries=readEntries();message.hidden=true; }
      catch(error) { entries=[];blocked=true;message.textContent=error.message;message.hidden=false; }
      render();
    },
    refreshLanguage:()=>render(),
    rememberAnalysis,
    showNutrition(id) {
      if(pending)return;
      const entry=entries.find(item=>item.id===id);if(!entry)return;
      if(entry.date!==selected){changeDate(entry.date);if(entry.date!==selected)return;}
      setView('diary');return openNutrition(id);
    },
    showAnalysis:()=>setView('analysis'),
    showRecipes:()=>setView('recipes'),
    prepareResult(result, {thumb = null} = {}) {
      if(pending){toast('Finish or cancel the current calorie estimate first.');return;}
      if(!result)return;
      if(result.meta?.demo){toast('Demo estimates cannot be logged as foods you ate. Add a manual calorie entry instead.','error');return;}
      if(blocked){toast('Diary storage is unavailable.','error');return;}
      selected=localDay();resetForm();setView('diary');
      draft={analysis:result,thumb,name:result.dish.slice(0,160),calories:result.total.calories,source:'ai',confidence:diaryConfidence(result.confidence),nutrients:result.total,estimateNotes:result.portion_notes || ''};
      $('#diary-food').value=draft.name;$('#diary-calories').value=draft.calories;
      $('#diary-draft-note').textContent='Prefilled from your nutrition analysis. Check the calories for the amount you actually ate (the estimate may cover a whole recipe). Nothing is logged until you press Add entry. Choose another date above if needed.';
      $('#diary-draft-note').hidden=false;$('#diary-cancel-edit').hidden=false;
      $('#diary-calories').focus();
    },
  };
}
