/* ======================================================================
   NutriLens — Recipe Studio UI
   Recipes exist in memory only; the sole preference saved is guide dismissal.
   ====================================================================== */

import { generateRecipes } from "./recipe-ai.js";
import { esc, fmt } from "./render.js";
import { translate } from "./i18n.js";

const $ = (selector, root = document) => root.querySelector(selector);
const GUIDE_KEY = "nutrilens.recipesGuideDismissed.v1";

export function initRecipeStudio({ getSettings, isProviderReady, openSettings }) {
  const form = $("#recipe-form");
  const request = $("#recipe-instructions");
  const servings = $("#recipe-servings");
  const time = $("#recipe-time");
  const generateButton = $("#recipe-generate");
  const generateLabel = $("#recipe-generate-label");
  const setupNote = $("#recipe-setup-note");
  const errorNote = $("#recipe-error");
  const status = $("#recipe-status");
  const statusText = $("#recipe-status-text");
  const cancelButton = $("#recipe-cancel");
  const empty = $("#recipe-empty");
  const resultsList = $("#recipe-results-list");
  const announcement = $("#recipe-announcement");
  const guide = $("#recipe-guide");
  let controller = null;
  let busy = false;
  let recipes = null;
  let guideDismissedThisSession = false;

  const lang = () => getSettings()?.language || "en";
  const tr = phrase => translate(phrase, lang());
  const escAI = value => `<span data-i18n-skip>${esc(value)}</span>`;

  function guideWasDismissed() {
    if (guideDismissedThisSession) return true;
    try { return localStorage.getItem(GUIDE_KEY) === "1"; }
    catch { return false; }
  }

  function showGuide() {
    guide.hidden = guideWasDismissed();
  }

  function renderRecipe(recipe) {
    const nutrition = recipe.nutrition;
    const totalMinutes = recipe.prep_minutes + recipe.cook_minutes;
    const tags = recipe.tags.length
      ? `<div class="recipe-tags">${recipe.tags.map(tag => `<span class="recipe-tag" data-i18n-skip>${esc(tag)}</span>`).join("")}</div>`
      : "";
    const ingredients = recipe.ingredients.map(ingredient => `<li>${ingredient.amount ? `<span class="recipe-ingredient-amount" data-i18n-skip>${esc(ingredient.amount)}</span> ` : ""}<span data-i18n-skip>${esc(ingredient.name)}</span></li>`).join("");    const steps = recipe.steps.map(step => `<li><span data-i18n-skip>${esc(step)}</span></li>`).join("");
    const swaps = recipe.swaps.length
      ? `<div class="recipe-swaps"><strong>${tr("Possible swaps")}:</strong> ${recipe.swaps.map(escAI).join(" · ")}</div>`
      : "";
    const tip = recipe.chef_tip
      ? `<div class="recipe-tip"><strong>${tr("Chef’s tip")}:</strong> ${escAI(recipe.chef_tip)}</div>`
      : "";
    return `<article class="recipe-card">
      <div class="recipe-card-top"><div><h3>${escAI(recipe.title)}</h3>${recipe.description ? `<p class="recipe-card-description">${escAI(recipe.description)}</p>` : ""}</div><span class="recipe-difficulty">${tr(recipe.difficulty)}</span></div>
      ${tags}
      <ul class="recipe-meta"><li>◷ ${fmt(totalMinutes)} ${tr("min")}</li><li>${fmt(recipe.servings)} ${tr("servings")}</li></ul>
      <section class="recipe-nutrition" aria-label="${esc(tr("Estimated nutrition per serving"))}"><div class="recipe-nutrition-head"><h4>${tr("Estimated nutrition per serving")}</h4><small>${tr("Approximate values")}</small></div>
        <div class="recipe-nutrients">
          <div class="recipe-nutrient"><strong>${fmt(nutrition.calories)}</strong><span>${tr("kcal")}</span></div>
          <div class="recipe-nutrient"><strong>${fmt(nutrition.protein_g, 1)} g</strong><span>${tr("Protein")}</span></div>
          <div class="recipe-nutrient"><strong>${fmt(nutrition.carbs_g, 1)} g</strong><span>${tr("Carbs")}</span></div>
          <div class="recipe-nutrient"><strong>${fmt(nutrition.fat_g, 1)} g</strong><span>${tr("Fat")}</span></div>
          <div class="recipe-nutrient"><strong>${fmt(nutrition.fiber_g, 1)} g</strong><span>${tr("Fiber")}</span></div>
        </div>
      </section>
      <div class="recipe-detail-grid">
        <section><h4 class="recipe-detail-heading"><span aria-hidden="true">◌</span>${tr("Ingredients")}</h4><ul class="recipe-ingredients">${ingredients}</ul></section>
        <section><h4 class="recipe-detail-heading"><span aria-hidden="true">↗</span>${tr("Steps")}</h4><ol class="recipe-steps">${steps}</ol></section>
      </div>
      ${tip}${swaps}
    </article>`;
  }

  function renderResults() {
    const hasRecipes = Boolean(recipes?.length);
    empty.hidden = hasRecipes;
    resultsList.innerHTML = hasRecipes ? recipes.map(renderRecipe).join("") : "";
  }

  function updateButton() {
    generateButton.disabled = busy;
    generateLabel.textContent = tr(busy ? "Generating…" : "Generate 3 recipes");
    generateButton.setAttribute("aria-busy", String(busy));
    cancelButton.hidden = !busy;
  }

  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (!request.value.trim()) {
      errorNote.textContent = tr("Tell us what you would like to cook first.");
      errorNote.hidden = false;
      request.focus();
      return;
    }
    if (!isProviderReady()) {
      setupNote.hidden = false;
      return;
    }
    setupNote.hidden = true;
    errorNote.hidden = true;
    announcement.textContent = "";
    status.hidden = false;
    statusText.textContent = tr("Creating recipe ideas…");
    controller = new AbortController();
    busy = true;
    updateButton();
    try {
      const result = await generateRecipes({
        instructions: request.value,
        servings: Number(servings.value),
        maxMinutes: Number(time.value),
        settings: getSettings(),
        onStatus: message => { statusText.textContent = message; },
        signal: controller.signal,
      });
      recipes = result;
      renderResults();
      announcement.textContent = `${result.length} ${tr("recipes ready.")}`;
      status.hidden = true;
    } catch (error) {
      if (error?.name === "AbortError") {
        statusText.textContent = tr("Generation cancelled.");
        status.hidden = false;
        setTimeout(() => { if (!busy) status.hidden = true; }, 2200);
      } else {
        if (error?.code === "RECIPE_CONSTRAINT" || error?.code === "RECIPE_CLARIFICATION") {
          recipes = null;
          renderResults();
        }
        const detail = error?.code === "RECIPE_CONSTRAINT"
          ? tr("A generated recipe included a food you asked to avoid. No recipes were shown. Please clarify your request and try again.")
          : error?.message || "Please try again.";
        errorNote.innerHTML = `<strong>${esc(tr("Could not generate recipes."))}</strong><br><span>${esc(detail)}</span>`;
        errorNote.hidden = false;
        status.hidden = true;
      }
    } finally {
      busy = false;
      controller = null;
      updateButton();
    }
  }

  form.addEventListener("submit", generate);
  cancelButton.addEventListener("click", () => controller?.abort());
  $("#recipe-guide-dismiss").addEventListener("click", () => {
    guide.hidden = true;
    guideDismissedThisSession = true;
    try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* Private browsing may disable storage. */ }
  });
  $("#recipe-settings-button").addEventListener("click", openSettings);
  document.addEventListener("nutrilens:recipes-open", showGuide);
  document.querySelectorAll("[data-recipe-idea]").forEach(button => button.addEventListener("click", () => {
    request.value = button.dataset.recipeIdea || "";
    errorNote.hidden = true;
    request.focus();
  }));

  renderResults();
  updateButton();
  return {
    refreshLanguage() {
      if (recipes) renderResults();
      if (!busy) updateButton();
      if (statusText && !status.hidden && !busy) statusText.textContent = tr("Generation cancelled.");
    },
  };
}