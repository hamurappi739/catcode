"use strict";

(() => {
  const api = window.electronAPI;
  const catalog = window.CatCodeV6SkinCatalog;
  const grid = document.getElementById("skins-grid");
  const title = document.getElementById("skins-title");
  const subtitle = document.getElementById("skins-subtitle");
  let language = "ru";
  let selectedId = catalog ? catalog.V6_DEFAULT_SKIN_ID : "snowball";
  let currentPattern = null;

  function copy() {
    if (language === "en") {
      return {
        title: "Cat skins",
        subtitle: "Choose a built-in coat for the V6 cat.",
      };
    }
    return {
      title: "Скины кота",
      subtitle: "Выберите один из готовых окрасов для V6-кота.",
    };
  }

  function previewUrl(skin) {
    return `../pet/${catalog.getV6SkinPreviewPath(skin && skin.id)}`;
  }

  function localizeName(skin) {
    const names = skin && skin.name ? skin.name : {};
    return names[language] || names.ru || names.en || skin.id;
  }

  function renderGallery() {
    const labels = copy();
    if (title) title.textContent = labels.title;
    if (subtitle) subtitle.textContent = labels.subtitle;
    document.title = labels.title;
    if (!grid || !catalog) return;
    grid.replaceChildren();
    for (const skin of catalog.V6_SKINS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skin-card";
      button.dataset.skinId = skin.id;
      button.setAttribute("aria-pressed", skin.id === selectedId ? "true" : "false");
      const image = document.createElement("img");
      image.src = previewUrl(skin);
      image.alt = localizeName(skin);
      image.decoding = "async";
      const label = document.createElement("span");
      label.textContent = localizeName(skin);
      button.append(image, label);
      button.addEventListener("click", () => selectSkin(skin.id));
      grid.append(button);
    }
  }

  async function selectSkin(id) {
    if (!api || typeof api.patternSet !== "function" || !catalog) return;
    selectedId = catalog.normalizeV6SkinId(id);
    const next = {
      ...(currentPattern && typeof currentPattern === "object" ? currentPattern : {}),
      v6SkinId: selectedId,
    };
    currentPattern = next;
    api.patternSet(next);
    renderGallery();
  }

  async function boot() {
    if (api && typeof api.languageGet === "function") {
      try {
        const value = await api.languageGet();
        language = value === "en" ? "en" : "ru";
      } catch (_) {}
    }
    if (api && typeof api.patternGet === "function") {
      try {
        currentPattern = await api.patternGet();
        selectedId = catalog.normalizeV6SkinId(currentPattern && currentPattern.v6SkinId);
      } catch (_) {}
    }
    renderGallery();
  }

  if (api && typeof api.onLanguageChanged === "function") {
    api.onLanguageChanged((value) => {
      language = value === "en" ? "en" : "ru";
      renderGallery();
    });
  }
  if (api && typeof api.onPatternChanged === "function") {
    api.onPatternChanged((pattern) => {
      currentPattern = pattern;
      selectedId = catalog.normalizeV6SkinId(pattern && pattern.v6SkinId);
      renderGallery();
    });
  }

  boot();
})();
