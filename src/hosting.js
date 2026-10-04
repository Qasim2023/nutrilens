import {STATIC_HOSTING} from './hosting-config.js';
export function isStaticHosting(locationInfo=globalThis.location){
  return STATIC_HOSTING||!!locationInfo&&/(^|\.)github\.io$/i.test(locationInfo.hostname||'');
}
export function effectiveTransport(settings,locationInfo=globalThis.location){
  return isStaticHosting(locationInfo)?'direct':settings.transport==='direct'?'direct':'relay';
}
