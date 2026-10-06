import {STATIC_HOSTING, HOSTED_RELAY} from './hosting-config.js';
import {isHostedProvider} from './hosted-provider.js';
export function hasHostedRelay(locationInfo=globalThis.location){
  return HOSTED_RELAY||!!locationInfo&&/(^|\.)vercel\.app$/i.test(locationInfo.hostname||'');
}
export function isStaticHosting(locationInfo=globalThis.location){
  return STATIC_HOSTING||!!locationInfo&&/(^|\.)(github\.io|netlify\.app|vercel\.app)$/i.test(locationInfo.hostname||'');
}
export function effectiveTransport(settings,locationInfo=globalThis.location){
  if(hasHostedRelay(locationInfo)&&isHostedProvider(settings.baseUrl))return 'hosted';
  return isStaticHosting(locationInfo)?'direct':settings.transport==='direct'?'direct':'relay';
}
