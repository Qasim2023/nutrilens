/* ==========================================================================
   NutriLens — built-in demo estimator
   Used when the user has not configured an API key yet, so the app is useful
   on first run. Results are clearly labelled as demo estimates.
   ========================================================================== */

import { labelForScore } from "./ai.js";

const FOODS = [
  { keys: ["pizza"], dish: "Pizza slice (cheese)", per: { kcal: 285, p: 12, c: 36, f: 10, fib: 2.5, sug: 3.8, na: 640 }, unit: "1 slice (~110 g)", score: 42, note: "Refined crust and cheese make it energy dense with modest fibre." },
  { keys: ["burger", "cheeseburger", "hamburger"], dish: "Cheeseburger", per: { kcal: 540, p: 25, c: 42, f: 29, fib: 2.6, sug: 8, na: 1050 }, unit: "1 burger (~220 g)", score: 38, note: "High in saturated fat and sodium; protein is a plus." },
  { keys: ["salad", "greens"], dish: "Mixed green salad", per: { kcal: 180, p: 6, c: 14, f: 12, fib: 5, sug: 5, na: 320 }, unit: "1 bowl (~250 g)", score: 82, note: "Vegetable-forward with good fibre; dressing drives the fat content." },
  { keys: ["chicken", "grilled chicken"], dish: "Grilled chicken breast", per: { kcal: 165, p: 31, c: 0, f: 3.6, fib: 0, sug: 0, na: 74 }, unit: "100 g", score: 92, note: "Lean, protein-dense and very low in saturated fat." },
  { keys: ["salmon"], dish: "Baked salmon fillet", per: { kcal: 208, p: 20, c: 0, f: 13, fib: 0, sug: 0, na: 59 }, unit: "100 g", score: 88, note: "Excellent omega-3 fat profile and high-quality protein." },
  { keys: ["steak", "beef"], dish: "Sirloin steak", per: { kcal: 271, p: 25, c: 0, f: 18, fib: 0, sug: 0, na: 60 }, unit: "100 g", score: 62, note: "Good protein but a meaningful share of saturated fat." },
  { keys: ["egg", "eggs"], dish: "Scrambled eggs", per: { kcal: 148, p: 10, c: 1.6, f: 11, fib: 0, sug: 1.4, na: 146 }, unit: "2 large eggs", score: 78, note: "Nutrient-dense protein; watch the added butter or oil." },
  { keys: ["oat", "oatmeal", "porridge"], dish: "Oatmeal with milk", per: { kcal: 220, p: 9, c: 34, f: 5.5, fib: 4.5, sug: 9, na: 95 }, unit: "1 bowl (~300 g)", score: 84, note: "Beta-glucan fibre supports satiety and cholesterol management." },
  { keys: ["smoothie"], dish: "Fruit smoothie", per: { kcal: 210, p: 5, c: 44, f: 2.4, fib: 5.5, sug: 33, na: 45 }, unit: "1 glass (~350 ml)", score: 66, note: "Good micronutrients, but free sugars add up quickly." },
  { keys: ["coffee", "latte", "cappuccino"], dish: "Latte", per: { kcal: 135, p: 7, c: 11, f: 7, fib: 0, sug: 10, na: 90 }, unit: "1 medium (~350 ml)", score: 70, note: "Mostly milk; calories depend heavily on the type of milk." },
  { keys: ["beer"], dish: "Lager beer", per: { kcal: 140, p: 1.5, c: 11, f: 0, fib: 0, sug: 0.5, na: 14 }, unit: "1 can (330 ml)", score: 45, note: "Alcohol calories with no meaningful micronutrient contribution." },
  { keys: ["pasta", "spaghetti"], dish: "Pasta with tomato sauce", per: { kcal: 320, p: 11, c: 58, f: 5.5, fib: 4, sug: 9, na: 480 }, unit: "1 plate (~300 g)", score: 61, note: "Refined carbs dominate; add protein and vegetables to balance." },
  { keys: ["sushi"], dish: "Salmon nigiri set", per: { kcal: 350, p: 20, c: 51, f: 7, fib: 1.2, sug: 6, na: 720 }, unit: "6 pieces (~200 g)", score: 72, note: "Lean protein and omega-3s, but white rice and soy sauce add carbs and sodium." },
  { keys: ["rice", "fried rice"], dish: "Steamed white rice", per: { kcal: 205, p: 4.3, c: 45, f: 0.4, fib: 0.6, sug: 0.1, na: 2 }, unit: "1 cup cooked (158 g)", score: 55, note: "Quick-digesting carbohydrate with little fibre." },
  { keys: ["banana"], dish: "Banana", per: { kcal: 105, p: 1.3, c: 27, f: 0.4, fib: 3.1, sug: 14, na: 1 }, unit: "1 medium (118 g)", score: 86, note: "Potassium and fibre with naturally occurring sugars." },
  { keys: ["apple"], dish: "Apple", per: { kcal: 95, p: 0.5, c: 25, f: 0.3, fib: 4.4, sug: 19, na: 2 }, unit: "1 medium (182 g)", score: 88, note: "High fibre and polyphenols for relatively few calories." },
  { keys: ["fries", "french fries"], dish: "French fries", per: { kcal: 365, p: 4, c: 48, f: 17, fib: 4, sug: 0.6, na: 246 }, unit: "medium serving (117 g)", score: 34, note: "Deep-fried starch — high energy density and sodium." },
  { keys: ["nuts", "almonds"], dish: "Mixed nuts", per: { kcal: 172, p: 5, c: 6, f: 15, fib: 2.5, sug: 1.2, na: 2 }, unit: "30 g handful", score: 80, note: "Heart-healthy fats and fibre, but very calorie dense." },
  { keys: ["yogurt", "yoghurt"], dish: "Greek yogurt", per: { kcal: 130, p: 12, c: 7, f: 5, fib: 0, sug: 6, na: 65 }, unit: "170 g pot", score: 83, note: "High protein and calcium; choose unsweetened to limit sugar." },
  { keys: ["bread", "toast"], dish: "Wholegrain bread", per: { kcal: 160, p: 7, c: 28, f: 2.5, fib: 4, sug: 3, na: 320 }, unit: "2 slices", score: 70, note: "Whole grains add fibre, though sodium adds up." },
];

const DEFAULT = { dish: "Mixed meal", per: { kcal: 480, p: 24, c: 52, f: 19, fib: 4.5, sug: 9, na: 620 }, unit: "1 serving (~350 g)", score: 58, note: "Balanced estimate for a typical mixed plate." };

function pick(text) {
  const t = String(text || "").toLowerCase();
  let best = null;
  for (const f of FOODS) {
    for (const k of f.keys) {
      if (t.includes(k) && (!best || k.length > best.len)) best = { f, len: k.length };
    }
  }
  return best ? best.f : DEFAULT;
}

const round = (n) => Math.round(n);

export function demoAnalyze(text, hasImage) {
  const base = pick(text);
  const per = base.per;
  const items = [
    { name: base.dish, quantity: base.unit, calories: per.kcal, protein_g: per.p, carbs_g: per.c, fat_g: per.f, fiber_g: per.fib, sugar_g: per.sug, sodium_mg: per.na },
  ];
  const total = { calories: per.kcal, protein_g: per.p, carbs_g: per.c, fat_g: per.f, fiber_g: per.fib, sugar_g: per.sug, sodium_mg: per.na };
  const micros = [
    { key: "saturated_fat_g", label: "Saturated fat", unit: "g", value: round(per.f * 0.32 * 10) / 10 },
    { key: "cholesterol_mg", label: "Cholesterol", unit: "mg", value: round(per.kcal * 0.06) },
    { key: "potassium_mg", label: "Potassium", unit: "mg", value: round(per.kcal * 1.4) },
    { key: "calcium_mg", label: "Calcium", unit: "mg", value: round(per.kcal * 0.42) },
    { key: "iron_mg", label: "Iron", unit: "mg", value: round(per.kcal * 0.012 * 10) / 10 },
    { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", value: round(per.kcal * 0.08) },
    { key: "sodium_mg", label: "Sodium", unit: "mg", value: per.na },
  ];
  const score = base.score;
  return {
    dish: base.dish,
    summary: hasImage
      ? "Demo estimate based on the description. Connect a vision model in Settings for a real photo analysis."
      : "Demo estimate from a built-in food database. Connect a model in Settings to analyse your food.",
    confidence: 0.55,
    portion_notes: `Assumed ${base.unit}.`,
    items,
    total,
    micros,
    health_score: score,
    health_label: labelForScore(score),
    health_summary: base.note,
    pros: per.p >= 15 ? ["Good source of protein"] : per.fib >= 3 ? ["Provides meaningful fibre"] : ["Contributes energy for the next few hours"],
    cons: per.na > 500 ? ["High in sodium"] : per.sug > 15 ? ["High in free sugars"] : per.f >= 12 ? ["Relatively high in fat"] : ["Refined carbohydrate content"],
    allergens: /pizza|burger|bread|pasta|toast/.test(base.dish.toLowerCase()) ? ["gluten", "milk"] : /salmon|sushi/.test(base.dish.toLowerCase()) ? ["fish"] : /yogurt|latte|cappuccino/.test(base.dish.toLowerCase()) ? ["milk"] : /nuts|almonds/.test(base.dish.toLowerCase()) ? ["tree nuts"] : [],
    swaps: [{ from: "This choice", to: "Add a vegetable side", why: "Lifts fibre and micronutrients without many calories." }],
    confidence_notes: "Demo mode: add an API key in Settings to analyse photos and arbitrary foods.",
    meta: { demo: true },
  };
}