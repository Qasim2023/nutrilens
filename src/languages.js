// Language names stay native so the selector remains recognizable in any UI language.
export const LANGUAGES=Object.freeze([
  {code:'nb',label:'Norsk (bokmål)',name:'Norwegian Bokmål',locale:'nb-NO'},
  {code:'en',label:'English',name:'English',locale:'en-US'},
  {code:'pl',label:'Polski',name:'Polish',locale:'pl-PL'},
  {code:'de',label:'Deutsch',name:'German',locale:'de-DE'},
  {code:'tl',label:'Tagalog',name:'Tagalog',locale:'fil-PH'},
  {code:'fr',label:'Français',name:'French',locale:'fr-FR'},
  {code:'es',label:'Español',name:'Spanish',locale:'es-ES'},
  {code:'nn',label:'Norsk (nynorsk)',name:'Norwegian Nynorsk',locale:'nn-NO'},
  {code:'ru',label:'Русский',name:'Russian',locale:'ru-RU'},
  {code:'hi',label:'हिन्दी',name:'Hindi',locale:'hi-IN'},
  {code:'ur',label:'اردو',name:'Urdu',locale:'ur-PK',direction:'rtl'},
]);
export const normalizeLanguage=code=>LANGUAGES.some(language=>language.code===code)?code:'en';
export const languageInfo=code=>LANGUAGES.find(language=>language.code===normalizeLanguage(code));
