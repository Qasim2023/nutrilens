import {LANGUAGES,normalizeLanguage,languageInfo} from './languages.js';
import {TRANSLATIONS} from './translations.js';
export {LANGUAGES,normalizeLanguage,languageInfo};
let language='en';
export const getLanguage=()=>language;
export const getLocale=()=>languageInfo(language).locale;
export const getDirection=()=>languageInfo(language).direction||"ltr";
// Complete phrases first; small dynamic fragments may be separated by middots.
export function translate(text,code=language){
  const dictionary=TRANSLATIONS[normalizeLanguage(code)]||{};
  if(dictionary[text])return dictionary[text];
  const match=String(text).match(/^(\s*)([\s\S]*?)(\s*)$/);
  const source=match[2];
  if(dictionary[source])return match[1]+dictionary[source]+match[3];
  const confidence=source.match(/^(\d+)% AI confidence$/);
  if(confidence)return `${confidence[1]}% ${dictionary['AI confidence']||'AI confidence'}`;
  const today=source.match(/^(.+) kcal today$/);
  if(today)return `${today[1]} kcal ${dictionary['today']||'today'}`;
  const entries=source.match(/^(\d+) (entry|entries) logged$/);
  if(entries)return `${entries[1]} ${dictionary[entries[1]==='1'?'entry logged':'entries logged']||entries[2]+' logged'}`;
  const items=source.match(/^(\d+) (item|items)$/);
  if(items)return `${items[1]} ${dictionary[items[1]==='1'?'item':'items']||items[2]}`;
  const action=source.match(/^(Edit|Delete) (.+)$/);
  if(action)return (dictionary[action[1]]||action[1])+' '+action[2];
  if(source.includes(' · '))return match[1]+source.split(' · ').map(part=>translate(part,code)).join(' · ')+match[3];
  const count=source.match(/^(\d+) (saved analyses|diary entries)$/);
  if(count)return count[1]+' '+(dictionary[count[2]]||count[2]);
  const macroEnergy=source.match(/^(\d+)% of macro energy$/);
  if(macroEnergy)return macroEnergy[1]+'% '+(dictionary['of macro energy']||'of macro energy');
  const nutrient=source.match(/^(Protein|Carbs|Fat|Fibre|Fiber|Sugar|Sodium) (.+)$/);
  if(nutrient)return `${dictionary[nutrient[1]]||nutrient[1]} ${nutrient[2]}`;
  return text;
}

// Translate only interface text, never input values, API/model IDs or food content.
const skip='[data-i18n-skip],script,style,code,pre,svg,kbd,#available-models,#model-options,#endpoint-preview,#provider-hint,.brand-name';
const attributes=['placeholder','aria-label','title'];
const originals=new WeakMap();
let observer,root,queued=false;
function remember(node,key,current){
  let record=originals.get(node);if(!record){record={};originals.set(node,record);}
  if(!record[key]||current!==record[key].translated)record[key]={source:current,translated:current};
  return record[key];
}
export function localizeDOM(target=root){
  if(!target)return;
  const walker=target.ownerDocument.createTreeWalker(target,4);
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(!node.parentElement||node.parentElement.closest(skip+',textarea')||!node.nodeValue.trim())continue;
    const saved=remember(node,'text',node.nodeValue),next=translate(saved.source);
    saved.translated=next;if(node.nodeValue!==next)node.nodeValue=next;
  }
  for(const element of [target,...target.querySelectorAll('*')]){
    if(element.closest(skip))continue;
    for(const name of attributes){
      if(!element.hasAttribute(name))continue;
      const saved=remember(element,name,element.getAttribute(name)),next=translate(saved.source);
      saved.translated=next;if(element.getAttribute(name)!==next)element.setAttribute(name,next);
    }
  }
}
export function setLanguage(code){
  language=normalizeLanguage(code);
  if(root){root.ownerDocument.documentElement.lang=language;root.ownerDocument.documentElement.dir=getDirection();localizeDOM();}
  return language;
}
export function initLocalization(target,code='en'){
  observer?.disconnect();root=target;setLanguage(code);
  observer=new MutationObserver(()=>{
    if(queued)return;queued=true;
    queueMicrotask(()=>{queued=false;localizeDOM();});
  });
  observer.observe(target,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:attributes});
  return ()=>{observer?.disconnect();root=null;};
}
export function analysisLanguageInstruction(code){
  const info=languageInfo(code);
  return `RESPONSE LANGUAGE: ${info.name} (${info.code}). Write all user-facing JSON text (dish, summary, item names, quantity descriptions, portion_notes, health_label, health_summary, pros, cons, allergens, swaps and confidence_notes) in ${info.name}. Keep JSON property names, enum values, numeric values and unit identifiers exactly as specified. Do not translate or alter the user's brands, quantities, or proper names. ${info.code==='nn'?'Use genuine Nynorsk, not Bokmål.':info.code==='nb'?'Use Bokmål, not Nynorsk.':''}`;
}
