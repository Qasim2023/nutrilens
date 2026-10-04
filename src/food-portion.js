// Preserve portion normalization independently of nutrition estimation.
const finiteWeight=n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000;
export function edibleGrams(item){
  if(finiteWeight(item.grams))return item.grams;
  const m=String(item.quantity||'').match(/^(\d+(?:\.\d+)?)\s*(g|kg|grams?|kilograms?)$/i)||String(item.quantity||'').match(/\((\d+(?:\.\d+)?)\s*(g|kg|grams?|kilograms?)\)/i);
  const weight=m?Number(m[1])*(/^(kg|kilogram)/i.test(m[2])?1000:1):null;
  return finiteWeight(weight)?weight:null;
}
