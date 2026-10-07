import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRecipePrompt,generateRecipes,normalizeRecipes} from '../src/recipe-ai.js';
import {translate} from '../src/i18n.js';
import {initRecipeStudio} from '../src/recipes.js';

const settings={baseUrl:'https://example.test/v1',model:'mock-recipe-model',auth:'none',transport:'direct',apiFormat:'chat',language:'en',maxTokens:4096};
const recipe={title:'Lemon chickpea bowl',description:'A bright, filling bowl with greens and whole grains.',prep_minutes:10,cook_minutes:15,servings:2,difficulty:'Easy',tags:['Vegetarian','High fibre'],ingredients:[{amount:'1 can (400 g)',name:'rinsed chickpeas'},{amount:'2 cups',name:'baby spinach'},{amount:'1 tbsp',name:'olive oil'}],steps:['Warm the chickpeas in a pan for 5 minutes until hot.','Fold in spinach and stir until just wilted.','Serve with grains and lemon dressing.'],nutrition_per_serving:{calories:430,protein_g:19,carbs_g:56,fat_g:14,fiber_g:12},chef_tip:'Add lemon zest just before serving.',swaps:['Use white beans instead of chickpeas.']};

function response(data){return Response.json({choices:[{message:{content:JSON.stringify(data)}}]});}

test('recipe request includes user intent, servings, and optional time limit',()=>{
  const prompt=buildRecipePrompt({instructions:'  Use tofu, broccoli, and ginger  ',servings:4,maxMinutes:20});
  assert.match(prompt,/Create three recipe ideas for 4 servings/);
  assert.match(prompt,/no more than 20 minutes/);
  assert.match(prompt,/Use tofu, broccoli, and ginger/);
  assert.throws(()=>buildRecipePrompt({instructions:'  '}),/would like to cook/);
});

test('recipe normalization preserves measured ingredients and validates complete per-serving nutrition',()=>{
  const recipes=normalizeRecipes({recipes:[recipe,{...recipe,title:'Second option'},{...recipe,title:'Third option'},{...recipe,title:'Ignored fourth'}]});
  assert.equal(recipes.length,3);
  assert.deepEqual(recipes[0].ingredients[0],{amount:'1 can (400 g)',name:'rinsed chickpeas'});
  assert.equal(recipes[0].nutrition.fiber_g,12);
  assert.equal(recipes[0].steps.length,3);
  assert.throws(()=>normalizeRecipes({recipes:[{...recipe,nutrition_per_serving:{calories:400}}]}),/incomplete recipe/);
});

test('generation uses the configured provider and includes the selected language and preferences',async()=>{
  const previous=globalThis.fetch,calls=[];const statuses=[];
  try{
    globalThis.fetch=async(url,init)=>{
      calls.push({url,body:JSON.parse(init.body)});
      return response({recipes:[recipe]});
    };
    const result=await generateRecipes({instructions:'Use tofu and broccoli; no peanuts.',servings:2,maxMinutes:30,settings,onStatus:value=>statuses.push(value)});
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://example.test/v1/chat/completions');
    assert.match(calls[0].body.messages[0].content,/NutriLens Recipe Studio/);
    assert.match(calls[0].body.messages[0].content,/English/);
    assert.match(calls[0].body.messages[1].content,/no peanuts/);
    assert.equal(result[0].title,'Lemon chickpea bowl');
    assert.ok(statuses.some(value=>/Creating recipe ideas/.test(value)));
  }finally{globalThis.fetch=previous;}
});

test('malformed model output receives one structured repair attempt and reports progress',async()=>{
  const previous=globalThis.fetch;let calls=0;const statuses=[];
  try{
    globalThis.fetch=async()=>{calls++;return response(calls===1?{recipes:[{title:'Incomplete'}]}:{recipes:[recipe]});};
    const result=await generateRecipes({instructions:'A quick vegetarian dinner',settings,onStatus:value=>statuses.push(value)});
    assert.equal(calls,2);
    assert.equal(result[0].title,recipe.title);
    assert.ok(statuses.some(value=>value.includes('Creating recipe ideas')));
    assert.ok(statuses.some(value=>value.includes('Polishing the recipe details')));
  }finally{globalThis.fetch=previous;}
});

test('cancelled recipe requests reject as AbortError',async()=>{
  const previous=globalThis.fetch,controller=new AbortController();
  try{
    globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
    const pending=generateRecipes({instructions:'Quick lentil soup',settings,signal:controller.signal});
    setTimeout(()=>controller.abort(),15);
    await assert.rejects(pending,{name:'AbortError'});
  }finally{globalThis.fetch=previous;}
});

test('Recipe Studio navigation, quick-start guide, and idea prompts are wired without diary writes',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const diary=await readFile(new URL('../src/diary.js',import.meta.url),'utf8');
  const ui=await readFile(new URL('../src/recipes.js',import.meta.url),'utf8');
  assert.match(html,/id="view-recipes"[^>]+aria-controls="recipes-panel"/);
  assert.match(html,/id="recipe-guide"[^>]+hidden/);
  assert.match(html,/data-recipe-idea=/);
  assert.match(diary,/document\.dispatchEvent\(new Event\('nutrilens:recipes-open'\)\)/);
  assert.match(ui,/nutrilens.recipesGuideDismissed.v1/);
  assert.doesNotMatch(ui,/saveDiary|createEntry|historyRepository/);
});

test('the new main UI labels are present in the app language dictionaries',()=>{
  for(const code of ['nb','pl','de','tl','fr','es','nn','ru','hi','ur']){
    assert.notEqual(translate('Recipes',code),'Recipes',`${code} should localize the new navigation label`);
    assert.notEqual(translate('Ingredients',code),'Ingredients',`${code} should localize recipe card labels`);
  }
});
test('a returned recipe that contradicts an explicit allergen exclusion is blocked without auto-repair',async()=>{
  const previous=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return response({recipes:[{...recipe,ingredients:[...recipe.ingredients,{amount:'1 tbsp',name:'peanut butter'}]}]});};
    await assert.rejects(generateRecipes({instructions:"I'm allergic to peanuts; do not include them.",settings}),error=>error.code==='RECIPE_CONSTRAINT'&&/No recipes were shown/.test(error.message));
    assert.equal(calls,1,'constraint conflicts must not be automatically repaired into a confident recipe');
  }finally{globalThis.fetch=previous;}
});

test('an explicit clarification response is surfaced instead of retried as a recipe',async()=>{
  const previous=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return response({clarification:'Your allergy request conflicts with an ingredient preference. Which should I follow?',recipes:[]});};
    await assert.rejects(generateRecipes({instructions:'Avoid peanuts but use peanut butter.',settings}),error=>error.code==='RECIPE_CLARIFICATION'&&/Which should I follow/.test(error.message));
    assert.equal(calls,1);
  }finally{globalThis.fetch=previous;}
});

function fakeElement(){
  const listeners=new Map();let content='';
  const element={hidden:false,disabled:false,value:'',innerHTML:'',history:[],attributes:{},
    addEventListener(type,handler){listeners.set(type,handler);},
    async fire(type,event={preventDefault(){}}){return await listeners.get(type)?.(event);},
    setAttribute(name,value){this.attributes[name]=value;},focus(){},
  };
  Object.defineProperty(element,'textContent',{get(){return content;},set(value){content=String(value);this.history.push(content);}});
  return element;
}
function fakeRecipeDocument(){
  const selectors=['#recipe-form','#recipe-instructions','#recipe-servings','#recipe-time','#recipe-generate','#recipe-generate-label','#recipe-setup-note','#recipe-error','#recipe-status','#recipe-status-text','#recipe-cancel','#recipe-empty','#recipe-results-list','#recipe-announcement','#recipe-guide','#recipe-guide-dismiss','#recipe-settings-button'];
  const elements=new Map(selectors.map(selector=>[selector,fakeElement()]));
  const listeners=new Map();
  return {elements,document:{querySelector(selector){if(!elements.has(selector))throw new Error('Unexpected selector '+selector);return elements.get(selector);},querySelectorAll(){return [];},addEventListener(type,handler){listeners.set(type,handler);}},openRecipes(){listeners.get('nutrilens:recipes-open')?.();}};
}

test('quick-start is shown on first open and stays dismissed for the session when storage is unavailable',()=>{
  const previousDocument=globalThis.document,previousStorage=globalThis.localStorage;const ui=fakeRecipeDocument();
  globalThis.document=ui.document;globalThis.localStorage={getItem(){throw new Error('storage unavailable');},setItem(){throw new Error('storage unavailable');}};
  try{
    initRecipeStudio({getSettings:()=>settings,isProviderReady:()=>true,openSettings(){}});
    const guide=ui.elements.get('#recipe-guide');
    ui.openRecipes();assert.equal(guide.hidden,false);
    ui.elements.get('#recipe-guide-dismiss').fire('click');assert.equal(guide.hidden,true);
    ui.openRecipes();assert.equal(guide.hidden,true);
  }finally{globalThis.document=previousDocument;globalThis.localStorage=previousStorage;}
});

test('Recipe Studio UI displays generation progress from the provider layer',async()=>{
  const previousDocument=globalThis.document,previousStorage=globalThis.localStorage,previousFetch=globalThis.fetch;const ui=fakeRecipeDocument();let calls=0;
  globalThis.document=ui.document;globalThis.localStorage={getItem(){return null;},setItem(){}};
  globalThis.fetch=async()=>{calls++;return response(calls===1?{recipes:[{title:'Incomplete'}]}:{recipes:[recipe]});};
  try{
    initRecipeStudio({getSettings:()=>settings,isProviderReady:()=>true,openSettings(){}});
    const request=ui.elements.get('#recipe-instructions');request.value='A quick vegetarian dinner';
    await ui.elements.get('#recipe-form').fire('submit');
    const statuses=ui.elements.get('#recipe-status-text').history;
    assert.ok(statuses.some(value=>value.includes('Creating recipe ideas')));
    assert.ok(statuses.some(value=>value.includes('Polishing the recipe details')));
    assert.equal(ui.elements.get('#recipe-status').hidden,true);
    assert.match(ui.elements.get('#recipe-results-list').innerHTML,/Lemon chickpea bowl/);
  }finally{globalThis.document=previousDocument;globalThis.localStorage=previousStorage;globalThis.fetch=previousFetch;}
});