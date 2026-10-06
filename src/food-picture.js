/* Contextual, offline food illustrations. No remote image searches or user text in SVG. */
const ART = {
  apple: '<path fill="#e96b52" d="M50 25C20 6 10 40 22 66c10 25 22 25 28 19 8 7 22 3 30-17C94 36 77 11 50 25Z"/><path fill="#698f4c" d="M51 23c0-17 17-20 26-17-2 12-14 20-26 17Z"/><path d="m49 27 4-18" stroke="#775540" stroke-width="5"/><path d="M31 33c-9 5-9 14-8 19" stroke="#ffb89d" stroke-width="6" fill="none"/>',
  banana: '<path fill="#f2c94c" stroke="#d5a93c" stroke-width="3" d="M20 17C18 54 48 79 82 52 65 93 20 86 12 52c-3-13-1-25 8-35Z"/><path d="M22 31c2 35 28 43 47 33" stroke="#ffe99b" stroke-width="5" fill="none"/><path d="m16 18 6-10M81 53l6-4" stroke="#775540" stroke-width="6"/>',
  citrus: '<circle cx="50" cy="53" r="34" fill="#f3a33b"/><circle cx="50" cy="53" r="27" fill="#fff0b7"/><circle cx="50" cy="53" r="22" fill="#f7b84b"/><path d="M50 30v46M28 53h44M34 37l32 32M34 69l32-32" stroke="#fff0b7" stroke-width="3"/><path fill="#6e974e" d="M53 17C60 2 75 7 78 13c-6 9-18 10-25 4Z"/>',
  berries: '<g fill="#6b6b9a"><circle cx="28" cy="52" r="13"/><circle cx="38" cy="75" r="13"/><circle cx="69" cy="70" r="13"/></g><path fill="#de5c59" d="M42 30c5-14 28-14 32 0 4 12-9 31-16 34-8-5-20-22-16-34Z"/><path fill="#66954f" d="m43 23 12-10 3 7 10-6 3 10-12 7Z"/><g fill="#ffe0a2"><circle cx="52" cy="36" r="2"/><circle cx="64" cy="40" r="2"/><circle cx="57" cy="51" r="2"/></g>',
  fruit: '<ellipse cx="50" cy="55" rx="38" ry="27" fill="#f4c262"/><path fill="#80a365" d="M27 38c-12-19 3-29 20-23l3 22Z"/><path fill="#e77963" d="M55 40c-7-17 7-27 19-21 15 8 10 24-1 32Z"/><path fill="#a184b4" d="m24 50 16-3 14 30-20 7Z"/><path fill="#ffd981" d="m57 52 22 3-17 23-14-4Z"/>',
  avocado: '<path fill="#567749" d="M51 10c-12 0-15 19-27 33-31 40 44 65 57 22 7-23-18-55-30-55Z"/><path fill="#c5d789" d="M51 16c-8 0-13 22-24 35-21 28 34 43 46 15 9-21-15-50-22-50Z"/><circle cx="50" cy="61" r="17" fill="#a76d48"/><circle cx="45" cy="56" r="6" fill="#c58d61"/>',
  salad: '<ellipse cx="50" cy="55" rx="40" ry="31" fill="#e1e8d5"/><g fill="#76a263"><ellipse cx="32" cy="44" rx="17" ry="12" transform="rotate(-25 32 44)"/><ellipse cx="62" cy="41" rx="22" ry="14"/><ellipse cx="51" cy="67" rx="25" ry="16"/></g><g fill="#ef8568"><circle cx="30" cy="64" r="9"/><circle cx="65" cy="61" r="9"/></g><g fill="#bdd288" stroke="#678c55" stroke-width="2"><circle cx="44" cy="43" r="9"/><circle cx="72" cy="44" r="8"/></g><path d="m39 62 9-4 3 9-10 4M56 31l8 4-4 8-8-4" fill="#faf0d5"/>',
  vegetables: '<path fill="#eb9a48" d="m25 38 22 8-29 42Z"/><path d="m29 37-1-18m7 18 9-16" stroke="#6e9757" stroke-width="6"/><path fill="#7a9b59" d="M67 68 54 48h27L72 69v16h-9Z"/><g fill="#5f8b50"><circle cx="54" cy="40" r="14"/><circle cx="73" cy="31" r="16"/><circle cx="83" cy="45" r="13"/></g>',
  eggs: '<path fill="#fff9e7" stroke="#e1d4b7" stroke-width="2" d="M45 16C28 6 11 26 15 47 3 68 24 89 43 81c22 12 47-10 38-29 7-23-14-43-36-36Z"/><circle cx="49" cy="49" r="20" fill="#f4bf45"/><ellipse cx="44" cy="42" rx="8" ry="5" fill="#ffe082"/>',
  bread: '<path fill="#b77e4b" d="M21 43C-3 9 102 7 79 43v41H21Z"/><path fill="#efca86" d="M28 45C8 17 90 17 72 45v32H28Z"/><g fill="#d4ab6b"><circle cx="40" cy="42" r="3"/><circle cx="61" cy="57" r="4"/><circle cx="44" cy="67" r="2"/></g>',
  oats: '<ellipse cx="50" cy="54" rx="40" ry="30" fill="#eee8dc"/><ellipse cx="50" cy="51" rx="33" ry="23" fill="#d6b887"/><g fill="#f2dec0"><ellipse cx="29" cy="44" rx="5" ry="2"/><ellipse cx="45" cy="62" rx="5" ry="2"/><ellipse cx="69" cy="53" rx="5" ry="2"/><ellipse cx="52" cy="42" rx="5" ry="2"/></g><g fill="#7b789a"><circle cx="41" cy="42" r="6"/><circle cx="57" cy="56" r="6"/><circle cx="64" cy="38" r="5"/></g>',
  rice: '<ellipse cx="50" cy="58" rx="39" ry="26" fill="#d4dfda"/><path fill="#fff7e3" d="M15 52c4-46 68-46 70 0-12 21-57 24-70 0Z"/><g fill="#e6d8bb"><ellipse cx="32" cy="41" rx="5" ry="2" transform="rotate(-20 32 41)"/><ellipse cx="48" cy="28" rx="5" ry="2"/><ellipse cx="66" cy="43" rx="5" ry="2"/><ellipse cx="49" cy="51" rx="5" ry="2"/></g>',
  pasta: '<ellipse cx="50" cy="55" rx="40" ry="31" fill="#f3eee2"/><g fill="none" stroke="#e9bb60" stroke-width="7" stroke-linecap="round"><path d="M23 49c2-31 50-26 48 3S19 76 32 40s41-4 36 21M23 61c-8-23 56-37 54-10S21 72 37 34"/></g><g fill="#d77152"><circle cx="40" cy="51" r="7"/><circle cx="64" cy="58" r="6"/></g><path fill="#6b9655" d="M51 34c10-16 23-9 23-4-4 9-16 11-23 4Z"/>',
  chicken: '<path fill="#ce965a" stroke="#b9804b" stroke-width="2" d="M29 32c-25 25 5 57 31 37l17-21-14-17c-11-14-21-12-34 1Z"/><path d="m68 40 14-14" stroke="#f0e6cf" stroke-width="9"/><circle cx="82" cy="23" r="7" fill="#f0e6cf"/><circle cx="89" cy="29" r="6" fill="#f0e6cf"/><path d="m28 48 26 16m-18-30 29 19" stroke="#a86c40" stroke-width="4"/>',
  meat: '<path fill="#b66854" stroke="#ecd5c0" stroke-width="6" d="M20 31c-20 25 5 55 35 50 33-5 34-43 10-53-19-9-34-9-45 3Z"/><path d="m27 41 36 27M37 30l36 28M22 56l27 21" stroke="#854b3e" stroke-width="4"/>',
  fish: '<path fill="#edaa8b" stroke="#da8d70" stroke-width="2" d="m15 53 16-28 52 12-8 43-43-4Z"/><path d="m29 36 40 35M23 49l37 28M44 31l31 27" stroke="#ffdcc1" stroke-width="5"/><circle cx="78" cy="25" r="12" fill="#f5d76b"/><path d="M78 15v20M68 25h20" stroke="#fff1b1" stroke-width="2"/>',
  pizza: '<path fill="#d49e63" d="m16 22 73 6-41 62Z"/><path fill="#f1cc70" d="m25 32 53 3-30 43Z"/><g fill="#c96e51"><circle cx="43" cy="42" r="7"/><circle cx="64" cy="43" r="6"/><circle cx="48" cy="63" r="6"/></g><path d="m20 23 67 6" stroke="#ba8754" stroke-width="10" stroke-linecap="round"/>',
  burger: '<path fill="#d8a25d" d="M14 42c3-37 69-37 73 0Z"/><path fill="#6e994f" d="m14 45 15 6 13-5 15 5 15-5 15 5v7H14Z"/><rect x="14" y="56" width="73" height="12" rx="6" fill="#82503b"/><path fill="#edc463" d="m20 65 22 12 26-12Z"/><path fill="#d8a25d" d="M14 74h73c0 21-73 21-73 0Z"/><path d="m36 27 4 1m16-6 4 1m11 10 4 1" stroke="#f6deab" stroke-width="3" stroke-linecap="round"/>',
  sandwich: '<path fill="#d2a56c" d="m15 30 64-10 9 49-64 15Z"/><path fill="#f3dba9" d="m20 34 54-9 9 39-56 14Z"/><path d="m23 72 60-14" stroke="#81a25d" stroke-width="8"/><path d="m25 77 60-14" stroke="#dc8765" stroke-width="6"/><path fill="#e2bb83" d="m20 83 67-15-3 12-59 13Z"/>',
  soup: '<ellipse cx="50" cy="54" rx="41" ry="30" fill="#e2e9e4"/><ellipse cx="50" cy="51" rx="34" ry="23" fill="#dca262"/><g fill="#f3cb83"><rect x="27" y="43" width="9" height="9" rx="2"/><rect x="51" y="57" width="10" height="8" rx="2"/></g><g fill="#79a164"><circle cx="53" cy="40" r="5"/><circle cx="68" cy="49" r="4"/><circle cx="40" cy="59" r="5"/></g>',
  dairy: '<path fill="#dbe6e2" d="M28 21h43l-5 65H33Z"/><path fill="#fffcf1" d="M32 29h35l-4 51H36Z"/><ellipse cx="50" cy="22" rx="22" ry="7" fill="#fcf9ef"/><path d="M37 37v32" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  cheese: '<path fill="#e7b64e" d="m18 41 58-24 10 58-68 8Z"/><path fill="#f5d77c" d="m18 41 58-24 10 27-68 13Z"/><g fill="#d5a13c"><circle cx="34" cy="63" r="6"/><circle cx="62" cy="66" r="8"/><circle cx="67" cy="37" r="4"/></g>',
  nuts: '<g fill="#bc8658" stroke="#9b6d45" stroke-width="2"><ellipse cx="32" cy="40" rx="12" ry="20" transform="rotate(-30 32 40)"/><ellipse cx="66" cy="42" rx="12" ry="20" transform="rotate(25 66 42)"/><ellipse cx="48" cy="71" rx="12" ry="20" transform="rotate(65 48 71)"/></g><path d="m26 26 11 27m35-28-12 30M32 78l30-15" stroke="#dcad7b" stroke-width="3"/>',
  beans: '<ellipse cx="50" cy="53" rx="39" ry="30" fill="#eee5d7"/><g fill="#b5795f" stroke="#f4d5b7" stroke-width="1"><ellipse cx="30" cy="43" rx="11" ry="7" transform="rotate(-30 30 43)"/><ellipse cx="55" cy="37" rx="11" ry="7"/><ellipse cx="70" cy="55" rx="11" ry="7" transform="rotate(25 70 55)"/><ellipse cx="44" cy="60" rx="11" ry="7"/><ellipse cx="28" cy="65" rx="9" ry="6"/></g>',
  coffee: '<ellipse cx="46" cy="66" rx="37" ry="22" fill="#e5ded2"/><path d="M68 36c31-5 28 34 0 28" fill="none" stroke="#f4eee1" stroke-width="9"/><path fill="#f8f2e7" d="M19 34h54v29c0 28-54 28-54 0Z"/><ellipse cx="46" cy="34" rx="27" ry="10" fill="#795440"/><ellipse cx="43" cy="33" rx="15" ry="5" fill="#c39b74"/>',
  tea: '<ellipse cx="46" cy="66" rx="37" ry="22" fill="#e3e8da"/><path d="M68 36c31-5 28 34 0 28" fill="none" stroke="#f4eee1" stroke-width="9"/><path fill="#f8f2e7" d="M19 34h54v29c0 28-54 28-54 0Z"/><ellipse cx="46" cy="34" rx="27" ry="10" fill="#bb9252"/><path d="m64 35 6 30" stroke="#a69b7c" stroke-width="2"/><rect x="65" y="59" width="11" height="13" rx="2" fill="#86a469"/>',
  drink: '<path fill="#dbe6e2" d="M27 20h46l-6 67H33Z"/><path fill="#efbf78" d="M32 40h36l-4 42H36Z"/><path d="m54 51 8-42h14" fill="none" stroke="#8ca293" stroke-width="4"/><path d="M37 33v38" stroke="#fff" stroke-opacity=".7" stroke-width="3"/>',
  dessert: '<path fill="#e6ba8a" d="m20 46 60-22 5 53-65 9Z"/><path fill="#a67158" d="m20 61 63-18 1 15-64 20Z"/><path fill="#f7e4cc" d="m20 46 60-22 3 15-63 20Z"/><circle cx="57" cy="23" r="9" fill="#cf6659"/>',
  sushi: '<g stroke="#46624e" stroke-width="7" fill="#fff3d9"><circle cx="32" cy="38" r="18"/><circle cx="69" cy="45" r="18"/><circle cx="43" cy="76" r="18"/></g><g fill="#e99d7d"><rect x="26" y="32" width="12" height="12" rx="3"/><rect x="63" y="39" width="12" height="12" rx="3"/><rect x="37" y="70" width="12" height="12" rx="3"/></g>',
  potato: '<ellipse cx="49" cy="51" rx="34" ry="26" transform="rotate(-25 49 51)" fill="#c6a16d"/><g fill="#94734b"><circle cx="32" cy="47" r="3"/><circle cx="60" cy="42" r="3"/><circle cx="48" cy="65" r="2"/></g>',
  generic: '<ellipse cx="50" cy="54" rx="40" ry="31" fill="#e6e9df"/><path fill="#e5c17e" d="M20 54c-1-28 31-31 30-3l-2 25c-17 4-26-6-28-22Z"/><path fill="#84a166" d="M52 35c8-17 34-7 27 8l-6 19-23-7Z"/><path fill="#db9472" d="M54 58c22-12 34 4 19 18l-19 2Z"/>',
};
export const FOOD_VISUAL_KEYS = Object.freeze(Object.keys(ART));
export const validFoodVisual = value => typeof value === 'string' && Object.hasOwn(ART, value) ? value : null;

// Whole-word matching avoids false positives such as eggplant -> eggs and pineapple -> apple.
const WORDS = [
  ['sushi','sushi|maki|nigiri'], ['pizza','pizza'], ['burger','burger|hamburger|cheeseburger'],
  ['sandwich','sandwich|wrap|burrito|taco'], ['salad','salad|salat|salade|ensalada'],
  ['soup','soup|suppe|sopa|soupe|stew|curry|dal'], ['pasta','pasta|spaghetti|noodles?|macaroni|lasagna|lasagne'],
  ['oats','oats?|oatmeal|porridge|cereal|havregryn|grot|musli'], ['rice','rice|ris|arroz|riz|biryani|pulao'],
  ['eggs','eggs?|omelette|omelet|scramble|egg|eier|oeufs?|huevos?|jajka'],
  ['chicken','chicken|turkey|kylling|kalkun|poulet|pollo|huhn'],
  ['meat','beef|steak|pork|lamb|bacon|sausage|meat|biff|kjott|fleisch'],
  ['fish','fish|salmon|tuna|cod|shrimp|prawns?|seafood|fisk|laks|poisson|pescado'],
  ['avocado','avocado|guacamole|aguacate'], ['banana','bananas?|banan|banane'],
  ['apple','apples?|eple|apfel|pomme|manzana'], ['citrus','oranges?|mandarins?|lemons?|limes?|grapefruit|appelsin'],
  ['berries','berries|strawberries|blueberries|raspberries|grapes|jordbaer|blabaer'],
  ['fruit','fruits?|mango|pineapple|melon|pear|peach|kiwi|frukt'],
  ['potato','potatoes|potato|fries|chips|potet|kartoffel'],
  ['vegetables','vegetables?|broccoli|carrots?|spinach|tomatoes?|cucumber|eggplant|aubergine|peppers?|greens|gronnsaker'],
  ['beans','beans?|lentils?|chickpeas?|tofu|hummus|bonner|linser'],
  ['nuts','nuts?|almonds?|walnuts?|cashews?|peanuts?|seeds|notter|mandler'],
  ['cheese','cheese|cheddar|mozzarella|ost|fromage|queso'], ['dairy','milk|yogurt|yoghurt|skyr|kefir|melk|lait|leche'],
  ['bread','bread|toast|bagel|croissant|pancakes?|waffles?|brod|brot|pain'],
  ['coffee','coffee|espresso|cappuccino|latte|kaffe|cafe'], ['tea','tea|chai|matcha|te'],
  ['drink','juice|smoothie|water|soda|cola|drink|beer|wine|vann|saft'],
  ['dessert','cake|chocolate|cookies?|ice cream|dessert|pastry|kake|sjokolade'],
];
const normalized = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ł/g, 'l');
const matchers = WORDS.map(([key,words]) => [key,new RegExp(`(?:^|[^\\p{L}])(?:${words})(?=$|[^\\p{L}])`,'u')]);
const categories = text => matchers.filter(([,pattern])=>pattern.test(normalized(text))).map(([key])=>key);

export function foodPicture(result = {}) {
  const items = Array.isArray(result.items) ? result.items.filter(item=>item && typeof item.name === 'string' && item.name.trim()) : [];
  const dish = String(result.dish || result.name || 'Food');
  const matched = items.length
    ? items.map(item=>validFoodVisual(item.visual_food) || categories(item.name)[0] || 'generic')
    : categories(dish);
  const multiple = items.length > 1 || (!items.length && matched.length > 1);
  let foods = matched.length ? matched : ['generic'];
  if (multiple) {
    foods = [...new Set(foods)].slice(0,6);
    // Multiple portions of the same food still need a visibly multi-food illustration.
    if (foods.length === 1) foods = [foods[0],foods[0],foods[0]];
  } else foods = foods.slice(0,1);
  const fruit = foods.every(key=>['apple','banana','citrus','berries','fruit','avocado'].includes(key));
  const breakfastFoods = ['eggs','bread','oats','coffee','tea','dairy','cheese','nuts','apple','banana','citrus','berries','fruit','avocado'];
  const breakfast = !fruit && foods.every(key=>breakfastFoods.includes(key)) && foods.some(key=>['eggs','bread','oats','coffee','tea','dairy'].includes(key));
  const theme = fruit ? 'fruit' : foods.every(key=>['coffee','tea','drink'].includes(key)) ? 'drinks' : breakfast ? 'breakfast' : 'meal';
  const bg = {fruit:'#f8e9df',breakfast:'#f4ecda',drinks:'#e5eeea',meal:'#e9efe5'}[theme];
  const positions = foods.length===1 ? [[38,36,1.64]] : foods.length===2 ? [[9,63,1.22],[119,66,1.16]] : foods.length===3 ? [[12,27,1.1],[124,29,1.04],[73,131,1.05]] : foods.length<=4 ? [[12,24,1.1],[124,26,1.04],[18,127,1.02],[127,130,.99]] : [[9,19,.85],[87,15,.85],[164,23,.82],[12,120,.86],[90,126,.85],[167,121,.82]];
  const art = foods.map((key,index)=>{const [x,y,scale]=positions[index];return `<g transform="translate(${x} ${y}) scale(${scale})">${ART[key]}</g>`;}).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="30" fill="${bg}"/><ellipse cx="129" cy="142" rx="112" ry="102" fill="#425241" opacity=".08"/><circle cx="128" cy="127" r="111" fill="#faf9f2"/><circle cx="128" cy="127" r="98" fill="none" stroke="#e6e6db" stroke-width="2"/>${art}</svg>`;
  return {
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    alt: `${multiple ? 'Representative food spread' : 'Representative food illustration'}: ${items.length === 1 ? items[0].name : dish}`,
    title: 'Representative illustration, not a photo of your portion.',
    multiple, foods, theme,
  };
}
