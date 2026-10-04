/* ==========================================================================
   NutriLens — app controller
   ========================================================================== */

import { LANGUAGES, initLocalization, setLanguage, getLocale } from "./i18n.js";
import { endpointUrl, PRESETS, MODEL_SUGGESTIONS, analyzeFood, testConnection, listModels } from "./ai.js";
import { defaults, loadSettings, saveSettings, resetSettings, loadSession, saveSession } from "./store.js";
import { esc, fmt, ICONS, renderResult, renderLoading, renderError, resultToMarkdown, resultToCsv } from "./render.js";
import { compressImage, makeThumbnail, formatBytes } from "./image.js";
import { demoAnalyze } from "./demo.js";
import { readAttachment, fitsAttachmentBudget, MAX_ATTACHMENTS } from "./attachments.js";
import { shouldAnalyzeOnEnter } from "./keyboard.js";
import { initDiary } from "./diary.js";
import { createHistoryRepository } from "./history-store.js";
import { initMealLibrary, diaryAnalysisSelection, diaryRequestText } from "./meal-library.js";
let diary, mealLibrary;
let historyChannel;
const historyRepository = createHistoryRepository({ notify: () => { historyChannel?.postMessage('changed'); mealLibrary?.refresh(); } });

/* -------------------------------------------------------------------------- */
/* State                                                                       */

const state = {
  settings: loadSettings(),
  image: null,          // { dataUrl, name, size, bytes, width, height }
  attachments: [],
  readingAttachments: false,
  busy: false,
  controller: null,
  last: null,           // last successful result
  lastImageUrl: null,
  lastInput: null,
  lastRenderOptions: null,
  lastSavedEntry: null,
  viewingSaved: false,
  diaryContext: null,
  recording: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* -------------------------------------------------------------------------- */
/* Theme                                                                       */

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.dataset.accent = state.settings.accent;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = state.settings.theme === "light" ? "#f5f7fa" : "#070a0f";
  const btn = $("#theme-toggle");
  if (btn) {
    btn.innerHTML = state.settings.theme === "light" ? ICONS.moon : ICONS.sun;
    btn.setAttribute("aria-label", state.settings.theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */

function toast(message, kind = "info", ms = 4200) {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `${kind === "error" ? ICONS.alert : kind === "success" ? ICONS.check : ICONS.info}<span>${esc(message)}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 320);
  }, ms);
}
/* -------------------------------------------------------------------------- */
/* Image handling                                                              */

async function setImage(file, autoAnalyze = true) {
  if (!file || state.busy) return;
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) return toast("Choose an image up to 12 MB.", "error");
  try {
    const compress = state.settings.compressImages;
    let result;
    if (compress) {
      result = await compressImage(file, state.settings.maxImageDim || 1280, 0.85);
    } else {
      const { readFileAsDataUrl } = await import("./image.js");
      const dataUrl = await readFileAsDataUrl(file);
      result = { dataUrl, width: 0, height: 0, bytes: file.size };
    }
    state.image = { dataUrl: result.dataUrl, name: file.name || "photo", bytes: result.bytes, width: result.width, height: result.height };
    renderPreview();
    state.diaryContext=null;renderAnalysisOrigin();
    if (autoAnalyze && state.settings.autoAnalyze && !state.readingAttachments) runAnalysis();
  } catch (err) {
    toast(err.message || "Could not load that image.", "error");
  }
}

function clearImage() {
  if (state.busy || state.readingAttachments) return;
  state.image = null;
  const input = $("#file-input");
  if (input) input.value = "";
  renderPreview();
}

function renderPreview() {
  const host = $("#preview-slot");
  const textarea = $("#input");
  if (!host) return;
  if (!state.image) {
    host.innerHTML = "";
    textarea.style.minHeight = "62px";
    return;
  }
  host.innerHTML = `<div class="preview-row">
    <div class="preview">
      <img src="${state.image.dataUrl}" alt="Selected food photo">
      <button class="remove" type="button" id="remove-image" aria-label="Remove photo">${ICONS.x}</button>
    </div>
    <div class="preview-meta">
      <div class="fname">${esc(state.image.name)}</div>
      <div class="fsize">${formatBytes(state.image.bytes)}${state.image.width ? ` · ${state.image.width}×${state.image.height}` : ""}</div>
      <div class="hint">Add details like portion size, brand or ingredients to sharpen the estimate — then press Analyse.</div>
    </div>
  </div>`;
  textarea.style.minHeight = "52px";
  $("#remove-image")?.addEventListener("click", clearImage);
}
/* -------------------------------------------------------------------------- */
/* Analysis                                                                    */

// Recipe attachments remain in memory and are only sent to AI on Analyse.
function renderAttachments() {
  const host = $("#attachments-slot");
  host.innerHTML = state.attachments.map(a => `<article class="recipe-attachment" data-attachment-id="${esc(a.id)}">
    <div class="attachment-icon">${ICONS.recipe}</div>
    <div class="attachment-details"><div class="attachment-name">${esc(a.name)}</div>
      <div class="attachment-meta">${esc(a.type.toUpperCase())} · ${formatBytes(a.size)} · ${fmt(a.text.length)} characters${a.pages ? ' · '+a.pages+' pages' : ''} · Ready</div>
      <details><summary>Preview extracted text</summary><pre>${esc(a.text.slice(0,700))}${a.text.length > 700 ? '\n… (preview only; full text is included in analysis)' : ''}</pre></details>
    </div>
    <button class="icon-btn remove-attachment" type="button" data-remove-attachment="${esc(a.id)}" aria-label="Remove ${esc(a.name)}" ${state.busy || state.readingAttachments ? 'disabled' : ''}>${ICONS.x}</button>
  </article>`).join('') + (state.readingAttachments ? '<div class="attachment-reading"><span class="spinner"></span> Reading attachments locally…</div>' : '');
  $$("[data-remove-attachment]").forEach(button => button.addEventListener('click', () => {
    if (state.busy || state.readingAttachments) return;
    state.attachments = state.attachments.filter(a => a.id !== button.dataset.removeAttachment);
    renderAttachments();
  }));
}

async function addFiles(files) {
  if (state.busy || state.readingAttachments || !files.length) return;
  state.diaryContext=null;renderAnalysisOrigin();
  state.readingAttachments = true;
  setBusyUI(false);
  renderAttachments();
  let added = 0, photos = 0, documents = 0;
  try {
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        if (photos++) { toast('One food photo at a time is supported. Additional photos were not added.', 'error'); continue; }
        await setImage(file, false);
        continue;
      }
      documents++;
      try {
        if (state.attachments.length >= MAX_ATTACHMENTS) throw new Error('Up to 5 recipe files are supported. Remove an attachment to add another.');
        if (state.attachments.some(a => a.name === file.name && a.size === file.size)) throw new Error('This file is already attached.');
        const recipe = await readAttachment(file);
        fitsAttachmentBudget(state.attachments, recipe);
        state.attachments.push(recipe);
        added++;
        renderAttachments();
      } catch (error) { toast(file.name + ': ' + error.message, 'error', 7000); }
    }
  } finally {
    state.readingAttachments = false;
    $("#attachment-input").value = '';
    setBusyUI(false);
    renderAttachments();
  }
  if (added) toast(added + ' recipe file' + (added === 1 ? '' : 's') + ' ready. Press Enter or Analyse to include the extracted text.', 'success');
  if (photos && !documents && !state.attachments.length && state.settings.autoAnalyze) runAnalysis();
}

function currentSettings() {
  return { ...state.settings };
}

function hasRemoteModel() {
  const s = state.settings;
  return !s.demoMode && !!s.baseUrl && !!s.model && (s.auth === "none" || !!s.apiKey.trim());
}

function refreshResult() {
  if (!state.last || state.busy || state.viewingSaved) return;
  state.lastRenderOptions = { ...state.lastRenderOptions, showMicros: state.settings.showMicros, showItems: state.settings.showItems, showSwaps: state.settings.showSwaps };
  $("#result").innerHTML = renderResult(state.last, state.lastRenderOptions);
  wireResultActions();
}

function renderAnalysisOrigin() {
  const host=$("#analysis-origin");
  const context=state.diaryContext;
  host.hidden=!context;
  if(context)host.innerHTML='<span>'+esc('Diary meal: '+context.name)+'</span><small>The diary is unchanged. Press Analyse for a detailed breakdown of this description.</small><button class="btn btn-ghost btn-sm" type="button" id="detach-diary">Unlink</button>';
  $("#detach-diary")?.addEventListener('click',()=>{state.diaryContext=null;renderAnalysisOrigin();});
}

function prepareAnalysis(input, label) {
  if(state.busy || state.readingAttachments){toast('Finish the current request first.');return false;}
  if((state.image || state.attachments.length) && !confirm('Replace the current photo and recipe attachments with this selected meal?'))return false;
  diary.showAnalysis();
  state.image=input.image ? structuredClone(input.image) : null;
  state.attachments=(input.attachments || []).map(a=>({...a,id:crypto.randomUUID()}));
  state.diaryContext=input.diaryContext ? structuredClone(input.diaryContext) : null;
  $("#input").value=input.text || '';
  renderPreview();renderAttachments();renderAnalysisOrigin();autoGrow();
  saveSession({text:$("#input").value});
  $("#input").focus();$("#composer").scrollIntoView({behavior:'smooth',block:'center'});
  toast(label || 'Meal loaded. Press Analyse or Enter to make a new detailed estimate.');
  return true;
}

function selectDiaryMeal(entry) {
  try {const selection=diaryAnalysisSelection(entry);prepareAnalysis({text:selection.text,diaryContext:selection.diaryContext},'Diary meal loaded. Press Analyse to get its full nutritional breakdown.');}
  catch(error){toast(error.message,'error');}
}

function displaySavedAnalysis(entry) {
  if(state.busy || state.readingAttachments){toast('Finish the current request first.');return;}
  diary.showAnalysis();state.last=structuredClone(entry.result);state.lastImageUrl=entry.view.imageUrl;
  state.lastRenderOptions=structuredClone(entry.view);state.lastInput=structuredClone(entry.input);
  state.lastSavedEntry=entry;state.viewingSaved=true;
  $("#result").innerHTML=renderResult(state.last,state.lastRenderOptions);
  $("#saved-analysis-banner").hidden=false;
  $("#saved-analysis-banner").innerHTML='<div><strong>'+esc('Saved analysis · '+new Date(entry.when).toLocaleString())+'</strong><small>'+esc(entry.legacy ? 'Imported original result. Older records may have only a thumbnail or lack recipe input. Viewing does not call AI.' : 'Original full result restored. Viewing uses no AI and never changes or removes this record.')+'</small></div><button class="btn btn-sm" type="button" id="saved-reanalyse">Analyse again</button>';
  $("#saved-reanalyse").addEventListener('click',()=>prepareSavedAnalysis(entry));
  $("#history-save-status").hidden=true;
  wireResultActions();mealLibrary?.setActive(entry.id);
  $("#saved-analysis-banner").scrollIntoView({behavior:'smooth',block:'start'});
}

function prepareSavedAnalysis(entry) {
  const input=structuredClone(entry.input);
  if(!input.text && !input.image && !input.attachments.length)input.text=entry.dish;
  if(prepareAnalysis(input,'Previous meal loaded. Press Analyse for a NEW saved result; the original remains in Previous analyses.')) {
    if(entry.legacy && entry.result.meta?.attachments?.length && !input.attachments.length)toast('Older history did not store recipe text. Reattach those recipes for an accurate re-analysis.','info',6500);
  }
}

async function saveLastAnalysis() {
  if(!state.last || state.last.meta?.demo || !state.lastSavedEntry)return;
  const entry=state.lastSavedEntry;
  const host=$("#history-save-status");
  host.hidden=false;host.textContent='Saving full analysis…';
  try {
    await historyRepository.put(entry);
    if(state.lastSavedEntry?.id===entry.id){host.textContent='Saved to Previous analyses. The full result remains available after refresh.';host.classList.remove('save-failed');}
    mealLibrary?.setActive(entry.id);
    // Ask the browser to protect this site's data from automatic eviction where supported.
    Promise.resolve(navigator.storage?.persist?.()).catch(()=>{});
  }catch(error){
    if(state.lastSavedEntry?.id===entry.id){host.classList.add('save-failed');host.innerHTML='<span>'+esc(error.message)+'</span><button class="btn btn-sm" type="button" id="retry-history-save">Retry saving</button>';$('#retry-history-save').addEventListener('click',saveLastAnalysis);}
    toast(error.message,'error',7500);
  }
}

async function runAnalysis() {
  if (state.busy) return;
  if (state.readingAttachments) { toast("Wait for your files to finish reading before analysing."); return; }
  const text = $("#input").value.trim();
  if (!text && !state.image && !state.attachments.length) {
    toast("Add a photo, attach a recipe, or describe your food first.", "error");
    // Nudge the composer.
    $("#input").focus();
    return;
  }

  if (state.settings.demoMode && state.attachments.length) { toast("Turn off Demo mode in Settings to analyse real recipe attachments.", "error"); openDrawer(); return; }
  if (!state.settings.demoMode) {
    try {
      endpointUrl(state.settings.baseUrl, state.settings.provider);
      if (!state.settings.model.trim()) throw new Error("Choose a model with Fetch available models in Settings first.");
      if (state.settings.auth !== "none" && !state.settings.apiKey.trim()) throw new Error("This endpoint requires an API key. Enter it in Settings, not in chat.");
    } catch (error) { toast(error.message, "error"); openDrawer(); return; }
  }
  const image = state.image;
  const originalInput = { text, image: image ? structuredClone(image) : null, attachments: state.attachments.map(a=>({name:a.name,text:a.text,type:a.type,size:a.size,pages:a.pages})), diaryContext: state.diaryContext ? structuredClone(state.diaryContext) : null };
  const requestText = diaryRequestText(text, originalInput.diaryContext);
  const attachments = state.attachments.map(a => ({ name: a.name, text: a.text }));
  state.controller = new AbortController();
  const resultHost = $("#result");
  state.busy = true;
  $("#saved-analysis-banner").hidden=true;
  $("#history-save-status").hidden=true;
  setBusyUI(true);
  resultHost.innerHTML = renderLoading(state.image ? "Analysing your photo…" : "Analysing your description…");
  resultHost.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const settings = currentSettings();
  const useDemo = Boolean(settings.demoMode);

  try {
    let result;
    if (useDemo) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 650);
        state.controller.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }, { once: true });
      });
      result = demoAnalyze(text, Boolean(image));
    } else {
      result = await analyzeFood({
        text: requestText,
        attachments,
        imageDataUrl: image ? image.dataUrl : null,
        settings,
        onStatus: (s) => {
          const el = $(".loading-status span:last-child", resultHost);
          if (el) el.textContent = s;
        },
        signal: state.controller.signal,
      });
    }

    state.last = result;
    state.lastImageUrl = image ? image.dataUrl : null;
    state.lastInput = originalInput;state.viewingSaved=false;
    state.lastRenderOptions = {imageUrl:state.lastImageUrl,model:useDemo ? null : settings.model,showMicros:settings.showMicros,showItems:settings.showItems,showSwaps:settings.showSwaps,isEstimate:useDemo};
    resultHost.innerHTML = renderResult(result,state.lastRenderOptions);
    wireResultActions();saveSession({text});
    if(!result.meta?.demo) {
      const thumb=image ? await makeThumbnail(image.dataUrl) : null;
      state.lastSavedEntry={version:2,id:crypto.randomUUID(),when:Date.now(),dish:result.dish,model:settings.model,thumb,text,input:originalInput,result:structuredClone(result),view:structuredClone(state.lastRenderOptions)};
      await saveLastAnalysis();
    } else state.lastSavedEntry=null;
    if (useDemo) toast("Demo estimate shown. Add an API key in Settings for real AI analysis.", "info", 6000);
  } catch (err) {
    if (err?.name === "AbortError") {
      resultHost.innerHTML = `<div class="card"><div class="empty"><p>Analysis cancelled. Your photo and description are still available.</p></div></div>`;
      toast("Analysis cancelled.");
    } else {
      resultHost.innerHTML = renderError(err?.message || "Something went wrong.");
      wireResultActions();
    }
  } finally {
    state.busy = false;
    state.controller = null;
    setBusyUI(false);
  }
}

function setBusyUI(busy) {
  const send = $("#send-btn");
  const cancel = $("#cancel-btn");
  if (send) {
    send.disabled = busy || state.readingAttachments;
    const label = $(".send-label", send);
    if (label) label.textContent = busy ? "Analysing…" : state.readingAttachments ? "Reading files…" : "Analyse";
  }
  if (cancel) cancel.hidden = !busy;
  $$("[data-example], #mic-btn, #history-btn, #remove-image, #attach-btn, .remove-attachment").forEach(button => { button.disabled = busy || state.readingAttachments; });
  $("#photo-btn").disabled = busy || state.readingAttachments;
  $("#input").readOnly = busy;
}
/* -------------------------------------------------------------------------- */
/* Result actions                                                              */

function wireResultActions() {
  $$('#result [data-action]').forEach((btn) => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      if (action === "open-settings") openDrawer();
      else if (action === "retry") runAnalysis();
      else if (action === "copy") copyResult();
      else if (action === "download-md") exportResult("md");
      else if (action === "download-csv") exportResult("csv");
      else if (action === "print") window.print();
      else if (action === "log-diary") diary.prepareResult(state.last);
      else if (action === "analyse-again" && state.lastInput) prepareSavedAnalysis(state.lastSavedEntry || {input:state.lastInput,dish:state.last.dish,result:state.last});
    };
  });
}

async function copyResult() {
  if (!state.last) return;
  const md = resultToMarkdown(state.last, { model: state.last.meta?.model });
  try {
    await navigator.clipboard.writeText(md);
    toast("Copied the nutrition summary.", "success");
  } catch (_) {
    toast("Clipboard is blocked in this context — use Export instead.", "error");
  }
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function slug(s) { return String(s || "nutrition").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "nutrition"; }

function exportResult(kind) {
  if (!state.last) return;
  const name = slug(state.last.dish);
  if (kind === "md") download(`${name}.md`, resultToMarkdown(state.last, { model: state.last.meta?.model }), "text/markdown");
  else download(`${name}.csv`, resultToCsv(state.last), "text/csv");
  toast(`Exported ${name}.${kind}`, "success");
}

function resultActionsHtml() {
  return `<div class="result-actions">
    <button class="btn btn-sm" data-action="copy">${ICONS.copy} Copy summary</button>
    <button class="btn btn-sm" data-action="download-md">${ICONS.download} Markdown</button>
    <button class="btn btn-sm" data-action="download-csv">${ICONS.download} CSV</button>
    <button class="btn btn-sm" data-action="print">${ICONS.print} Print</button>
  </div>`;
}
/* -------------------------------------------------------------------------- */
/* Settings drawer                                                             */

let drawerReturnFocus;
function openDrawer() {
  mealLibrary?.close();
  drawerReturnFocus = document.activeElement;
  $("#drawer").inert = false;
  $(".app").inert = true;
  $("#drawer").classList.add("open");
  $("#scrim").classList.add("open");
  $("#drawer").setAttribute("aria-hidden", "false");
  syncDrawer();
  $("#close-drawer").focus();
}
function closeDrawer() {
  $("#drawer").inert = true;
  $(".app").inert = false;
  drawerReturnFocus?.focus();
  $("#drawer").classList.remove("open");
  $("#scrim").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
}

function syncDrawer() {
  const s = state.settings;
  setValue("#set-language", s.language);
  setValue("#set-provider", s.provider);
  setValue("#set-baseurl", s.baseUrl);
  setValue("#set-apiformat", s.apiFormat);
  setValue("#set-transport", s.transport);
  setToggle("#set-demo", s.demoMode);
  $("#temperature-out").textContent = Number(s.temperature).toFixed(1);
  updateEndpointPreview();
  setValue("#set-model", s.model);
  setValue("#set-apikey", s.apiKey);
  setValue("#set-keyheader", s.keyHeader);
  setValue("#set-extra", s.extraHeaders);
  setValue("#set-temperature", String(s.temperature));
  setValue("#set-maxtokens", String(s.maxTokens));
  setToggle("#set-jsonmode", s.jsonMode);
  setToggle("#set-autanalyze", s.autoAnalyze);
  setToggle("#set-compress", s.compressImages);
  setToggle("#set-micros", s.showMicros);
  setToggle("#set-items", s.showItems);
  setToggle("#set-swaps", s.showSwaps);
  setToggle("#set-keyvisible", false);
  $$("#auth-seg [data-auth]").forEach((b) => b.classList.toggle("active", b.dataset.auth === s.auth));
  $$("#theme-seg [data-theme-pick]").forEach((b) => b.classList.toggle("active", b.dataset.themePick === s.theme));
  $$("#accent-row [data-accent-pick]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.accentPick === s.accent)));
  updateModelSuggestions();
  updateKeyVisibility();
  updateProviderHint();
}

function setValue(sel, v) { const el = $(sel); if (el) el.value = v ?? ""; }
function setToggle(sel, on) { const el = $(sel); if (el) el.setAttribute("aria-checked", String(Boolean(on))); }

function updateModelSuggestions() {
  const list = MODEL_SUGGESTIONS[state.settings.provider] || [];
  const dl = $("#model-options");
  if (dl) dl.innerHTML = list.map((m) => `<option value="${esc(m)}"></option>`).join("");
}

function updateProviderHint() {
  const p = state.settings.provider;
  const preset = PRESETS[p] || PRESETS.custom;
  const hint = $("#provider-hint");
  if (!hint) return;
  const bits = [];
  if (preset.auth === "none") bits.push("This provider normally runs locally and needs no API key.");
  if (p === "custom") bits.push("Any OpenAI-compatible <code>/chat/completions</code> endpoint works.");
  if (p === "azure") bits.push("Replace the resource and deployment placeholders in the base URL. An <code>api-version</code> query is appended automatically.");
  if (p === "openrouter") bits.push("Use <code>openrouter.ai/api/v1</code>; vision models start with e.g. <code>openai/gpt-4o</code>.");
  if (!bits.length) bits.push("Fetch your provider’s model list, select a model, then test the connection.");
  hint.innerHTML = bits.join(" ");
}

function updateKeyVisibility() {
  const input = $("#set-apikey");
  if (input) input.type = $("#set-keyvisible")?.getAttribute("aria-checked") === "true" ? "text" : "password";
}

function applyProviderPreset(id) {
  const preset = PRESETS[id];
  if (!preset) return;
  const previousModel = state.settings.model;
  const wasSuggested = (MODEL_SUGGESTIONS[state.settings.provider] || []).includes(previousModel);
  state.settings.provider = id;
  if (preset.baseUrl) state.settings.baseUrl = preset.baseUrl;
  state.settings.auth = preset.auth;
  state.settings.keyHeader = preset.keyHeader;
  if (!previousModel || wasSuggested) state.settings.model = (MODEL_SUGGESTIONS[id] || [])[0] || "";
  state.settings.apiFormat = "auto";
  state.settings.demoMode = false;
  $("#available-models").hidden = true;
  persist();
  syncDrawer();
}

function persist() {
  setLanguage(state.settings.language);
  saveSettings(state.settings);
  applyTheme();
  updateEndpointPreview();
  updateComposerHint();
}
/* -------------------------------------------------------------------------- */
/* History                                                                     */

/* -------------------------------------------------------------------------- */
/* Speech input                                                                */
/* -------------------------------------------------------------------------- */

function toggleSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast("Speech input is not supported in this browser.", "error"); return; }
  const btn = $("#mic-btn");
  if (state.recording) {
    state.recording.stop();
    return;
  }
  const rec = new SR();
  rec.lang = getLocale();
  rec.interimResults = true;
  rec.continuous = false;
  let base = $("#input").value;
  rec.onstart = () => { state.recording = rec; btn.classList.add("recording"); };
  rec.onresult = (e) => {
    let text = "";
    for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
    $("#input").value = (base ? base + " " : "") + text;
    autoGrow();
  };
  rec.onerror = (e) => toast(`Speech input error: ${e.error}`, "error");
  rec.onend = () => { state.recording = null; btn.classList.remove("recording"); };
  rec.start();
}
/* -------------------------------------------------------------------------- */
/* Events                                                                      */

function autoGrow() {
  const ta = $("#input");
  if (!ta) return;
  ta.style.height = "auto";
  ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
}

function wireEvents() {
  // Composer
  $("#send-btn").addEventListener("click", runAnalysis);
  $("#cancel-btn").addEventListener("click", () => state.controller?.abort());
  $("#photo-btn").addEventListener("click", () => $("#file-input").click());
  $("#file-input").addEventListener("change", (e) => addFiles(e.target.files));
  $("#attach-btn").addEventListener("click", () => $("#attachment-input").click());
  $("#attachment-input").addEventListener("change", (e) => addFiles(e.target.files));
  $("#mic-btn").addEventListener("click", toggleSpeech);

  const ta = $("#input");
  ta.addEventListener("input", () => { autoGrow(); saveSession({ text: ta.value }); });
  ta.addEventListener("keydown", (e) => {
    if (shouldAnalyzeOnEnter(e)) { e.preventDefault(); runAnalysis(); }
  });

  // Drag & drop + paste
  const zone = $("#composer");
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || e.relatedTarget === null) zone.classList.remove("dragover"); }));
  zone.addEventListener("drop", (e) => {
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) addFiles(files); else toast("Drop a food photo or recipe document.", "error");
  });
  document.addEventListener("paste", (e) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
    if (item) { const f = item.getAsFile(); if (f) { addFiles([f]); toast("Photo pasted.", "success"); } }
  });

  // Theme
  $("#theme-toggle").addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    persist();
  });

  // Drawer
  $("#settings-btn").addEventListener("click", openDrawer);
  $("#close-drawer").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#drawer").classList.contains("open")) closeDrawer();
    if (e.key === "Tab" && $("#drawer").classList.contains("open")) {
      const nodes = $$("button, input, select, textarea, summary", $("#drawer")).filter(el => !el.disabled && el.getClientRects().length);
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
    }
  });

  $("#set-language").addEventListener("change", event => {
    state.settings.language=event.target.value;persist();
    diary?.refreshLanguage();mealLibrary?.refresh();
  });
  // Settings fields
  $("#set-provider").addEventListener("change", (e) => applyProviderPreset(e.target.value));
  bindText("#set-baseurl", "baseUrl");
  for (const [sel, key] of [["#set-apiformat", "apiFormat"], ["#set-transport", "transport"]]) { $(sel).addEventListener("change", e => { state.settings[key] = e.target.value; persist(); }); }
  bindToggle("#set-demo", "demoMode");
  $("#available-models").addEventListener("change", e => { state.settings.model = e.target.value; $("#set-model").value = e.target.value; persist(); });
  bindText("#set-model", "model");
  bindText("#set-apikey", "apiKey");
  bindText("#set-keyheader", "keyHeader");
  bindText("#set-extra", "extraHeaders");
  $("#set-temperature").addEventListener("input", (e) => { state.settings.temperature = Number(e.target.value); $("#temperature-out").textContent = Number(e.target.value).toFixed(1); persist(); });
  $("#set-maxtokens").addEventListener("change", (e) => { state.settings.maxTokens = Math.max(256, Math.min(32000, Number(e.target.value) || 2000)); persist(); });

  $$("#auth-seg [data-auth]").forEach((b) => b.addEventListener("click", () => {
    state.settings.auth = b.dataset.auth;
    if (b.dataset.auth === "api-key") state.settings.keyHeader = "api-key";
    if (b.dataset.auth === "bearer") state.settings.keyHeader = "Authorization";
    persist(); syncDrawer();
  }));
  $$("#theme-seg [data-theme-pick]").forEach((b) => b.addEventListener("click", () => { state.settings.theme = b.dataset.themePick; persist(); syncDrawer(); }));
  $$("#accent-row [data-accent-pick]").forEach((b) => b.addEventListener("click", () => { state.settings.accent = b.dataset.accentPick; persist(); syncDrawer(); }));

  bindToggle("#set-jsonmode", "jsonMode");
  bindToggle("#set-autanalyze", "autoAnalyze");
  bindToggle("#set-compress", "compressImages");
  bindToggle("#set-micros", "showMicros");
  bindToggle("#set-items", "showItems");
  bindToggle("#set-swaps", "showSwaps");
  $("#set-keyvisible").addEventListener("click", () => {
    const on = $("#set-keyvisible").getAttribute("aria-checked") !== "true";
    setToggle("#set-keyvisible", on);
    updateKeyVisibility();
  });

  $("#test-btn").addEventListener("click", onTest);
  $("#models-btn").addEventListener("click", onListModels);
  $("#reset-btn").addEventListener("click", () => {
    if (!confirm("Reset all NutriLens settings to defaults? Your saved history is kept.")) return;
    state.settings = resetSettings();
    persist(); syncDrawer();
    toast("Settings reset.", "success");
  });
  // Examples
  $$("[data-example]").forEach((b) => b.addEventListener("click", () => {
    if (state.busy) return;
    state.diaryContext=null;renderAnalysisOrigin();
    $("#input").value = b.dataset.example;
    autoGrow();
    if (state.settings.autoAnalyze) runAnalysis(); else $("#input").focus();
  }));


}

function bindText(sel, key) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener("input", () => { state.settings[key] = el.value; persist(); });
}
function bindToggle(sel, key) {
  const el = $(sel);
  if (!el) return;
  el.addEventListener("click", () => {
    const on = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(on));
    state.settings[key] = on;
    persist();
    refreshResult();
  });
}

async function onTest() {
  const status = $("#test-status");
  const btn = $("#test-btn");
  btn.disabled = true;
  status.innerHTML = `<span class="status-dot busy"></span> Contacting endpoint…`;
  try {
    const settings = currentSettings();
    const { ms, protocol } = await testConnection(settings);
    status.innerHTML = `<span class="status-dot ok"></span> Connected in ${ms} ms — model “${esc(settings.model)}” responded via ${esc(protocol === "responses" ? "Responses" : "Chat Completions")}.`;
    toast("Connection successful.", "success");
  } catch (err) {
    status.innerHTML = `<span class="status-dot bad"></span> ${esc(err.message)}`;
    toast("Connection test failed.", "error");
  } finally {
    btn.disabled = false;
  }
}

async function onListModels() {
  const status = $("#models-status");
  const btn = $("#models-btn");
  btn.disabled = true;
  status.innerHTML = `<span class="status-dot busy"></span> Fetching models…`;
  try {
    const snapshot = currentSettings();
    const models = await listModels(snapshot);
    if (snapshot.baseUrl !== state.settings.baseUrl || snapshot.apiKey !== state.settings.apiKey) throw new Error("Connection settings changed. Fetch models again.");
    if (!models.length) throw new Error("The endpoint returned no models.");
    const dl = $("#model-options");
    dl.innerHTML = models.map((m) => `<option value="${esc(m)}"></option>`).join("");
    const select = $("#available-models");
    select.innerHTML = '<option value="">Choose a model…</option>' + models.map(m => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('');
    select.hidden = false;
    select.value = models.includes(state.settings.model) ? state.settings.model : '';
    status.innerHTML = '<span class="status-dot ok"></span> ' + models.length + ' models loaded. Select a model above, then Test connection.';
    toast(`${models.length} models loaded.`, "success");
  } catch (err) {
    status.innerHTML = `<span class="status-dot bad"></span> ${esc(err.message)}`;
  } finally {
    btn.disabled = false;
  }
}
/* -------------------------------------------------------------------------- */
/* Boot                                                                        */

function decorateStaticIcons() {
  const map = [
    ["#mic-btn", ICONS.mic],
    ["#diary-nav-icon", ICONS.diary],
    ["#history-btn", ICONS.history],
    ["#theme-toggle", ICONS.sun],
    ["#photo-btn .icon-slot", ICONS.camera],
    ["#attach-btn .icon-slot", ICONS.paperclip],
    ["#send-btn .icon-slot", ICONS.send],
    ["#settings-btn .icon-slot", ICONS.settings],
    ["#set-keyvisible .icon-slot", ICONS.eye],
    ["#models-btn .icon-slot", ICONS.code],
    ["#test-btn .icon-slot", ICONS.bolt],
    ["#close-drawer", ICONS.x],
  ];
  for (const [sel, icon] of map) {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = icon;
  }
  const heroIcons = [ICONS.leaf, ICONS.spark, ICONS.bolt, ICONS.download];
  document.querySelectorAll(".hero-chips .chip .icon-slot, .hero-chips .chip svg").forEach((el, i) => {
    if (el.classList.contains("icon-slot")) el.innerHTML = heroIcons[i % heroIcons.length];
  });
}

function boot() {
  $("#set-language").innerHTML=LANGUAGES.map(language=>`<option value="${language.code}">${esc(language.label)}</option>`).join("");
  initLocalization(document.body,state.settings.language);
  applyTheme();
  decorateStaticIcons();
  syncDrawer();

  const session = loadSession();
  if (session.text) {
    $("#input").value = session.text;
    autoGrow();
  }
  updateKeyVisibility();

  diary = initDiary({ toast, getSettings: currentSettings, onAnalyseEntry: selectDiaryMeal });
  mealLibrary = initMealLibrary({history:historyRepository,onOpenAnalysis:displaySavedAnalysis,onChooseDiary:selectDiaryMeal,onReanalyse:prepareSavedAnalysis,onBeforeOpen:()=>{if($("#drawer").classList.contains('open'))closeDrawer();diary.showAnalysis();},onAllDeleted:source=>{if(source==='history'){state.lastSavedEntry=null;state.viewingSaved=false;$("#saved-analysis-banner").hidden=true;$("#history-save-status").hidden=true;}else{state.diaryContext=null;renderAnalysisOrigin();}},isBusy:()=>state.busy || state.readingAttachments || diary.isBusy(),toast});
  if(typeof BroadcastChannel !== 'undefined'){historyChannel=new BroadcastChannel('nutrilens-history');historyChannel.onmessage=()=>mealLibrary.refresh();}
  wireEvents();

  // Show a friendly empty state in the results area.
  $("#result").innerHTML = `<div class="card"><div class="empty">${ICONS.spark}<p>Attach a photo, add a recipe file, or describe a meal, then hit <strong>Analyse</strong>.<br>Results appear here with calories, macros, micronutrients and a health score.</p></div></div>`;
  wireResultActions();

  // Keyboard shortcut hint / model badge in the composer.
  updateComposerHint();
}

function updateEndpointPreview() {
  const host = $("#endpoint-preview");
  if (!host) return;
  try {
    host.textContent = "Request URL: " + endpointUrl(state.settings.baseUrl, state.settings.provider, state.settings.endpointMode, state.settings.apiFormat || "auto");
  } catch (error) { host.textContent = error.message; }
}

function updateComposerHint() {
  const host = document.querySelector("#result .card .empty p");
  if (!host) return;
  document.querySelector('#connection-hint')?.remove();
  const line = state.settings.demoMode ? 'Demo mode: sample data only — photos are not analysed.' : hasRemoteModel() ? 'Ready to use your configured model. Press Analyse to send the request.' : 'Open Settings, add your API key and fetch/select a model. No demo results are substituted.';
  host.insertAdjacentHTML('afterend', '<div class="status-line" id="connection-hint" style="justify-content:center;margin-top:14px"><span>' + esc(line) + '</span></div>');
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
