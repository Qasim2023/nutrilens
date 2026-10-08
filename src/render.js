import {formatDisplayText,withoutTextDashes} from "./interface-text.js";
import { foodPicture } from "./food-picture.js";
import { getLocale } from "./i18n.js";
import { cleanEstimateNotes } from "./estimate-notes.js";
/* ==========================================================================
   NutriLens — rendering helpers (SVG icons, result cards, charts)
   All output is escaped; model text is never injected as raw HTML.
   ========================================================================== */

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fmt(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const v = Number(n);
  const rounded = digits === 0 ? Math.round(v) : Number(v.toFixed(digits));
  return rounded.toLocaleString(getLocale(), { maximumFractionDigits: digits });
}

export function kcal(n) { return `${fmt(n)} kcal`; }

export const ICONS = {
  diary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 1v4M16 1v4M4 8h16M8 12h3M8 16h6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6L16 3zM13 6l5 5"/></svg>',
  paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 11-8 8a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.9-2.9l8.5-8.5"/></svg>',
  recipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="#04140e" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/><circle cx="12" cy="12" r="2.6" fill="#04140e" stroke="none"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3l-1.5-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m21 15-5-5L5 21"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.7 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" transform="translate(1 1) scale(.92)"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3.5 2"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4M3 8h13a4 4 0 0 1 4 4M17 20l4-4-4-4M21 16H8a4 4 0 0 1-4-4"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13c0-6 5-9 16-9 0 11-5 16-9 16z"/><path d="M4 21c3-6 8-10 13-12"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 6-6 6 6 6M16 6l6 6-6 6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6A17.4 17.4 0 0 0 2 11s3.6 7 10 7a10.8 10.8 0 0 0 4.4-.9M3 3l18 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
};
/* --------------------------------------------------------------------------
   Colour helpers
   -------------------------------------------------------------------------- */

function scoreColor(score) {
  if (score >= 80) return "#34d399";
  if (score >= 60) return "#a3e635";
  if (score >= 40) return "#fbbf24";
  return "#f87171";
}

const MACRO_COLORS = { protein_g: "#60a5fa", carbs_g: "#fbbf24", fat_g: "#f472b6" };
const MACRO_LABELS = { protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat" };

function donut(total) {
  const parts = [
    { key: "protein_g", kcal: total.protein_g * 4 },
    { key: "carbs_g", kcal: total.carbs_g * 4 },
    { key: "fat_g", kcal: total.fat_g * 9 },
  ];
  const sum = parts.reduce((a, b) => a + b.kcal, 0) || 1;
  const r = 78, c = 2 * Math.PI * r;
  let offset = 0;
  const segs = parts
    .map((p) => {
      const len = (p.kcal / sum) * c;
      const seg = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${MACRO_COLORS[p.key]}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"/>`;
      offset += len;
      return seg;
    })
    .join("");
  const macroKcal = Math.round(sum);
  return `<svg viewBox="0 0 200 200" role="img" aria-label="Macro split">
      <circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--border)" stroke-width="20"/>
      ${segs}
    </svg>
    <div class="center"><b>${fmt(macroKcal)}</b><span>kcal from macros</span></div>`;
}

function gauge(score) {
  const r = 56, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const len = (pct / 100) * c;
  const col = scoreColor(pct);
  return `<svg viewBox="0 0 132 132" role="img" aria-label="Health score ${pct} out of 100">
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--border)" stroke-width="11"/>
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round"
        stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}"/>
    </svg>
    <div class="g-center"><b style="color:${col}">${pct}</b><span>/ 100</span></div>`;
}
/* --------------------------------------------------------------------------
   Result rendering
   -------------------------------------------------------------------------- */

const macroPct = (grams, kcalPerG, totalKcal) => {
  const kcal = grams * kcalPerG;
  return totalKcal > 0 ? Math.round((kcal / totalKcal) * 100) : 0;
};

function macroCard(key, value) {
  const totalKcal = value.total.protein_g * 4 + value.total.carbs_g * 4 + value.total.fat_g * 9;
  const perG = key === "fat_g" ? 9 : 4;
  const pct = macroPct(value.total[key], perG, totalKcal);
  return `<div class="macro">
      <div class="m-top"><span class="dot" style="background:${MACRO_COLORS[key]}"></span>${MACRO_LABELS[key]}</div>
      <div class="m-val">${fmt(value.total[key], value.total[key] < 10 ? 1 : 0)}<span class="u">g</span></div>
      <div class="m-bar"><i style="width:${pct}%;background:${MACRO_COLORS[key]}"></i></div>
      <div class="m-pct">${pct}% of macro energy</div>
    </div>`;
}

export function renderResult(r, opts = {}) {
  const conf = Math.round((r.confidence || 0) * 100);
  const confClass = conf >= 70 ? "conf" : "warn";
  const notes = [];
  (r.pros || []).forEach((p) => notes.push({ kind: "good", text: p }));
  (r.cons || []).forEach((c) => notes.push({ kind: "bad", text: c }));

  const picture = foodPicture(r);
  const thumb = opts.imageUrl
    ? `<img class="result-thumb" src="${esc(opts.imageUrl)}" alt="Analysed food photo">`
    : `<img class="result-thumb food-illustration" src="${esc(picture.src)}" alt="${esc(picture.alt)}" title="${esc(picture.title)}" data-food-theme="${picture.theme}" data-food-multiple="${picture.multiple}">`;

  const itemsHtml = r.items.length
    ? `<div class="items">
        <div class="item head">
          <div>Item</div><div class="num">kcal</div>
          <div class="num hide-sm">Protein</div><div class="num hide-sm">Carbs</div>
          <div class="num hide-sm">Fat</div><div class="num">Portion</div>
        </div>
        ${r.items.map((it) => `<div class="item">
          <div class="name"><span data-i18n-skip>${esc(withoutTextDashes(it.name))}</span>${it.sugar_g > 0 ? `<small>Sugar ${fmt(it.sugar_g, 1)} g · Fiber ${fmt(it.fiber_g, 1)} g</small>` : ""}</div>
          <div class="num kcal">${fmt(it.calories)}</div>
          <div class="num hide-sm">${fmt(it.protein_g, 1)} g</div>
          <div class="num hide-sm">${fmt(it.carbs_g, 1)} g</div>
          <div class="num hide-sm">${fmt(it.fat_g, 1)} g</div>
          <div class="num">${esc(formatDisplayText(it.quantity || "—"))}</div>
        </div>`).join("")}
      </div>`
    : "";

  const microHtml = opts.showMicros && r.micros.length
    ? `<div class="section-title">Micronutrients</div>
       <div class="micros">${r.micros.map((m) => `<div class="micro"><span class="k">${esc(m.label)}</span><span class="v">${fmt(m.value, m.value < 10 ? 1 : 0)} ${esc(m.unit)}</span></div>`).join("")}</div>`
    : "";

  const swapsHtml = opts.showSwaps && r.swaps.length
    ? `<div class="section-title">Smart swaps</div>
       <div class="items">${r.swaps.map((s) => `<div class="item" style="grid-template-columns:1fr">
          <div class="name" data-i18n-skip><span style="color:var(--text-3)">${esc(withoutTextDashes(s.from))}</span> → <span style="color:var(--brand)">${esc(withoutTextDashes(s.to))}</span>
          ${s.why ? `<small>${esc(formatDisplayText(s.why))}</small>` : ""}</div>
        </div>`).join("")}</div>`
    : "";

  const allergensHtml = r.allergens.length
    ? `<div class="badges" style="margin-top:14px">${r.allergens.map((a) => `<span class="badge warn" data-i18n-skip>⚠ ${esc(withoutTextDashes(a))}</span>`).join("")}</div>`
    : "";

  const estimateBadge = opts.isEstimate
    ? `<span class="badge warn">${ICONS.info.replace("<svg", '<svg style="width:12px;height:12px;vertical-align:-1px"')} Demo estimate — connect a model for real analysis</span>`
    : `<span class="badge ${confClass}">${conf}% estimate confidence</span>`;

  return `<div class="card" data-role="result-card">
    <div class="result-head">
      ${thumb}
      <div class="result-title">
        <h2 data-i18n-skip>${esc(withoutTextDashes(r.dish))}</h2>
        <div class="sub" data-i18n-skip>${esc(formatDisplayText(r.summary))}</div>
        <div class="badges">
          ${estimateBadge}
          ${r.items.length ? `<span class="badge">${r.items.length} item${r.items.length === 1 ? "" : "s"}</span>` : ""}
          ${opts.model ? `<span class="badge" data-i18n-skip>${esc(opts.model)}</span>` : ""}
          ${(r.meta?.attachments || []).map(name => `<span class="badge" title="Recipe reference" data-i18n-skip>${esc(name)}</span>`).join("")}
        </div>
      </div>
    </div>

    <div class="total-row">
      <div class="total-kcal">${fmt(r.total.calories)}<span class="unit">kcal</span></div>
      <div class="total-note">total estimated energy for the portion${r.portion_notes ? ` · <span data-i18n-skip>${esc(formatDisplayText(r.portion_notes))}</span>` : ""}</div>
    </div>

    <div class="macros">
      ${macroCard("protein_g", r)}
      ${macroCard("carbs_g", r)}
      ${macroCard("fat_g", r)}
    </div>


    <div class="section-title">Macro split</div><div class="status-line" style="font-size:12px;margin-bottom:12px">Calculated using 4 / 4 / 9 kcal per gram; may differ from total calories because of fibre and rounding.</div>
    <div class="charts">
      <div class="donut-wrap">${donut(r.total)}</div>
      <div class="legend">
        ${["protein_g", "carbs_g", "fat_g"].map((k) => `<div class="row"><span class="dot" style="background:${MACRO_COLORS[k]}"></span><span class="lbl">${MACRO_LABELS[k]}</span><span class="val">${fmt(r.total[k], 1)} g</span></div>`).join("")}
        <div class="row" style="border-top:1px solid var(--border);padding-top:10px"><span class="dot" style="background:var(--border-strong)"></span><span class="lbl">Fiber</span><span class="val">${fmt(r.total.fiber_g, 1)} g</span></div>
        <div class="row"><span class="dot" style="background:var(--border-strong)"></span><span class="lbl">Sugar</span><span class="val">${fmt(r.total.sugar_g, 1)} g</span></div>
        <div class="row"><span class="dot" style="background:var(--border-strong)"></span><span class="lbl">Sodium</span><span class="val">${fmt(r.total.sodium_mg)} mg</span></div>
      </div>
    </div>

    ${microHtml}
    ${opts.showItems && itemsHtml ? `<div class="section-title">Breakdown</div>${itemsHtml}` : ""}
    ${allergensHtml}
  </div>

  <div class="card">
    <div class="score-card">
      <div class="gauge">${gauge(r.health_score)}</div>
      <div class="score-body">
        <h3><span>${esc(withoutTextDashes(r.health_label))}</span> · <span>Nutritional quality</span></h3>
        <p data-i18n-skip>${esc(formatDisplayText(r.health_summary || "Overall quality of this meal based on macro balance, fibre, sugar and sodium."))}</p>
        ${notes.length ? `<ul class="notes">${notes.map((n) => `<li class="${n.kind}">${n.kind === "good" ? ICONS.check : ICONS.alert}<span data-i18n-skip>${esc(formatDisplayText(n.text))}</span></li>`).join("")}</ul>` : ""}
      </div>
    </div>
    ${swapsHtml}
    ${cleanEstimateNotes(r.confidence_notes) ? `<div class="status-line" style="margin-top:16px">${ICONS.info}<span data-i18n-skip>${esc(formatDisplayText(cleanEstimateNotes(r.confidence_notes)))}</span></div>` : ""}
    ${opts.showActions!==false ? `<div class="result-actions" data-actions>
      <button class="btn btn-sm" type="button" data-action="analyse-again">${ICONS.spark} Analyse again</button>
      ${!r.meta?.demo ? `<button class="btn btn-primary btn-sm" data-action="log-diary">${ICONS.diary} Log to diary</button>` : ""}
      <button class="btn btn-sm" data-action="copy">${ICONS.copy} Copy summary</button>
      <button class="btn btn-sm" data-action="download-md">${ICONS.download} Markdown</button>
      <button class="btn btn-sm" data-action="download-csv">${ICONS.download} CSV</button>
      <button class="btn btn-sm" data-action="print">${ICONS.print} Print</button>
    </div>` : ""}
  </div>`;
}

export function renderLoading(status) {
  return `<div class="card loading">
    <div class="loading-status"><span class="spinner"></span><span>${esc(status || "Analysing…")}</span></div>
    <div style="display:flex;gap:14px;margin-top:20px">
      <div class="skeleton" style="width:76px;height:76px;flex:none"></div>
      <div style="flex:1">
        <div class="skeleton" style="height:20px;width:46%"></div>
        <div class="skeleton" style="height:13px;width:78%;margin-top:10px"></div>
        <div class="skeleton" style="height:13px;width:60%;margin-top:7px"></div>
      </div>
    </div>
    <div class="skeleton" style="height:42px;width:34%;margin-top:22px"></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px">
      <div class="skeleton" style="height:96px"></div>
      <div class="skeleton" style="height:96px"></div>
      <div class="skeleton" style="height:96px"></div>
    </div>
  </div>`;
}

export function renderError(message) {
  return `<div class="card">
    <div class="result-head">
      <div class="result-thumb" style="display:grid;place-items:center;background:rgba(248,113,113,.12);color:var(--danger);border-color:rgba(248,113,113,.4)">${ICONS.alert}</div>
      <div class="result-title">
        <h2>Analysis failed</h2>
        <div class="sub" style="white-space:pre-wrap">${esc(message)}</div>
        <div class="badges"><span class="badge">Check Settings → Endpoint &amp; model</span></div>
      </div>
    </div>
    <div class="result-actions">
      <button class="btn btn-primary" data-action="open-settings">${ICONS.settings} Open settings</button>
      <button class="btn" data-action="retry">${ICONS.spark} Retry</button>
    </div>
  </div>`;
}
/* --------------------------------------------------------------------------
   Export helpers
   -------------------------------------------------------------------------- */

export function resultToMarkdown(r, meta = {}) {
  const lines = [];
  lines.push(`# ${r.dish}`);
  if (r.summary) lines.push("", r.summary);
  lines.push("", `**Total:** ${fmt(r.total.calories)} kcal`);
  lines.push(`**Macros:** Protein ${fmt(r.total.protein_g, 1)} g · Carbs ${fmt(r.total.carbs_g, 1)} g · Fat ${fmt(r.total.fat_g, 1)} g`);
  lines.push(`**Other:** Fiber ${fmt(r.total.fiber_g, 1)} g · Sugar ${fmt(r.total.sugar_g, 1)} g · Sodium ${fmt(r.total.sodium_mg)} mg`);
  if (meta.model) lines.push(`**Model:** ${meta.model}`);
  if (r.meta?.attachments?.length) lines.push(`**Recipe references:** ${r.meta.attachments.join(", ")}`);
  lines.push(`**Confidence:** ${Math.round((r.confidence || 0) * 100)}%`);
  if (r.items.length) {
    lines.push("", "## Breakdown", "", "| Item | Portion | kcal | Protein | Carbs | Fat |", "| --- | --- | ---: | ---: | ---: | ---: |");
    for (const it of r.items) {
      lines.push(`| ${it.name} | ${it.quantity || "—"} | ${fmt(it.calories)} | ${fmt(it.protein_g, 1)} g | ${fmt(it.carbs_g, 1)} g | ${fmt(it.fat_g, 1)} g |`);
    }
  }
  if (r.micros.length) {
    lines.push("", "## Micronutrients", "");
    for (const m of r.micros) lines.push(`- ${m.label}: ${fmt(m.value, m.value < 10 ? 1 : 0)} ${m.unit}`);
  }
  lines.push("", `## Health score: ${r.health_score}/100 — ${r.health_label}`);
  if (r.health_summary) lines.push("", r.health_summary);
  if (r.pros.length) { lines.push("", "**Positives**"); r.pros.forEach((p) => lines.push(`- ${p}`)); }
  if (r.cons.length) { lines.push("", "**Cautions**"); r.cons.forEach((c) => lines.push(`- ${c}`)); }
  if (r.swaps.length) { lines.push("", "**Smart swaps**"); r.swaps.forEach((s) => lines.push(`- ${s.from} → ${s.to}${s.why ? ` (${s.why})` : ""}`)); }
  if (r.allergens.length) lines.push("", `**Allergens:** ${r.allergens.join(", ")}`);
  lines.push("", "---", "_Nutrition values are estimates. Not medical or dietary advice._");
  return lines.join("\n");
}

export function resultToCsv(r) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["item", "quantity", "calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"]];
  for (const it of r.items) rows.push([it.name, it.quantity, it.calories, it.protein_g, it.carbs_g, it.fat_g, it.fiber_g, it.sugar_g, it.sodium_mg]);
  rows.push(["TOTAL", "", r.total.calories, r.total.protein_g, r.total.carbs_g, r.total.fat_g, r.total.fiber_g, r.total.sugar_g, r.total.sodium_mg]);
  return rows.map((row) => row.map(q).join(",")).join("\n");
}
