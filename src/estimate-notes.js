// Remove the old automatically appended fallback notice from saved estimates.
// User/model portion assumptions before the notice remain intact.
export function cleanEstimateNotes(value){
  return String(value||'').replace(/AI estimate based on the model[’']s food knowledge\.[\s\S]*?Check portion assumptions\./g,'').trim();
}
