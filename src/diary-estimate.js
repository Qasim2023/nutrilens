import { analyzeFood, endpointUrl } from './ai.js';
import { createEntry, validateCalories, diaryConfidence, diaryAnalysis } from './diary-store.js';

// Manual calories (including zero) always take precedence; only a blank field uses AI.
export async function resolveDiaryInput({ input, settings = {}, original, estimate = analyzeFood, signal, onStatus = () => {} }) {
  const name=String(input.name || '').trim();
  const needsEstimate=input.calories===null || input.calories===undefined || String(input.calories).trim()==='';
  // Validate date, meal, name length and provided calories before making a paid request.
  createEntry({...input,name,calories:needsEstimate ? 0 : input.calories});
  if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
  if(!needsEstimate) {
    const calories=validateCalories(input.calories);
    const retainAnalysis=original && original.name===name && original.calories===calories;
    const retainAI=original?.source==='ai' && Number.isFinite(original.calories) && validateCalories(original.calories)===calories && original.name===name;
    return {...input,name,calories,thumb:retainAnalysis ? original.thumb || null : null,analysis:retainAnalysis ? original.analysis || null : null,source:retainAI?'ai':'manual',confidence:retainAI ? diaryConfidence(original.confidence) : null,nutrients:retainAI ? original.nutrients || null : null,estimateNotes:retainAI ? original.estimateNotes || '' : ''};
  }
  if(!name) throw new Error('Enter a food description or a calorie amount. For example: “2 eggs and 1 slice of toast”.');
  if(settings.demoMode) throw new Error('Turn off Demo mode to estimate diary calories with your configured model, or enter calories manually.');
  endpointUrl(settings.baseUrl,settings.provider);
  if(!String(settings.model || '').trim()) throw new Error('Choose a model in Settings to estimate calories, or enter calories manually.');
  if(settings.auth!=='none' && !String(settings.apiKey || '').trim()) throw new Error('Add your API key in Settings to estimate calories, or enter calories manually.');
  onStatus('Estimating calories for your food…');
  // Do not send the rest of the diary, selected date, category, or unrelated attachments.
  const result=await estimate({text:name,settings,signal,onStatus});
  if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
  const estimated=result?.total?.calories;
  if(result?.meta?.demo || typeof estimated!=='number' || !Number.isFinite(estimated)) throw new Error('The model did not return a usable calorie estimate. Nothing was logged. Try again or enter calories manually.');
  return {...input,name,analysis:result,calories:validateCalories(estimated),source:'ai',confidence:diaryConfidence(result.confidence),nutrients:result.total,estimateNotes:String(result.portion_notes || result.confidence_notes || 'Estimated from your food description. Check the portion size.').slice(0,800)};
}

// In-place detailed nutrition uses only this food, never the composer or other entries.
export async function resolveDiaryAnalysis({entry,settings={},estimate=analyzeFood,signal,onStatus=()=>{}}) {
  createEntry(entry);
  if(!String(entry.name || '').trim() || entry.name==='Calorie entry') throw new Error('This diary entry has only a calorie amount. Edit it to add a food description before analysing.');
  if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
  if(settings.demoMode) throw new Error('Turn off Demo mode to analyse this diary food with your configured model.');
  endpointUrl(settings.baseUrl,settings.provider);
  if(!String(settings.model || '').trim()) throw new Error('Choose a model in Settings to analyse detailed nutrition.');
  if(settings.auth!=='none' && !String(settings.apiKey || '').trim()) throw new Error('Add your API key in Settings to analyse detailed nutrition.');
  const notes=entry.source==='ai' ? String(entry.estimateNotes || '') : '';
  const text=entry.name+(notes ? '\n\nEarlier estimated portion for reference: '+notes : '');
  onStatus('Analysing detailed nutrition…');
  const result=await estimate({text,settings,signal,onStatus});
  if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
  const analysis=diaryAnalysis(result);
  if(!analysis) throw new Error('The model did not return a usable nutrition analysis. Try again.');
  validateCalories(analysis.total.calories);
  return analysis;
}
