const state = {
  mode: "normal",
  favorites: [],
  calcAns: null,
  calcLog: [],
  showHistory: false,
  dragFavoriteId: null,
  dragTargetFavoriteId: null,
  dragTargetPosition: "before",
  dragCategoryName: null,
  dragCategoryTargetName: null,
  dragCategoryPosition: "before",
  nextFavoriteId: 1,
  sortByCategory: true,
  collapsedCategories: new Set(),
  categoryOrder: [],
  pendingRemoval: null,
  favoritesAutosaveTimerId: null,
  subcategoryFilter: "all",
  collapsedSubcategories: new Set(),
  darkMode: false,
  background: "harbor",
  denseMode: false,
};

const shellEl = document.getElementById("shell");
const notationInput = document.getElementById("notation");
const statusEl = document.getElementById("status");
const latestResultEl = document.getElementById("latest-result");
const historyPanelEl = document.querySelector(".history-panel");
const historyListEl = document.getElementById("history-list");
const favoriteSavePanelEl = document.getElementById("favorite-save-panel");
const favoriteNotationPreviewInput = document.getElementById("favorite-notation-preview");
const favoriteNameInput = document.getElementById("favorite-name");
const favoriteCategoryInput = document.getElementById("favorite-category");
const favoriteSubcategoryInput = document.getElementById("favorite-subcategory");
const favoriteSearchInput = document.getElementById("favorite-search");
const favoritesHintEl = document.getElementById("favorites-hint");
const subcategoryFiltersEl = document.getElementById("subcategory-filters");
const favoritesListEl = document.getElementById("favorites-list");
const settingsPanelEl = document.getElementById("settings-panel");
const toggleHistoryBtn = document.getElementById("toggle-history-btn");
const confirmSaveFavoriteBtn = document.getElementById("confirm-save-favorite-btn");
const cancelSaveFavoriteBtn = document.getElementById("cancel-save-favorite-btn");
const toggleCategorySortBtn = document.getElementById("toggle-category-sort-btn");
const toggleCollapseAllBtn = document.getElementById("toggle-collapse-all-btn");
const darkModeToggle = document.getElementById("dark-mode-toggle");
const denseModeToggle = document.getElementById("dense-mode-toggle");
const backgroundSelect = document.getElementById("background-select");
const resetLayoutBtn = document.getElementById("reset-layout-btn");
const calcExpressionInput = document.getElementById("calc-expression");
const calcStatusEl = document.getElementById("calc-status");
const calcLogEl = document.getElementById("calc-log");

const modeSwitch = document.getElementById("mode-switch");
modeSwitch.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) {
    return;
  }

  state.mode = button.dataset.mode;
  modeSwitch.querySelectorAll(".pill").forEach((pill) => {
    pill.classList.toggle("active", pill === button);
  });
});

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "request failed");
  }

  return payload;
}

function setStatus(message, isError = false) {
  statusEl.innerHTML = "";
  const textNode = document.createElement("span");
  textNode.textContent = message;
  statusEl.appendChild(textNode);
  statusEl.style.color = isError ? "#be2f17" : "#1f8a78";
}

function setStatusWithUndo(message, onUndo) {
  setStatus(message);
  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "status-link-btn";
  undoBtn.textContent = "Undo";
  undoBtn.addEventListener("click", onUndo);
  statusEl.appendChild(undoBtn);
}

function scheduleFavoritesAutosave() {
  if (state.favoritesAutosaveTimerId) {
    clearTimeout(state.favoritesAutosaveTimerId);
  }

  state.favoritesAutosaveTimerId = window.setTimeout(async () => {
    state.favoritesAutosaveTimerId = null;
    try {
      await persistFavorites(undefined, { quiet: true });
    } catch (error) {
      setStatus(error.message, true);
    }
  }, 700);
}

function setCalcStatus(message, isError = false) {
  calcStatusEl.textContent = message;
  calcStatusEl.style.color = isError ? "#be2f17" : "#1f8a78";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displaySubcategory(value) {
  return (value || "").trim() || "Unsorted";
}

function countNoteLines(notes) {
  return (notes || "")
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function getSubcategoryCollapseKey(categoryName, subcategoryName) {
  return `${categoryName}::${subcategoryName}`;
}

function getFavoriteCategory(favorite) {
  return (favorite.category || "General").trim() || "General";
}

function getFavoriteSubcategory(favorite) {
  return displaySubcategory(favorite.subcategory);
}

function createFavoriteId() {
  const id = `fav-${state.nextFavoriteId}`;
  state.nextFavoriteId += 1;
  return id;
}

function ensureFavoriteIds() {
  state.favorites.forEach((favorite) => {
    if (!favorite._id) {
      favorite._id = createFavoriteId();
    }
  });
}

function setHistoryVisibility(show) {
  state.showHistory = show;
  shellEl.classList.toggle("history-hidden", !show);
  toggleHistoryBtn.textContent = show ? "Hide Recent Rolls" : "Show Recent Rolls";
  historyPanelEl.setAttribute("aria-hidden", show ? "false" : "true");
}

function setFavoriteSavePanelVisibility(show) {
  favoriteSavePanelEl.classList.toggle("hidden", !show);
  favoriteSavePanelEl.setAttribute("aria-hidden", show ? "false" : "true");
  if (show) {
    favoriteNameInput.focus();
  }
}

function applyAppearance() {
  document.body.classList.toggle("dark-mode", state.darkMode);
  document.body.classList.remove("bg-harbor", "bg-ember", "bg-forest", "bg-midnight", "bg-sunrise", "bg-glacier");
  document.body.classList.add(`bg-${state.background}`);

  darkModeToggle.checked = state.darkMode;
  backgroundSelect.value = state.background;
}

function persistAppearance() {
  localStorage.setItem("dice-atlas-dark-mode", state.darkMode ? "1" : "0");
  localStorage.setItem("dice-atlas-background", state.background);
}

function loadAppearance() {
  const darkModeStored = localStorage.getItem("dice-atlas-dark-mode");
  const backgroundStored = localStorage.getItem("dice-atlas-background");

  state.darkMode = darkModeStored === "1";
  if (["harbor", "ember", "forest", "midnight", "sunrise", "glacier"].includes(backgroundStored)) {
    state.background = backgroundStored;
  }
}

function applyDensityMode() {
  shellEl.classList.toggle("dense-mode", state.denseMode);
  denseModeToggle.checked = state.denseMode;
}

function loadDensityMode() {
  state.denseMode = localStorage.getItem("dice-atlas-dense-mode") === "1";
}

function loadCollapsedSubcategories() {
  try {
    const stored = localStorage.getItem("dice-atlas-collapsed-subcategories");
    if (!stored) {
      return;
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      state.collapsedSubcategories = new Set(parsed.filter((entry) => typeof entry === "string"));
    }
  } catch (_error) {
    state.collapsedSubcategories = new Set();
  }
}

function persistCollapsedSubcategories() {
  localStorage.setItem(
    "dice-atlas-collapsed-subcategories",
    JSON.stringify([...state.collapsedSubcategories])
  );
}

function persistDensityMode() {
  localStorage.setItem("dice-atlas-dense-mode", state.denseMode ? "1" : "0");
}

function loadCategoryOrder() {
  try {
    const stored = localStorage.getItem("dice-atlas-category-order");
    if (!stored) {
      return;
    }

    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      state.categoryOrder = parsed.filter((entry) => typeof entry === "string");
    }
  } catch (_error) {
    state.categoryOrder = [];
  }
}

function persistCategoryOrder() {
  localStorage.setItem("dice-atlas-category-order", JSON.stringify(state.categoryOrder));
}

function getAllCategoryNames() {
  const uniqueCategories = [...new Set(state.favorites.map((favorite) => getFavoriteCategory(favorite)))].sort((left, right) =>
    left.localeCompare(right)
  );

  if (state.categoryOrder.length === 0) {
    state.categoryOrder = uniqueCategories;
    return [...state.categoryOrder];
  }

  const present = new Set(uniqueCategories);
  const kept = state.categoryOrder.filter((categoryName) => present.has(categoryName));
  const missing = uniqueCategories.filter((categoryName) => !kept.includes(categoryName));
  const merged = [...kept, ...missing];

  if (merged.length !== state.categoryOrder.length || merged.some((categoryName, index) => categoryName !== state.categoryOrder[index])) {
    state.categoryOrder = merged;
    persistCategoryOrder();
  }

  return [...state.categoryOrder];
}

function reorderCategories(sourceCategoryName, targetCategoryName, dropPosition) {
  if (!sourceCategoryName || !targetCategoryName || sourceCategoryName === targetCategoryName) {
    return;
  }

  const ordered = [...getAllCategoryNames()];
  const sourceIndex = ordered.indexOf(sourceCategoryName);
  const targetIndex = ordered.indexOf(targetCategoryName);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  ordered.splice(sourceIndex, 1);

  let insertIndex = targetIndex;
  if (sourceIndex < targetIndex) {
    insertIndex -= 1;
  }
  if (dropPosition === "after") {
    insertIndex += 1;
  }

  ordered.splice(Math.max(0, insertIndex), 0, sourceCategoryName);
  state.categoryOrder = ordered;
  persistCategoryOrder();
}

function updateCategoryControls() {
  toggleCategorySortBtn.textContent = state.sortByCategory ? "Category Sort: On" : "Category Sort: Off";
  toggleCollapseAllBtn.disabled = !state.sortByCategory;
  toggleCollapseAllBtn.textContent = state.collapsedCategories.size > 0 ? "Expand All" : "Collapse All";
}

function updateFavoritesHint(groups, allVisibleCollapsed) {
  if (!state.sortByCategory) {
    favoritesHintEl.textContent = "Tip: Turn Category Sort on to group and collapse favorites.";
    return;
  }

  if (!groups || groups.length <= 1) {
    favoritesHintEl.textContent = "";
    return;
  }

  favoritesHintEl.textContent = allVisibleCollapsed
    ? "Tip: All categories are collapsed. Drag category cards to reorder them."
    : "Tip: Collapse all categories to enable category drag reorder.";
}

function renderSubcategoryFilters() {
  const subcategories = [...new Set(state.favorites.map((favorite) => getFavoriteSubcategory(favorite)))].sort((left, right) =>
    left.localeCompare(right)
  );

  subcategoryFiltersEl.innerHTML = "";
  if (subcategories.length <= 1) {
    subcategoryFiltersEl.hidden = true;
    state.subcategoryFilter = "all";
    return;
  }

  subcategoryFiltersEl.hidden = false;

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `chip${state.subcategoryFilter === "all" ? " active" : ""}`;
  allButton.textContent = "All Subcategories";
  allButton.addEventListener("click", () => {
    state.subcategoryFilter = "all";
    renderFavorites();
  });
  subcategoryFiltersEl.appendChild(allButton);

  subcategories.forEach((subcategoryName) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${state.subcategoryFilter === subcategoryName ? " active" : ""}`;
    button.textContent = subcategoryName;
    button.addEventListener("click", () => {
      state.subcategoryFilter = subcategoryName;
      renderFavorites();
    });
    subcategoryFiltersEl.appendChild(button);
  });
}

function renderResult(result) {
  const modifierText = result.modifier > 0 ? `+${result.modifier}` : `${result.modifier}`;
  const breakdown =
    result.modifier === 0
      ? `Dice [${result.results.join(", ")}] = ${result.total}`
      : `Dice [${result.results.join(", ")}] ${modifierText} = ${result.total}`;

  latestResultEl.innerHTML = `
    <h2>Latest Roll</h2>
    <p><strong>${result.notation}</strong> in ${result.mode} mode</p>
    <p>${breakdown}</p>
    ${result.info ? `<p class="muted">${result.info}</p>` : ""}
  `;
}

function renderHistory(items) {
  historyListEl.innerHTML = "";
  if (items.length === 0) {
    historyListEl.innerHTML = '<li class="history-item muted">No rolls yet.</li>';
    return;
  }

  const preview = items.slice(0, 12);
  preview.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "history-item";
    item.textContent = `${entry.notation} => [${entry.results.join(", ")}] = ${entry.total}`;
    historyListEl.appendChild(item);
  });
}

function tinyTrend(values) {
  if (!values.length) {
    return "n/a";
  }
  return values.map((v) => `<span style="font-size:${0.7 + Math.max(0.2, v / 20)}rem">|</span>`).join("");
}

function findFavoriteById(favoriteId) {
  return state.favorites.find((favorite) => favorite._id === favoriteId) || null;
}

function findFavoriteIndexById(favoriteId) {
  return state.favorites.findIndex((favorite) => favorite._id === favoriteId);
}

function normalizeFavoritePayload(favorite) {
  return {
    name: favorite.name,
    notation: favorite.notation,
    category: getFavoriteCategory(favorite),
    subcategory: (favorite.subcategory || "").trim(),
    notes: (favorite.notes || "").trim(),
  };
}

async function persistFavorites(successMessage, options = {}) {
  const { quiet = false } = options;
  if (state.pendingRemoval) {
    clearTimeout(state.pendingRemoval.timerId);
    state.pendingRemoval = null;
  }
  await api("/api/favorites/save", {
    method: "POST",
    body: JSON.stringify({ favorites: state.favorites.map(normalizeFavoritePayload) }),
  });
  if (!quiet) {
    setStatus(successMessage || "Favorites updated.");
  }
  await loadFavorites();
}

async function handleFavoriteEditSave(favoriteId, cardEl) {
  const favorite = findFavoriteById(favoriteId);
  if (!favorite) {
    return;
  }

  const nameInput = cardEl.querySelector('[data-field="name"]');
  const notationInputLocal = cardEl.querySelector('[data-field="notation"]');
  const categoryInput = cardEl.querySelector('[data-field="category"]');
  const subcategoryInput = cardEl.querySelector('[data-field="subcategory"]');
  const notesInput = cardEl.querySelector('[data-field="notes"]');

  const notation = notationInputLocal.value.trim();
  if (!notation) {
    setStatus("Notation cannot be empty.", true);
    return;
  }

  favorite.name = nameInput.value.trim() || notation;
  favorite.notation = notation;
  favorite.category = categoryInput.value.trim() || "General";
  favorite.subcategory = subcategoryInput.value.trim();
  favorite.notes = notesInput.value.trim();

  try {
    await persistFavorites("Favorite updated.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function handleFavoriteDrop(targetFavoriteId, targetCategory, targetSubcategory = null) {
  const sourceFavoriteId = state.dragFavoriteId;
  state.dragFavoriteId = null;

  if (!sourceFavoriteId) {
    return;
  }

  const sourceIndex = findFavoriteIndexById(sourceFavoriteId);
  if (sourceIndex < 0) {
    return;
  }

  const movingFavorite = state.favorites[sourceIndex];
  state.favorites.splice(sourceIndex, 1);

  if (targetFavoriteId) {
    const targetFavorite = findFavoriteById(targetFavoriteId);
    if (targetFavorite) {
      movingFavorite.category = getFavoriteCategory(targetFavorite);
      movingFavorite.subcategory = (targetFavorite.subcategory || "").trim();
    }
  }

  if (targetCategory && movingFavorite.category !== targetCategory) {
    movingFavorite.category = targetCategory;
    movingFavorite.subcategory = targetSubcategory && targetSubcategory !== "Unsorted" ? targetSubcategory : "";
  }

  if (targetCategory && targetSubcategory !== null && !targetFavoriteId) {
    movingFavorite.subcategory = targetSubcategory === "Unsorted" ? "" : targetSubcategory;
  }

  let insertIndex = state.favorites.length;
  if (targetFavoriteId) {
    const targetIndex = findFavoriteIndexById(targetFavoriteId);
    if (targetIndex < 0) {
      insertIndex = state.favorites.length;
    } else {
      insertIndex = state.dragTargetPosition === "after" ? targetIndex + 1 : targetIndex;
    }
  } else if (targetCategory) {
    insertIndex = 0;
    for (let idx = 0; idx < state.favorites.length; idx += 1) {
      if (getFavoriteCategory(state.favorites[idx]) === targetCategory) {
        insertIndex = idx + 1;
      }
    }
  }

  state.favorites.splice(insertIndex, 0, movingFavorite);

  try {
    await persistFavorites("Favorites reordered.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function getFavoriteRenderGroups(filteredFavorites) {
  if (!state.sortByCategory) {
    return [{ name: "Manual Order", favorites: filteredFavorites }];
  }

  const categoryNames = getAllCategoryNames();

  return categoryNames
    .map((categoryName) => ({
      name: categoryName,
      favorites: filteredFavorites.filter(
        (favorite) => getFavoriteCategory(favorite) === categoryName
      ),
    }))
    .filter((group) => group.favorites.length > 0);
}

function renderFavorites() {
  const query = favoriteSearchInput.value.trim().toLowerCase();
  const queryTokens = query.split(/\s+/).filter(Boolean);
  const filtered = state.favorites.filter((f) => {
    if (queryTokens.length === 0) {
      return true;
    }

    const haystack = `${f.name} ${f.notation} ${f.category} ${f.subcategory || ""} ${f.notes || ""}`.toLowerCase();
    return queryTokens.every((token) => haystack.includes(token));
  });

  const subcategoryFiltered =
    state.subcategoryFilter === "all"
      ? filtered
      : filtered.filter((favorite) => getFavoriteSubcategory(favorite) === state.subcategoryFilter);

  favoritesListEl.innerHTML = "";

  renderSubcategoryFilters();

  if (subcategoryFiltered.length === 0) {
    favoritesListEl.innerHTML = '<div class="history-item muted">No favorites matched.</div>';
    updateCategoryControls();
    updateFavoritesHint([], false);
    return;
  }

  const groups = getFavoriteRenderGroups(subcategoryFiltered);
  const allVisibleCollapsed = state.sortByCategory && groups.length > 0 && groups.every((group) => state.collapsedCategories.has(group.name));
  updateFavoritesHint(groups, allVisibleCollapsed);
  groups.forEach(({ name: categoryName, favorites: favoritesInCategory }) => {

    const categoryWrap = document.createElement("section");
    categoryWrap.className = "favorite-category";
    const isCollapsed = state.sortByCategory && state.collapsedCategories.has(categoryName);
    if (isCollapsed) {
      categoryWrap.classList.add("collapsed");
    }
    if (allVisibleCollapsed && groups.length > 1) {
      categoryWrap.classList.add("category-draggable");
      categoryWrap.setAttribute("draggable", "true");
    }

    categoryWrap.innerHTML = `
      <div class="favorite-category-head">
        <h3 class="favorite-category-title">${escapeHtml(categoryName)}</h3>
        <div class="actions">
          <span class="favorite-meta">${favoritesInCategory.length} item(s)</span>
          ${state.sortByCategory ? `<button class="category-collapse-btn" data-category-collapse="${escapeHtml(categoryName)}">${isCollapsed ? "Expand" : "Collapse"}</button>` : ""}
        </div>
      </div>
      <div class="favorite-category-list" data-category="${escapeHtml(categoryName)}"></div>
    `;

    const collapseButton = categoryWrap.querySelector("[data-category-collapse]");
    if (collapseButton) {
      collapseButton.addEventListener("click", () => {
        if (state.collapsedCategories.has(categoryName)) {
          state.collapsedCategories.delete(categoryName);
        } else {
          state.collapsedCategories.add(categoryName);
        }
        renderFavorites();
      });
    }

    const categoryList = categoryWrap.querySelector(".favorite-category-list");

    if (allVisibleCollapsed && groups.length > 1) {
      categoryWrap.addEventListener("dragstart", (event) => {
        state.dragCategoryName = categoryName;
        state.dragCategoryTargetName = null;
        state.dragCategoryPosition = "before";
        categoryWrap.classList.add("category-dragging");
        event.dataTransfer.effectAllowed = "move";
      });

      categoryWrap.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!state.dragCategoryName || state.dragCategoryName === categoryName) {
          return;
        }

        const rect = categoryWrap.getBoundingClientRect();
        const isAfter = event.clientY > rect.top + rect.height / 2;
        state.dragCategoryTargetName = categoryName;
        state.dragCategoryPosition = isAfter ? "after" : "before";
        categoryWrap.classList.add("category-drag-target");
        categoryWrap.classList.toggle("drop-line-top", !isAfter);
        categoryWrap.classList.toggle("drop-line-bottom", isAfter);
      });

      categoryWrap.addEventListener("dragleave", () => {
        categoryWrap.classList.remove("category-drag-target", "drop-line-top", "drop-line-bottom");
      });

      categoryWrap.addEventListener("drop", (event) => {
        event.preventDefault();
        const sourceCategoryName = state.dragCategoryName;
        const targetCategoryName = categoryName;
        const dropPosition = state.dragCategoryPosition;
        reorderCategories(sourceCategoryName, targetCategoryName, dropPosition);
        renderFavorites();
      });

      categoryWrap.addEventListener("dragend", () => {
        state.dragCategoryName = null;
        state.dragCategoryTargetName = null;
        state.dragCategoryPosition = "before";
        document
          .querySelectorAll(".category-dragging, .category-drag-target, .favorite-category.drop-line-top, .favorite-category.drop-line-bottom")
          .forEach((targetEl) => {
            targetEl.classList.remove("category-dragging", "category-drag-target", "drop-line-top", "drop-line-bottom");
          });
      });
    }

    const subcategoryNames = [...new Set(favoritesInCategory.map((favorite) => getFavoriteSubcategory(favorite)))].sort((left, right) =>
      left.localeCompare(right)
    );

    subcategoryNames.forEach((subcategoryName) => {
      const subcategoryKey = getSubcategoryCollapseKey(categoryName, subcategoryName);
      const isSubcategoryCollapsed = state.collapsedSubcategories.has(subcategoryKey);
      const subWrap = document.createElement("section");
      subWrap.className = "favorite-subcategory";
      if (isSubcategoryCollapsed) {
        subWrap.classList.add("collapsed");
      }
      subWrap.innerHTML = `
        <div class="favorite-subcategory-head">
          <h4 class="favorite-subcategory-title">${escapeHtml(subcategoryName)}</h4>
          <div class="actions">
            <span class="favorite-meta">${favoritesInCategory.filter((fav) => getFavoriteSubcategory(fav) === subcategoryName).length} item(s)</span>
            <button class="category-collapse-btn" type="button" data-subcategory-collapse="${escapeHtml(subcategoryKey)}">${isSubcategoryCollapsed ? "Expand" : "Collapse"}</button>
          </div>
        </div>
        <div class="favorite-subcategory-list"></div>
      `;

      const subList = subWrap.querySelector(".favorite-subcategory-list");
      const subCollapseButton = subWrap.querySelector("[data-subcategory-collapse]");
      subCollapseButton.addEventListener("click", () => {
        if (state.collapsedSubcategories.has(subcategoryKey)) {
          state.collapsedSubcategories.delete(subcategoryKey);
        } else {
          state.collapsedSubcategories.add(subcategoryKey);
        }
        persistCollapsedSubcategories();
        renderFavorites();
      });
      subList.addEventListener("dragover", (event) => {
        event.preventDefault();
        subList.classList.add("drop-target");
      });
      subList.addEventListener("dragleave", () => subList.classList.remove("drop-target"));
      subList.addEventListener("drop", async (event) => {
        event.preventDefault();
        subList.classList.remove("drop-target");
        await handleFavoriteDrop(null, categoryName, subcategoryName);
      });

      favoritesInCategory
        .filter((favorite) => getFavoriteSubcategory(favorite) === subcategoryName)
        .forEach((favorite) => {
          const item = document.createElement("article");
          item.className = "favorite-item";
          item.setAttribute("draggable", "true");
          item.dataset.favoriteId = favorite._id;

          const uses = favorite.stats?.uses ?? 0;
          const avg = favorite.stats?.session_avg;
          const avgText = avg == null ? "n/a" : avg.toFixed(2);
          const trend = tinyTrend(favorite.stats?.recent_totals ?? []);
          const notesText = (favorite.notes || "").trim();
          const noteLineCount = countNoteLines(notesText);
          const notePinned = Boolean(favorite.notePinned);

          item.innerHTML = `
            <div class="favorite-main">
              <div>
                <strong>${escapeHtml(favorite.name)}</strong>
                <div class="favorite-meta">${escapeHtml(favorite.notation)} in ${escapeHtml(getFavoriteCategory(favorite))}${subcategoryName === "Unsorted" ? "" : ` / ${escapeHtml(subcategoryName)}`}</div>
                <div class="favorite-meta">Session avg: ${escapeHtml(avgText)} over ${uses} roll(s) | Trend: ${trend}</div>
              </div>
              <div class="favorite-badges">
                ${noteLineCount > 0 ? `<span class="favorite-badge">${noteLineCount} note${noteLineCount === 1 ? "" : "s"}</span>` : ""}
                ${notePinned ? '<span class="favorite-badge favorite-badge-pinned">Pinned</span>' : ""}
              </div>
            </div>
            <div class="favorite-edit-grid favorite-edit-grid-wide">
              <label>Name
                <input data-field="name" type="text" value="${escapeHtml(favorite.name)}" />
              </label>
              <label>Notation
                <input data-field="notation" type="text" value="${escapeHtml(favorite.notation)}" />
              </label>
              <label>Category
                <input data-field="category" type="text" value="${escapeHtml(getFavoriteCategory(favorite))}" />
              </label>
              <label>Subcategory
                <input data-field="subcategory" type="text" value="${escapeHtml((favorite.subcategory || "").trim())}" placeholder="Optional" />
              </label>
            </div>
            <details class="favorite-notes">
              <summary>${notesText ? "Edit Notes" : "Add Notes"}</summary>
              <div class="favorite-notes-head">
                <span class="favorite-meta">${notePinned ? "Pinned note" : "Optional note section"}</span>
                <button type="button" class="btn ghost btn-compact favorite-note-pin-btn${notePinned ? " active" : ""}" data-action="toggle-note-pin">${notePinned ? "Unpin" : "Pin"}</button>
              </div>
              <textarea data-field="notes" rows="3" placeholder="Track arrows, range, ammo, reminders...">${escapeHtml(notesText)}</textarea>
            </details>
            <div class="favorite-actions">
              <button class="btn" data-action="roll">Roll</button>
              <button class="btn ghost" data-action="use">Use</button>
              <button class="btn ghost" data-action="save">Save</button>
              <button class="btn ghost" data-action="remove">Remove</button>
            </div>
          `;

          item.addEventListener("dragstart", (event) => {
            state.dragFavoriteId = favorite._id;
            state.dragTargetFavoriteId = null;
            state.dragTargetPosition = "before";
            item.classList.add("dragging");
            event.dataTransfer.effectAllowed = "move";
          });
          item.addEventListener("dragend", () => {
            state.dragFavoriteId = null;
            state.dragTargetFavoriteId = null;
            item.classList.remove("dragging");
            document.querySelectorAll(".drop-target").forEach((targetEl) => targetEl.classList.remove("drop-target"));
            document.querySelectorAll(".drag-target").forEach((targetEl) => targetEl.classList.remove("drag-target"));
            document.querySelectorAll(".drop-line-top").forEach((targetEl) => targetEl.classList.remove("drop-line-top"));
            document.querySelectorAll(".drop-line-bottom").forEach((targetEl) => targetEl.classList.remove("drop-line-bottom"));
          });

          item.addEventListener("dragover", (event) => {
            event.preventDefault();
            const rect = item.getBoundingClientRect();
            const isAfter = event.clientY > rect.top + rect.height / 2;
            state.dragTargetFavoriteId = favorite._id;
            state.dragTargetPosition = isAfter ? "after" : "before";
            item.classList.add("drag-target");
            item.classList.toggle("drop-line-top", !isAfter);
            item.classList.toggle("drop-line-bottom", isAfter);
          });
          item.addEventListener("dragleave", () => {
            item.classList.remove("drag-target", "drop-line-top", "drop-line-bottom");
          });
          item.addEventListener("drop", async (event) => {
            event.preventDefault();
            item.classList.remove("drag-target", "drop-line-top", "drop-line-bottom");
            await handleFavoriteDrop(favorite._id, categoryName);
          });

          item.querySelector('[data-action="roll"]').addEventListener("click", () => rollFavorite(favorite));
          item.querySelector('[data-action="use"]').addEventListener("click", () => {
            notationInput.value = favorite.notation;
            setStatus("Favorite notation copied into input.");
          });
          item.querySelector('[data-action="save"]').addEventListener("click", async () => {
            await handleFavoriteEditSave(favorite._id, item);
          });
          item.querySelector('[data-action="remove"]').addEventListener("click", async () => {
            await removeFavorite(favorite);
          });
          item.querySelector('[data-action="toggle-note-pin"]').addEventListener("click", () => {
            favorite.notePinned = !Boolean(favorite.notePinned);
            scheduleFavoritesAutosave();
            renderFavorites();
          });

          const subcategoryField = item.querySelector('[data-field="subcategory"]');
          const notesField = item.querySelector('[data-field="notes"]');
          subcategoryField.addEventListener("input", () => {
            favorite.subcategory = subcategoryField.value;
            scheduleFavoritesAutosave();
          });
          subcategoryField.addEventListener("blur", () => {
            favorite.subcategory = subcategoryField.value.trim();
            scheduleFavoritesAutosave();
          });
          notesField.addEventListener("input", () => {
            favorite.notes = notesField.value;
            scheduleFavoritesAutosave();
          });
          notesField.addEventListener("blur", () => {
            favorite.notes = notesField.value.trim();
            scheduleFavoritesAutosave();
          });

          subList.appendChild(item);
        });

      categoryList.appendChild(subWrap);
    });

    favoritesListEl.appendChild(categoryWrap);
  });

  updateCategoryControls();
}

function renderCalcLog() {
  calcLogEl.innerHTML = "";
  if (state.calcLog.length === 0) {
    calcLogEl.innerHTML = '<li class="history-item muted">No calculator entries yet.</li>';
    return;
  }

  state.calcLog
    .slice()
    .reverse()
    .forEach((entry) => {
      const item = document.createElement("li");
      item.className = "history-item";
      item.textContent = `${entry.expression} = ${entry.result}`;
      calcLogEl.appendChild(item);
    });
}

async function loadHistory() {
  const history = await api("/api/history");
  renderHistory(history);
}

async function loadFavorites() {
  const favorites = await api("/api/favorites");
  state.favorites = favorites.map((favorite) => ({
    ...favorite,
    subcategory: (favorite.subcategory || "").trim(),
    notes: (favorite.notes || "").trim(),
    notePinned: Boolean(favorite.notePinned),
  }));
  ensureFavoriteIds();
  renderFavorites();
}

async function rollCurrent() {
  const notation = notationInput.value.trim();
  if (!notation) {
    setStatus("Notation cannot be empty.", true);
    return;
  }

  try {
    const result = await api("/api/roll", {
      method: "POST",
      body: JSON.stringify({ notation, mode: state.mode }),
    });
    renderResult(result);
    setStatus(result.info || "Roll complete.");
    await loadHistory();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveFavorite() {
  const notation = notationInput.value.trim();
  if (!notation) {
    setStatus("Cannot favorite an empty notation.", true);
    return;
  }

  favoriteNotationPreviewInput.value = notation;
  favoriteNameInput.value = "";
  favoriteCategoryInput.value = favoriteCategoryInput.value.trim() || "General";
  favoriteSubcategoryInput.value = "";
  setFavoriteSavePanelVisibility(true);
  setStatus("Add a name/category, then confirm to save.");
}

async function confirmSaveFavorite() {
  const notation = favoriteNotationPreviewInput.value.trim();
  if (!notation) {
    setStatus("Cannot favorite an empty notation.", true);
    return;
  }

  const payload = {
    notation,
    name: favoriteNameInput.value.trim() || notation,
    category: favoriteCategoryInput.value.trim() || "General",
    subcategory: favoriteSubcategoryInput.value.trim(),
    notes: "",
  };

  try {
    await api("/api/favorites", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setFavoriteSavePanelVisibility(false);
    favoriteNameInput.value = "";
    favoriteNotationPreviewInput.value = "";
    favoriteSubcategoryInput.value = "";
    setStatus("Favorite saved.");
    await loadFavorites();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function removeFavorite(favorite) {
  if (state.pendingRemoval) {
    clearTimeout(state.pendingRemoval.timerId);
    try {
      await persistFavorites("Favorite removed.");
    } catch (error) {
      setStatus(error.message, true);
      return;
    }
  }

  const index = findFavoriteIndexById(favorite._id);
  if (index < 0) {
    return;
  }

  const removedFavorite = state.favorites[index];
  state.favorites.splice(index, 1);
  renderFavorites();

  const pendingRemoval = {
    favorite: removedFavorite,
    index,
    timerId: null,
  };

  pendingRemoval.timerId = setTimeout(async () => {
    if (state.pendingRemoval !== pendingRemoval) {
      return;
    }

    state.pendingRemoval = null;
    try {
      await persistFavorites("Favorite removed.");
    } catch (error) {
      setStatus(error.message, true);
    }
  }, 4500);

  state.pendingRemoval = pendingRemoval;
  setStatusWithUndo("Favorite removed.", () => {
    if (state.pendingRemoval !== pendingRemoval) {
      return;
    }

    clearTimeout(pendingRemoval.timerId);
    state.pendingRemoval = null;
    state.favorites.splice(Math.min(pendingRemoval.index, state.favorites.length), 0, pendingRemoval.favorite);
    renderFavorites();
    setStatus("Removal undone.");
  });
}

function resetLayout() {
  state.categoryOrder = [];
  state.collapsedCategories.clear();
  state.collapsedSubcategories.clear();
  state.sortByCategory = true;
  state.subcategoryFilter = "all";
  favoriteSearchInput.value = "";
  localStorage.removeItem("dice-atlas-category-order");
  localStorage.removeItem("dice-atlas-collapsed-subcategories");
  renderFavorites();
  setStatus("Layout reset: category order restored, categories expanded, search cleared.");
}

async function rollFavorite(favorite) {
  try {
    const result = await api("/api/roll", {
      method: "POST",
      body: JSON.stringify({ notation: favorite.notation, mode: state.mode, favorite }),
    });
    renderResult(result);
    notationInput.value = favorite.notation;
    setStatus(`Rolled favorite: ${favorite.name}`);
    await Promise.all([loadHistory(), loadFavorites()]);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function calculate() {
  const expression = calcExpressionInput.value.trim();
  if (!expression) {
    setCalcStatus("Enter an expression.", true);
    return;
  }

  try {
    const result = await api("/api/calculate", {
      method: "POST",
      body: JSON.stringify({ expression, ans: state.calcAns }),
    });

    state.calcAns = result.value;
    state.calcLog.push({ expression, result: Number.isInteger(result.value) ? `${result.value}` : result.value.toFixed(2) });
    if (state.calcLog.length > 30) {
      state.calcLog.shift();
    }

    setCalcStatus(`Result: ${state.calcLog[state.calcLog.length - 1].result}`);
    renderCalcLog();
  } catch (error) {
    setCalcStatus(error.message, true);
  }
}

document.getElementById("roll-btn").addEventListener("click", rollCurrent);
document.getElementById("save-favorite-btn").addEventListener("click", saveFavorite);
confirmSaveFavoriteBtn.addEventListener("click", confirmSaveFavorite);
cancelSaveFavoriteBtn.addEventListener("click", () => {
  setFavoriteSavePanelVisibility(false);
  setStatus("Save favorite canceled.");
});
favoriteSavePanelEl.addEventListener("keydown", async (event) => {
  if (favoriteSavePanelEl.classList.contains("hidden")) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    setFavoriteSavePanelVisibility(false);
    setStatus("Save favorite canceled.");
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    await confirmSaveFavorite();
  }
});
document.getElementById("toggle-history-btn").addEventListener("click", () => {
  setHistoryVisibility(!state.showHistory);
});
toggleCategorySortBtn.addEventListener("click", () => {
  state.sortByCategory = !state.sortByCategory;
  state.collapsedCategories.clear();
  renderFavorites();
});
toggleCollapseAllBtn.addEventListener("click", () => {
  if (!state.sortByCategory) {
    return;
  }

  const categoryNames = getAllCategoryNames();
  if (state.collapsedCategories.size > 0) {
    state.collapsedCategories.clear();
  } else {
    state.collapsedCategories = new Set(categoryNames);
  }
  renderFavorites();
});
document.getElementById("clear-history-btn").addEventListener("click", async () => {
  await api("/api/history/clear", { method: "POST" });
  setStatus("Roll history cleared.");
  await loadHistory();
});
document.getElementById("calc-btn").addEventListener("click", calculate);
document.getElementById("calc-insert-ans").addEventListener("click", () => {
  if (calcExpressionInput.value.trim()) {
    calcExpressionInput.value += " ";
  }
  calcExpressionInput.value += "ans";
});
favoriteSearchInput.addEventListener("input", renderFavorites);
darkModeToggle.addEventListener("change", () => {
  state.darkMode = darkModeToggle.checked;
  applyAppearance();
  persistAppearance();
});
denseModeToggle.addEventListener("change", () => {
  state.denseMode = denseModeToggle.checked;
  applyDensityMode();
  persistDensityMode();
});
backgroundSelect.addEventListener("change", () => {
  state.background = backgroundSelect.value;
  applyAppearance();
  persistAppearance();
});
resetLayoutBtn.addEventListener("click", resetLayout);
settingsPanelEl.addEventListener("toggle", () => {
  localStorage.setItem("dice-atlas-settings-open", settingsPanelEl.open ? "1" : "0");
});
document.addEventListener("keydown", async (event) => {
  const target = event.target;
  const tagName = target && target.tagName ? target.tagName.toLowerCase() : "";
  const isTypingTarget = target && (target.isContentEditable || ["input", "textarea", "select", "button"].includes(tagName));

  if (event.ctrlKey && event.key === "Enter" && !favoriteSavePanelEl.classList.contains("hidden")) {
    return;
  }

  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    await rollCurrent();
    return;
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "r" || event.key === "R") && !isTypingTarget) {
    event.preventDefault();
    notationInput.focus();
    notationInput.select();
  }
});

(async function init() {
  loadAppearance();
  loadDensityMode();
  loadCollapsedSubcategories();
  loadCategoryOrder();
  applyAppearance();
  applyDensityMode();
  settingsPanelEl.open = localStorage.getItem("dice-atlas-settings-open") === "1";
  setHistoryVisibility(false);
  setFavoriteSavePanelVisibility(false);
  updateCategoryControls();
  await Promise.all([loadFavorites(), loadHistory()]);
  renderCalcLog();
})();
