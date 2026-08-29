"use strict";

// V4-first appearance studio. Replaces the legacy split-part editor as the
// product UI. Built-ins are read-only; editing them creates a custom copy.
(() => {
  const schema = () => window.CatCodeV4PatternSchema;
  const preview = () => window.CatCodeV4EditorPreview;

  const STRINGS = {
    en: {
      title: "Appearances",
      gallery: "Gallery",
      galleryTitle: "Cat gallery",
      close: "Close",
      import: "Import",
      export: "Export",
      createFromPhoto: "Create from photo",
      previewCaption: "Live V4 cat — same model as the desktop pet",
      markings: "Markings",
      paint: "Paint",
      erase: "Erase",
      fill: "Fill",
      brush: "Brush",
      undo: "Undo",
      redo: "Redo",
      resetMarkings: "Reset markings",
      markingHint:
        "Paint on the whole-cat 64×64 silhouette. Markings project onto the live V4 preview.",
      markingsLoading: "Loading V4 silhouette… marking tools unlock when ready.",
      saveAsCustom: "Save as my cat",
      saveAsMyCat: "Save as my cat",
      saveChanges: "Save changes",
      savedStatus: "Saved",
      catName: "Cat name",
      builtinSaveHint:
        "Built-in cats stay unchanged until you save a personal copy.",
      nameRequired: "Give your cat a name, then save.",
      workflowTitle: "How to edit",
      workflowStep1: "Step 1: Select a body part.",
      workflowStep2: "Step 2: Set its coat color or paint markings.",
      workflowStep3: "Step 3: Save your cat.",
      duplicate: "Duplicate",
      discard: "Discard",
      coatGroup: "Coat and markings",
      baseColor: "Whole-cat coat",
      earInnerColor: "Inner ear colour",
      noseColor: "Nose colour",
      markingColor: "Brush color for markings",
      activePaint: "Selected brush color",
      markingHowTo:
        "Select a body part, choose a brush color, then paint or fill on the canvas. Changing the brush color alone does not paint the cat.",
      eyesGroup: "Eyes",
      eyeStyle: "Eye style",
      eyeStyleNatural: "Natural eyes",
      eyeStyleSolid: "Solid color",
      eyeFillColor: "Eye color",
      eyeSclera: "Eye white",
      eyeBgColor: "Eye white",
      eyeColor: "Iris",
      irisColor: "Iris",
      solidEyeColor: "Eye color",
      pupilColor: "Pupil",
      oddEye: "Odd eyes",
      left: "Left",
      right: "Right",
      leftIris: "Left eye",
      rightIris: "Right eye",
      leftEye: "Left eye",
      rightEye: "Right eye",
      eyeOutlineColor: "Eye outline",
      legacyRetired:
        "The old head/body/arm/foot grids are retired. This editor paints one complete V4 cat.",
      builtinSection: "Built-in",
      customSection: "My cats",
      importedSection: "Imported",
      archiveSection: "Legacy archive",
      builtinReadOnly: "Built-in (read-only — Save as my cat to keep edits)",
      customLabel: "Custom",
      importedLabel: "Imported",
      unnamed: "Untitled cat",
      selected: "Selected",
      dirty: "Unsaved changes",
      renamed: "Rename",
      delete: "Delete",
      renameCat: "Rename cat",
      manageCustom: "Manage this cat",
      manageRename: "Rename",
      manageDelete: "Delete",
      manageCancel: "Cancel",
      confirmDelete: "Delete this custom appearance?",
      confirmDiscard: "Discard unsaved changes?",
      cannotEditBuiltin: "Built-ins cannot be overwritten. Saved as a custom cat.",
      noCustom: "No custom cats yet.",
      noImported: "No imported cats yet.",
      noArchive: "No archived built-ins available.",
      bodyParts: "Body parts",
      partAll: "Whole cat",
      partHead: "Head",
      partEars: "Outer ear colour",
      partBody: "Body",
      partFrontPaws: "Front paws",
      partHindPaws: "Hind paws",
      partTail: "Tail",
      partColor: "Part coat color",
      partCoatColor: "Whole-cat coat color",
      coatColorFor: "{part} coat color",
      clearPartColor: "Reset color",
      clearPartColorFor: "Reset color: {part}",
      clearPartHelper: "{part} will use the whole-cat coat again.",
      partsHint:
        "Coat color fills the whole selected part. Brush color paints details only after you paint on the canvas. Eyes stay protected.",
      partsExplainAll:
        "Whole cat selected. Whole-cat coat tints every part without its own override. Brush color paints details only on the canvas.",
      partsExplainPart:
        "{part} selected. Coat color fills the entire {part}. Brush color paints details only. Eyes stay protected.",
      selectedPart: "Selected part",
    },
    ru: {
      title: "Внешний вид",
      gallery: "Галерея",
      galleryTitle: "Галерея котов",
      close: "Закрыть",
      import: "Импорт",
      export: "Экспорт",
      createFromPhoto: "Создать по фото",
      previewCaption: "Живой кот V4 — та же модель, что на рабочем столе",
      markings: "Отметины",
      paint: "Кисть",
      erase: "Ластик",
      fill: "Заливка",
      brush: "Размер",
      undo: "Отменить",
      redo: "Вернуть",
      resetMarkings: "Сбросить отметины",
      markingHint:
        "Рисуйте на силуэте 64×64. Отметины сразу видны на живом превью V4.",
      markingsLoading: "Загрузка силуэта V4… инструменты отметин откроются, когда он готов.",
      saveAsCustom: "Сохранить как своего",
      saveAsMyCat: "Сохранить как своего",
      saveChanges: "Сохранить изменения",
      savedStatus: "Сохранено",
      catName: "Имя кота",
      builtinSaveHint:
        "Встроенный кот не меняется, пока вы не сохраните копию.",
      nameRequired: "Дайте коту имя, затем сохраните.",
      workflowTitle: "Как править",
      workflowStep1: "Шаг 1: Выберите часть тела.",
      workflowStep2: "Шаг 2: Задайте цвет шерсти или нарисуйте отметины.",
      workflowStep3: "Шаг 3: Сохраните кота.",
      duplicate: "Дублировать",
      discard: "Отменить правки",
      coatGroup: "Шерсть и отметины",
      baseColor: "Цвет всего кота",
      earInnerColor: "Цвет внутри ушей",
      noseColor: "Цвет носа",
      markingColor: "Цвет кисти для рисунка",
      activePaint: "Выбранный цвет кисти",
      markingHowTo:
        "Выберите часть тела, выберите цвет кисти и проведите по коту на холсте. Смена цвета кисти сама по себе ничего не рисует.",
      eyesGroup: "Глаза",
      eyeStyle: "Стиль глаз",
      eyeStyleNatural: "Естественные глаза",
      eyeStyleSolid: "Сплошной цвет",
      eyeFillColor: "Цвет глаза",
      eyeSclera: "Белок глаза",
      eyeBgColor: "Белок глаза",
      eyeColor: "Радужка",
      irisColor: "Радужка",
      solidEyeColor: "Цвет глаза",
      pupilColor: "Зрачок",
      oddEye: "Разные глаза",
      left: "Левый",
      right: "Правый",
      leftIris: "Левый глаз",
      rightIris: "Правый глаз",
      leftEye: "Левый глаз",
      rightEye: "Правый глаз",
      eyeOutlineColor: "Контур глаза",
      legacyRetired:
        "Старые сетки головы/тела/лап убраны. Здесь красится целый кот V4.",
      builtinSection: "Встроенные",
      customSection: "Мои коты",
      importedSection: "Импортированные",
      archiveSection: "Архив (старые)",
      builtinReadOnly:
        "Встроенный (только чтение — «Сохранить как своего» чтобы оставить правки)",
      customLabel: "Свой",
      importedLabel: "Импорт",
      unnamed: "Безымянный кот",
      selected: "Выбран",
      dirty: "Есть несохранённые изменения",
      renamed: "Переименовать",
      delete: "Удалить",
      renameCat: "Переименовать кота",
      manageCustom: "Управление котом",
      manageRename: "Переименовать",
      manageDelete: "Удалить",
      manageCancel: "Отмена",
      confirmDelete: "Удалить этого кота?",
      confirmDiscard: "Отменить несохранённые правки?",
      cannotEditBuiltin:
        "Встроенных нельзя перезаписывать. Сохранено как свой кот.",
      noCustom: "Пока нет своих котов.",
      noImported: "Пока нет импортированных.",
      noArchive: "Архивные пресеты недоступны.",
      bodyParts: "Части тела",
      partAll: "Весь кот",
      partHead: "Голова",
      partEars: "Цвет внешней части ушей",
      partBody: "Туловище",
      partFrontPaws: "Передние лапы",
      partHindPaws: "Задние лапы",
      partTail: "Хвост",
      partColor: "Цвет шерсти части",
      partCoatColor: "Цвет всего кота",
      coatColorFor: "Цвет шерсти: {part}",
      clearPartColor: "Сбросить цвет",
      clearPartColorFor: "Сбросить цвет: {part}",
      clearPartHelper: "{part} снова будет цвета всего кота.",
      partsHint:
        "Цвет шерсти заливает всю выбранную часть. Цвет кисти рисует детали только на холсте. Глаза защищены.",
      partsExplainAll:
        "Выбран весь кот. Цвет всего кота тонирует части без своего цвета. Цвет кисти рисует детали только на холсте.",
      partsExplainPart:
        "Выбрано: {part}. Цвет шерсти заливает весь(ю) {part}. Цвет кисти — только детали на холсте. Глаза защищены.",
      selectedPart: "Выбрано",
    },
  };

  const COLOR_FIELDS = [
    ["baseColor", "base-color"],
    ["earInnerColor", "ear-inner-color"],
    ["noseColor", "nose-color"],
    ["markingColor", "marking-color"],
    ["eyeBgColor", "eye-bg-color"],
    ["eyeColor", "eye-color"],
    ["eyeColorLeft", "eye-color-left"],
    ["eyeColorRight", "eye-color-right"],
    ["eyeOutlineColor", "eye-outline-color"],
    ["eyePupilColor", "eye-pupil-color"],
  ];

  let language = "en";
  let pattern = null;
  let baseline = null;
  let presets = { builtin: [], custom: [] };
  let tool = "paint";
  let painting = false;
  let undoStack = [];
  let redoStack = [];
  let dirty = false;
  let silhouetteMask = null;
  let markingsReady = false;
  let selectedRegion = "all";
  let regionMasks = null;
  const REGION_CLASS = {
    head: "v4-region-head",
    ears: "v4-region-ears",
    body: "v4-region-body",
    frontPaws: "v4-region-frontPaws",
    hindPaws: "v4-region-hindPaws",
    tail: "v4-region-tail",
  };
  const EYE_CLASSES = [
    "v4-iris-left",
    "v4-iris-right",
    "v4-pupil-left",
    "v4-pupil-right",
    "v4-eye-bg-left",
    "v4-eye-bg-right",
    "v4-eye-outline",
  ];

  function t(key) {
    const table = STRINGS[language] || STRINGS.en;
    return table[key] || STRINGS.en[key] || key;
  }

  function normalize(input) {
    if (schema() && typeof schema().normalizeV4Pattern === "function") {
      return schema().normalizeV4Pattern(input || {});
    }
    return { ...(input || {}) };
  }

  function clonePattern(value) {
    return normalize(JSON.parse(JSON.stringify(normalize(value))));
  }

  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (STRINGS.en[key]) el.textContent = t(key);
    });
    const style = document.getElementById("eye-style");
    if (style) {
      const natural = style.querySelector('option[value="natural"]');
      const solid = style.querySelector('option[value="solid"]');
      if (natural) natural.textContent = t("eyeStyleNatural");
      if (solid) solid.textContent = t("eyeStyleSolid");
    }
    document.title = t("title");
    syncRegionUi();
    syncSaveUi();
    syncActivePaintSwatch();
  }

  function paintPreview(next, highlightOverride) {
    const payload = {
      ...next,
      __editorHighlightRegion:
        highlightOverride !== undefined ? highlightOverride : selectedRegion,
    };
    window.__catcodeEditorPattern = payload;
    if (preview() && typeof preview().paint === "function") {
      preview().paint(payload);
    }
    if (window.electronAPI && typeof window.electronAPI.patternPreview === "function") {
      const live = { ...next };
      delete live.__editorHighlightRegion;
      window.electronAPI.patternPreview(live);
    }
  }

  function syncColorInputs() {
    for (const [field, id] of COLOR_FIELDS) {
      const input = document.getElementById(id);
      const hex = document.getElementById(`${id}-hex`);
      if (!input || !pattern) continue;
      const value = pattern[field] || "#000000";
      input.value = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#20242D";
      if (hex) hex.textContent = input.value.toUpperCase();
    }
    const odd = document.getElementById("odd-eye");
    if (odd) odd.checked = !!pattern.oddEye;
    const style = document.getElementById("eye-style");
    if (style) style.value = pattern.eyeStyle === "solid" ? "solid" : "natural";
    const leftRow = document.getElementById("eye-color-left-row");
    const rightRow = document.getElementById("eye-color-right-row");
    const unified = document.getElementById("eye-color-row");
    if (leftRow) leftRow.hidden = !pattern.oddEye;
    if (rightRow) rightRow.hidden = !pattern.oddEye;
    if (unified) unified.hidden = !!pattern.oddEye;
    const nameInput = document.getElementById("cat-name");
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = pattern.name || "";
    }
    syncEyeStyleUi();
    syncActivePaintSwatch();
    syncSaveUi();
  }

  function syncEyeStyleUi() {
    const solid = pattern && pattern.eyeStyle === "solid";
    const bgLabel = document.getElementById("eye-bg-label");
    const irisLabel = document.querySelector("#eye-color-row > span");
    const leftLabel = document.querySelector("#eye-color-left-row > span");
    const rightLabel = document.querySelector("#eye-color-right-row > span");
    const bgRow = document.getElementById("eye-bg-color-row");
    if (bgLabel) bgLabel.textContent = solid ? t("solidEyeColor") : t("eyeSclera");
    if (irisLabel) irisLabel.textContent = solid ? t("solidEyeColor") : t("irisColor");
    if (leftLabel) leftLabel.textContent = t("leftEye");
    if (rightLabel) rightLabel.textContent = t("rightEye");
    // Natural: show sclera + iris. Solid + unified: hide sclera row (iris drives
    // the solid eye color). Solid + odd: hide unified iris, show left/right.
    if (bgRow) bgRow.hidden = !!solid && !pattern.oddEye;
    if (solid && !pattern.oddEye && bgRow) bgRow.hidden = true;
    if (!solid && bgRow) bgRow.hidden = false;
    // When solid+odd, left/right are the solid eye colors; sclera row unused.
    if (solid && pattern.oddEye && bgRow) bgRow.hidden = true;
  }

  function syncActivePaintSwatch() {
    const el = document.getElementById("active-paint-swatch");
    if (!el || !pattern) return;
    const color = pattern.markingColor || "#3A4559";
    el.innerHTML = "";
    const swatch = document.createElement("span");
    swatch.className = "paint-swatch-chip";
    swatch.style.background = color;
    const text = document.createElement("span");
    text.textContent = `${t("activePaint")}: ${String(color).toUpperCase()}`;
    el.append(swatch, text);
    const how = document.getElementById("marking-howto");
    if (how) how.textContent = t("markingHowTo");
  }

  function syncSaveUi() {
    const status = document.getElementById("save-status");
    const saveBtn = document.getElementById("save-custom");
    const hint = document.getElementById("builtin-save-hint");
    const builtin = pattern && isBuiltinId(pattern.selectedPresetId);
    if (status) {
      status.textContent = dirty ? t("dirty") : t("savedStatus");
      status.dataset.state = dirty ? "dirty" : "saved";
    }
    if (saveBtn) {
      saveBtn.textContent = builtin ? t("saveAsMyCat") : t("saveChanges");
      saveBtn.disabled = !pattern || (!dirty && !builtin);
    }
    if (hint) hint.hidden = !builtin;
  }

  function setPattern(next, { markDirty = true, pushHistory = false } = {}) {
    if (pushHistory && pattern) {
      undoStack.push(
        JSON.stringify({
          key: selectedRegion === "all" ? "markings" : selectedRegion,
          value:
            selectedRegion === "all"
              ? pattern.markings || []
              : (pattern.regionMarkings &&
                  pattern.regionMarkings[selectedRegion]) ||
                [],
        }),
      );
      if (undoStack.length > 80) undoStack.shift();
      redoStack = [];
    }
    pattern = normalize(next);
    if (!pattern.name) pattern.name = "";
    paintPreview(pattern);
    syncColorInputs();
    syncRegionUi();
    drawMarkingCanvas();
    renderCurrentCard();
    if (markDirty) dirty = true;
    syncSaveUi();
  }

  function commitLive() {
    if (!pattern) return;
    paintPreview(pattern);
    if (window.electronAPI && typeof window.electronAPI.patternSet === "function") {
      window.electronAPI.patternSet(pattern);
    }
    dirty = false;
    baseline = clonePattern(pattern);
    renderCurrentCard();
    syncSaveUi();
  }

  function renderCurrentCard() {
    const card = document.getElementById("current-appearance");
    if (!card || !pattern) return;
    const name =
      pattern.name ||
      labelForPreset(pattern.selectedPresetId) ||
      t("unnamed");
    const source = describeSource(pattern.selectedPresetId);
    card.innerHTML = "";
    const title = document.createElement("strong");
    title.textContent = name;
    const meta = document.createElement("div");
    meta.textContent = dirty ? `${source} · ${t("dirty")}` : `${source} · ${t("savedStatus")}`;
    card.append(title, meta);
  }

  function describeSource(id) {
    if (!id) return t("customLabel");
    const builtin = presets.builtin.find((p) => p.id === id);
    if (builtin) {
      if (builtin.legacyArchive) return t("archiveSection");
      return t("builtinReadOnly");
    }
    const custom = presets.custom.find((p) => p.id === id);
    if (custom?.origin === "imported") return t("importedLabel");
    if (custom) return t("customLabel");
    return t("customLabel");
  }

  function labelForPreset(id) {
    if (!id) return "";
    const all = [...presets.builtin, ...presets.custom];
    const hit = all.find((p) => p.id === id);
    if (!hit) return "";
    if (hit.label && typeof hit.label === "object") {
      return hit.label[language] || hit.label.en || hit.name || id;
    }
    return hit.name || id;
  }

  function isBuiltinId(id) {
    return !!presets.builtin.find((p) => p.id === id && p.source !== "custom");
  }

  async function loadPresets() {
    if (!window.electronAPI || !window.electronAPI.patternPresetsGet) return;
    const data = await window.electronAPI.patternPresetsGet();
    const list = Array.isArray(data) ? data : data?.presets || [];
    presets.builtin = list.filter(
      (p) => p.source === "builtin" || p.source === "collection" || !p.source,
    );
    presets.custom = list.filter((p) => p.source === "custom");
    // Keep promoted built-ins separate for gallery.
    renderGallery();
  }

  function swatchStyle(p) {
    const pat = normalize(p.pattern || p);
    return `background: linear-gradient(135deg, ${pat.baseColor} 55%, ${pat.eyeColor} 55%)`;
  }

  function makeCard(preset, section) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gallery-card";
    if (pattern && pattern.selectedPresetId === preset.id) btn.classList.add("active");
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.cssText = swatchStyle(preset);
    const meta = document.createElement("div");
    meta.className = "meta";
    const name =
      (preset.label && (preset.label[language] || preset.label.en)) ||
      preset.name ||
      t("unnamed");
    meta.textContent = name;
    btn.append(swatch, meta);
    btn.addEventListener("click", () => selectPreset(preset));
    if (section === "custom") {
      btn.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        customContext(preset);
      });
    }
    return btn;
  }

  function renderSection(containerId, titleKey, items, emptyKey, kind) {
    const root = document.getElementById(containerId);
    if (!root) return;
    root.innerHTML = "";
    const h = document.createElement("h3");
    h.textContent = t(titleKey);
    root.appendChild(h);
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "marking-hint";
      empty.textContent = t(emptyKey);
      root.appendChild(empty);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "gallery-grid";
    for (const item of items) grid.appendChild(makeCard(item, kind));
    root.appendChild(grid);
  }

  function renderGallery() {
    const promoted = presets.builtin.filter(
      (p) => p.promoted !== false && !p.legacyArchive && (p.source === "builtin" || !p.source),
    );
    const archive = presets.builtin.filter((p) => p.legacyArchive || p.promoted === false);
    const customList = presets.custom.filter((p) => p.origin !== "imported");
    const importedList = presets.custom.filter((p) => p.origin === "imported");
    renderSection("gallery-builtin", "builtinSection", promoted, "noArchive", "builtin");
    renderSection("gallery-custom", "customSection", customList, "noCustom", "custom");
    renderSection("gallery-imported", "importedSection", importedList, "noImported", "imported");
    renderSection("gallery-archive", "archiveSection", archive, "noArchive", "archive");
  }

  function selectPreset(preset) {
    const next = clonePattern(preset.pattern || preset);
    next.selectedPresetId = preset.id;
    if (!next.name) {
      next.name =
        (preset.label && (preset.label[language] || preset.label.en)) ||
        preset.name ||
        "";
    }
    setPattern(next, { markDirty: false });
    baseline = clonePattern(next);
    dirty = false;
    commitLive();
    renderGallery();
  }

  async function customContext(preset) {
    openManageDialog(preset);
  }

  function openManageDialog(preset) {
    const overlay = document.getElementById("manage-cat-overlay");
    const title = document.getElementById("manage-cat-title");
    const nameInput = document.getElementById("manage-cat-name");
    if (!overlay || !nameInput) return;
    if (title) title.textContent = t("manageCustom");
    nameInput.value = preset.name || "";
    overlay.hidden = false;
    overlay.dataset.presetId = preset.id || "";
    nameInput.focus();
  }

  function closeManageDialog() {
    const overlay = document.getElementById("manage-cat-overlay");
    if (overlay) {
      overlay.hidden = true;
      delete overlay.dataset.presetId;
    }
  }

  async function confirmManageRename() {
    const overlay = document.getElementById("manage-cat-overlay");
    const nameInput = document.getElementById("manage-cat-name");
    if (!overlay || !nameInput) return;
    const id = overlay.dataset.presetId;
    const name = nameInput.value.trim();
    if (!id || !name) return;
    await window.electronAPI.patternCustomPresetRename({ id, name });
    closeManageDialog();
    await loadPresets();
  }

  async function confirmManageDelete() {
    const overlay = document.getElementById("manage-cat-overlay");
    if (!overlay) return;
    const id = overlay.dataset.presetId;
    if (!id) return;
    const ok = await window.electronAPI.patternConfirmDeletePreset(t("confirmDelete"));
    if (!ok) return;
    await window.electronAPI.patternCustomPresetDelete(id);
    closeManageDialog();
    await loadPresets();
  }

  async function saveAsCustom() {
    if (!pattern) return;
    const builtin = isBuiltinId(pattern.selectedPresetId);
    const nameInput = document.getElementById("cat-name");
    let name = (nameInput && nameInput.value.trim()) || pattern.name || "";
    if (!name) {
      name =
        labelForPreset(pattern.selectedPresetId) ||
        t("unnamed");
      if (nameInput) nameInput.value = name;
    }
    if (!name.trim()) {
      const status = document.getElementById("save-status");
      if (status) {
        status.textContent = t("nameRequired");
        status.dataset.state = "dirty";
      }
      nameInput?.focus();
      return;
    }
    name = name.trim();
    if (builtin) {
      const payload = clonePattern(pattern);
      payload.name = name;
      delete payload.selectedPresetId;
      const result = await window.electronAPI.patternCustomPresetSave({
        name,
        pattern: payload,
      });
      if (!result || !result.id) return;
      await loadPresets();
      pattern.selectedPresetId = result.id;
      pattern.name = name;
      commitLive();
      return;
    }
    pattern.name = name;
    if (pattern.selectedPresetId && window.electronAPI?.patternCustomPresetRename) {
      try {
        await window.electronAPI.patternCustomPresetRename({
          id: pattern.selectedPresetId,
          name,
        });
      } catch (_) {
        /* rename optional; patternSet still persists colors */
      }
    }
    if (
      pattern.selectedPresetId &&
      window.electronAPI?.patternCustomPresetSave
    ) {
      const payload = clonePattern(pattern);
      payload.name = name;
      await window.electronAPI.patternCustomPresetSave({
        id: pattern.selectedPresetId,
        name,
        pattern: payload,
      });
      await loadPresets();
    }
    commitLive();
  }

  async function duplicateAppearance() {
    if (!pattern) return;
    const baseName =
      pattern.name || labelForPreset(pattern.selectedPresetId) || t("unnamed");
    const name = `${baseName} copy`.slice(0, 60);
    const payload = clonePattern(pattern);
    payload.name = name;
    delete payload.selectedPresetId;
    const result = await window.electronAPI.patternCustomPresetSave({
      name,
      pattern: payload,
    });
    await loadPresets();
    if (result && result.id) {
      pattern.selectedPresetId = result.id;
      pattern.name = name;
      commitLive();
    }
  }

  async function discardChanges() {
    if (!dirty) return;
    const ok = await window.electronAPI.patternConfirmDiscardChanges(
      t("confirmDiscard"),
    );
    if (!ok) return;
    if (baseline) {
      setPattern(clonePattern(baseline), { markDirty: false });
      commitLive();
    }
  }

  // --- Marking canvas (64x64 whole-cat workspace) ---

  function canvas() {
    return document.getElementById("marking-canvas");
  }

  function canvasCtx() {
    const el = canvas();
    return el ? el.getContext("2d") : null;
  }

  function activeMask() {
    if (selectedRegion === "all") return silhouetteMask;
    return regionMasks && regionMasks[selectedRegion]
      ? regionMasks[selectedRegion]
      : null;
  }

  function markingsMap() {
    const map = new Map();
    const spots =
      selectedRegion === "all"
        ? pattern.markings || []
        : (pattern.regionMarkings && pattern.regionMarkings[selectedRegion]) ||
          [];
    for (const spot of spots) {
      map.set(`${spot.x},${spot.y}`, spot.color);
    }
    return map;
  }

  function setMarkingsFromMap(map, { history = true } = {}) {
    const markings = [];
    for (const [key, color] of map) {
      const [x, y] = key.split(",").map(Number);
      markings.push({ x, y, color });
    }
    markings.sort((a, b) => a.y - b.y || a.x - b.x);
    if (selectedRegion === "all") {
      setPattern({ ...pattern, markings }, { markDirty: true, pushHistory: history });
      return;
    }
    const regionMarkings = {
      ...(pattern.regionMarkings || {}),
      [selectedRegion]: markings,
    };
    setPattern(
      { ...pattern, regionMarkings },
      { markDirty: true, pushHistory: history },
    );
  }

  function isEyeClassList(className) {
    const classes = String(className || "").split(/\s+/);
    return EYE_CLASSES.some((role) => classes.includes(role));
  }

  function buildMasksFromSvgRoot(svg) {
    if (!svg || !svg.querySelectorAll) return null;
    const full = new Uint8Array(64 * 64);
    const regions = {
      head: new Uint8Array(64 * 64),
      ears: new Uint8Array(64 * 64),
      body: new Uint8Array(64 * 64),
      frontPaws: new Uint8Array(64 * 64),
      hindPaws: new Uint8Array(64 * 64),
      tail: new Uint8Array(64 * 64),
    };
    let count = 0;
    svg.querySelectorAll("rect.v4-pixel").forEach((rect) => {
      const x = Number(rect.getAttribute("x"));
      const y = Number(rect.getAttribute("y"));
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 63 || y > 63) {
        return;
      }
      if (isEyeClassList(rect.getAttribute("class"))) return;
      full[y * 64 + x] = 1;
      count += 1;
      const cls = rect.getAttribute("class") || "";
      for (const [key, className] of Object.entries(REGION_CLASS)) {
        if (cls.split(/\s+/).includes(className)) regions[key][y * 64 + x] = 1;
      }
    });
    if (count === 0) return null;
    return { full, regions };
  }

  function setMarkingsUiReady(ready) {
    markingsReady = !!ready;
    const workspace = document.querySelector(".marking-workspace");
    const hint = document.querySelector(".marking-hint");
    const el = canvas();
    if (workspace) workspace.classList.toggle("markings-loading", !markingsReady);
    if (el) {
      el.style.pointerEvents = markingsReady ? "auto" : "none";
      el.setAttribute("aria-disabled", markingsReady ? "false" : "true");
    }
    document.querySelectorAll(".marking-toolbar button, .marking-toolbar select").forEach((node) => {
      node.disabled = !markingsReady;
    });
    if (hint) hint.textContent = markingsReady ? t("markingHint") : t("markingsLoading");
  }

  function fillMaskFromSvgRoot(svg, mask) {
    const built = buildMasksFromSvgRoot(svg);
    if (!built) return 0;
    mask.set(built.full);
    regionMasks = built.regions;
    return built.full.reduce((sum, value) => sum + value, 0);
  }

  async function loadMaskFromIdleSvgFile() {
    try {
      const object = document.getElementById("v4-editor-preview");
      const href = object && (object.getAttribute("data") || object.data);
      if (!href || typeof fetch !== "function") return null;
      const response = await fetch(href);
      if (!response.ok) return null;
      const text = await response.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const root = doc.documentElement;
      if (!root) return null;
      const mask = new Uint8Array(64 * 64);
      const count = fillMaskFromSvgRoot(root, mask);
      return count > 0 ? mask : null;
    } catch {
      return null;
    }
  }

  async function ensureSilhouetteMask() {
    if (silhouetteMask) {
      setMarkingsUiReady(true);
      return silhouetteMask;
    }
    setMarkingsUiReady(false);
    const fromFile = await loadMaskFromIdleSvgFile();
    if (fromFile) {
      silhouetteMask = fromFile;
      setMarkingsUiReady(true);
      drawMarkingCanvas();
      return silhouetteMask;
    }
    const mask = new Uint8Array(64 * 64);
    const object = document.getElementById("v4-editor-preview");
    const tryFill = () => {
      const svg = object && object.contentDocument && object.contentDocument.documentElement;
      if (!svg) return false;
      if (fillMaskFromSvgRoot(svg, mask) === 0) return false;
      silhouetteMask = mask;
      return true;
    };
    if (tryFill()) {
      setMarkingsUiReady(true);
      drawMarkingCanvas();
      return silhouetteMask;
    }
    if (object) {
      await new Promise((resolve) => {
        const onLoad = () => {
          if (tryFill()) {
            setMarkingsUiReady(true);
            drawMarkingCanvas();
          }
          resolve();
        };
        object.addEventListener("load", onLoad, { once: true });
        // Do not invent a full-square mask on timeout. Tools stay disabled.
        setTimeout(resolve, 15000);
      });
    }
    if (!silhouetteMask) {
      setMarkingsUiReady(false);
      return null;
    }
    return silhouetteMask;
  }

  function drawMarkingCanvas() {
    const ctx = canvasCtx();
    const el = canvas();
    if (!ctx || !el || !pattern) return;
    ctx.clearRect(0, 0, 64, 64);
    const mask = activeMask();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    if (mask) {
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          if (mask[y * 64 + x]) ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    if (selectedRegion !== "all" && silhouetteMask && mask) {
      ctx.fillStyle = "rgba(212,179,90,0.16)";
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          if (mask[y * 64 + x]) ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    const spots =
      selectedRegion === "all"
        ? pattern.markings || []
        : (pattern.regionMarkings && pattern.regionMarkings[selectedRegion]) ||
          [];
    for (const spot of spots) {
      ctx.fillStyle = spot.color;
      ctx.fillRect(spot.x, spot.y, 1, 1);
    }
  }

  function brushCells(cx, cy, size) {
    const cells = [];
    const mask = activeMask();
    const r = Math.max(1, size);
    const half = Math.floor(r / 2);
    for (let dy = 0; dy < r; dy += 1) {
      for (let dx = 0; dx < r; dx += 1) {
        const x = cx - half + dx;
        const y = cy - half + dy;
        if (x < 0 || y < 0 || x > 63 || y > 63) continue;
        if (!mask || !mask[y * 64 + x]) continue;
        cells.push([x, y]);
      }
    }
    return cells;
  }

  function canvasCoords(event) {
    const el = canvas();
    const rect = el.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * 64);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * 64);
    return {
      x: Math.max(0, Math.min(63, x)),
      y: Math.max(0, Math.min(63, y)),
    };
  }

  function applyStroke(x, y) {
    if (!markingsReady || !activeMask()) return;
    const size = Number(document.getElementById("brush-size")?.value || 2);
    const map = markingsMap();
    const color = pattern.markingColor || "#3A4559";
    if (tool === "fill") {
      floodFill(map, x, y, color);
      setMarkingsFromMap(map, { history: true });
      return;
    }
    for (const [px, py] of brushCells(x, y, size)) {
      const key = `${px},${py}`;
      if (tool === "erase") map.delete(key);
      else map.set(key, color);
    }
    setMarkingsFromMap(map, { history: true });
  }

  function floodFill(map, sx, sy, color) {
    const mask = activeMask();
    if (!mask || !mask[sy * 64 + sx]) return;
    const target = map.get(`${sx},${sy}`) || null;
    if (target === color) return;
    const queue = [[sx, sy]];
    const seen = new Set();
    while (queue.length) {
      const [x, y] = queue.pop();
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (x < 0 || y < 0 || x > 63 || y > 63) continue;
      if (!mask || !mask[y * 64 + x]) continue;
      const current = map.get(key) || null;
      if (current !== target) continue;
      map.set(key, color);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  function undoMarkings() {
    if (!undoStack.length) return;
    const snapshotKey = selectedRegion === "all" ? "markings" : selectedRegion;
    redoStack.push(
      JSON.stringify({
        key: snapshotKey,
        value:
          selectedRegion === "all"
            ? pattern.markings || []
            : (pattern.regionMarkings && pattern.regionMarkings[selectedRegion]) ||
              [],
      }),
    );
    const prev = JSON.parse(undoStack.pop());
    if (prev.key === "markings") {
      setPattern({ ...pattern, markings: prev.value }, { markDirty: true, pushHistory: false });
    } else {
      setPattern(
        {
          ...pattern,
          regionMarkings: {
            ...(pattern.regionMarkings || {}),
            [prev.key]: prev.value,
          },
        },
        { markDirty: true, pushHistory: false },
      );
    }
  }

  function redoMarkings() {
    if (!redoStack.length) return;
    undoStack.push(
      JSON.stringify({
        key: selectedRegion === "all" ? "markings" : selectedRegion,
        value:
          selectedRegion === "all"
            ? pattern.markings || []
            : (pattern.regionMarkings && pattern.regionMarkings[selectedRegion]) ||
              [],
      }),
    );
    const next = JSON.parse(redoStack.pop());
    if (next.key === "markings") {
      setPattern({ ...pattern, markings: next.value }, { markDirty: true, pushHistory: false });
    } else {
      setPattern(
        {
          ...pattern,
          regionMarkings: {
            ...(pattern.regionMarkings || {}),
            [next.key]: next.value,
          },
        },
        { markDirty: true, pushHistory: false },
      );
    }
  }

  function bindMarkingTools() {
    document.querySelectorAll(".tool[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        tool = btn.dataset.tool;
        document.querySelectorAll(".tool[data-tool]").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
      });
    });
    const el = canvas();
    if (!el) return;
    el.addEventListener("pointerdown", (event) => {
      if (!markingsReady) return;
      painting = true;
      el.setPointerCapture(event.pointerId);
      const { x, y } = canvasCoords(event);
      applyStroke(x, y);
    });
    el.addEventListener("pointermove", (event) => {
      if (!painting || !markingsReady || tool === "fill") return;
      const { x, y } = canvasCoords(event);
      applyStroke(x, y);
    });
    el.addEventListener("pointerup", () => {
      painting = false;
    });
    el.addEventListener("pointercancel", () => {
      painting = false;
    });
    document.getElementById("undo-markings")?.addEventListener("click", undoMarkings);
    document.getElementById("redo-markings")?.addEventListener("click", redoMarkings);
    document.getElementById("reset-markings")?.addEventListener("click", () => {
      if (selectedRegion === "all") {
        setPattern({ ...pattern, markings: [] }, { markDirty: true, pushHistory: true });
      } else {
        setPattern(
          {
            ...pattern,
            regionMarkings: {
              ...(pattern.regionMarkings || {}),
              [selectedRegion]: [],
            },
          },
          { markDirty: true, pushHistory: true },
        );
      }
    });
  }

  function regionLabel(key) {
    const map = {
      all: "partAll",
      head: "partHead",
      ears: "partEars",
      body: "partBody",
      frontPaws: "partFrontPaws",
      hindPaws: "partHindPaws",
      tail: "partTail",
    };
    return t(map[key] || "partAll");
  }

  function syncRegionUi() {
    const label = document.getElementById("selected-part-label");
    const partName = regionLabel(selectedRegion);
    if (label) {
      label.textContent = `${t("selectedPart")}: ${partName}`;
    }
    const explain = document.getElementById("parts-explain");
    if (explain) {
      explain.textContent =
        selectedRegion === "all"
          ? t("partsExplainAll")
          : t("partsExplainPart").replaceAll("{part}", partName);
    }
    const coatLabel = document.getElementById("region-color-label");
    if (coatLabel) {
      coatLabel.textContent =
        selectedRegion === "all"
          ? t("partCoatColor")
          : t("coatColorFor").replaceAll("{part}", partName);
    }
    const clear = document.getElementById("clear-region-color");
    const clearHelper = document.getElementById("clear-part-helper");
    if (clear) {
      clear.textContent =
        selectedRegion === "all"
          ? t("clearPartColor")
          : t("clearPartColorFor").replaceAll("{part}", partName);
    }
    if (clearHelper) {
      clearHelper.hidden = selectedRegion === "all";
      clearHelper.textContent = t("clearPartHelper").replaceAll("{part}", partName);
    }
    document.querySelectorAll(".part-btn[data-region]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.region === selectedRegion);
    });
    const row = document.getElementById("region-color-row");
    const input = document.getElementById("region-color");
    const hex = document.getElementById("region-color-hex");
    const show = selectedRegion !== "all";
    if (row) row.hidden = !show;
    if (clear) clear.hidden = !show;
    if (show && input && pattern) {
      const colors = pattern.regionColors || {};
      let value = colors[selectedRegion];
      if (!value) {
        // S-ear.0: ears region picker defaults to base (shell), not earInnerColor.
        value = pattern.baseColor;
      }
      input.value = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#20242D";
      if (hex) hex.textContent = input.value.toUpperCase();
    }
  }

  function selectRegion(region) {
    selectedRegion = region || "all";
    syncRegionUi();
    paintPreview(pattern);
    drawMarkingCanvas();
  }

  function bindBodyParts() {
    document.querySelectorAll(".part-btn[data-region]").forEach((btn) => {
      btn.addEventListener("click", () => selectRegion(btn.dataset.region));
      btn.addEventListener("mouseenter", () => {
        if (!pattern) return;
        paintPreview(pattern, btn.dataset.region);
      });
      btn.addEventListener("mouseleave", () => {
        if (!pattern) return;
        paintPreview(pattern);
      });
    });
    document.getElementById("region-color")?.addEventListener("input", (event) => {
      if (selectedRegion === "all" || !pattern) return;
      const value = event.target.value;
      const regionColors = {
        ...(pattern.regionColors || {}),
        [selectedRegion]: value,
      };
      const next = { ...pattern, regionColors };
      // S-ear.0: ears region owns shell only; do not overwrite earInnerColor.
      setPattern(next, { markDirty: true });
    });
    document.getElementById("region-color")?.addEventListener("change", () => {
      if (selectedRegion === "all") return;
      if (!isBuiltinId(pattern.selectedPresetId)) commitLive();
    });
    document.getElementById("clear-region-color")?.addEventListener("click", () => {
      if (selectedRegion === "all" || !pattern) return;
      const regionColors = {
        ...(pattern.regionColors || {}),
        [selectedRegion]: "",
      };
      setPattern({ ...pattern, regionColors }, { markDirty: true });
      if (!isBuiltinId(pattern.selectedPresetId)) commitLive();
    });
    syncRegionUi();
  }

  function bindColorControls() {
    for (const [field, id] of COLOR_FIELDS) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.addEventListener("input", () => {
        const next = { ...pattern, [field]: input.value };
        if (field === "eyeColor" && !pattern.oddEye) {
          next.eyeColorLeft = input.value;
          next.eyeColorRight = input.value;
          if (pattern.eyeStyle === "solid") {
            next.eyeBgColor = input.value;
          }
        }
        if (field === "markingColor") {
          /* brush swatch updates via syncColorInputs */
        }
        setPattern(next, { markDirty: true });
        paintPreview(pattern);
        if (window.electronAPI?.patternPreview) {
          window.electronAPI.patternPreview(pattern);
        }
      });
      input.addEventListener("change", () => {
        if (isBuiltinId(pattern.selectedPresetId)) {
          return;
        }
        commitLive();
      });
    }
    document.getElementById("odd-eye")?.addEventListener("change", (event) => {
      const oddEye = !!event.target.checked;
      const next = { ...pattern, oddEye };
      if (!oddEye) {
        next.eyeColorLeft = next.eyeColor;
        next.eyeColorRight = next.eyeColor;
      }
      setPattern(next, { markDirty: true });
      if (!isBuiltinId(pattern.selectedPresetId)) commitLive();
    });
    document.getElementById("eye-style")?.addEventListener("change", (event) => {
      const eyeStyle = event.target.value === "solid" ? "solid" : "natural";
      const next = { ...pattern, eyeStyle };
      if (eyeStyle === "solid") {
        // Promote iris into fill so solid mode never keeps a white sclera.
        next.eyeBgColor = next.eyeColor || next.eyeBgColor;
      }
      setPattern(next, { markDirty: true });
      if (!isBuiltinId(pattern.selectedPresetId)) commitLive();
    });
    document.getElementById("cat-name")?.addEventListener("input", (event) => {
      if (!pattern) return;
      pattern.name = event.target.value;
      dirty = true;
      renderCurrentCard();
      syncSaveUi();
    });
  }

  function bindChrome() {
    document.getElementById("open-gallery")?.addEventListener("click", () => {
      document.getElementById("gallery-overlay").hidden = false;
      renderGallery();
    });
    document.getElementById("close-gallery")?.addEventListener("click", () => {
      document.getElementById("gallery-overlay").hidden = true;
    });
    document.getElementById("save-custom")?.addEventListener("click", () => {
      saveAsCustom().catch(console.error);
    });
    document.getElementById("duplicate-appearance")?.addEventListener("click", () => {
      duplicateAppearance().catch(console.error);
    });
    document.getElementById("discard-changes")?.addEventListener("click", () => {
      discardChanges().catch(console.error);
    });
    document.getElementById("manage-cat-cancel")?.addEventListener("click", () => {
      closeManageDialog();
    });
    document.getElementById("manage-cat-rename")?.addEventListener("click", () => {
      confirmManageRename().catch(console.error);
    });
    document.getElementById("manage-cat-delete")?.addEventListener("click", () => {
      confirmManageDelete().catch(console.error);
    });
    document.getElementById("import-presets")?.addEventListener("click", async () => {
      const result = await window.electronAPI.patternCustomPresetsImport();
      if (result && !result.canceled) await loadPresets();
    });
    document.getElementById("export-presets")?.addEventListener("click", async () => {
      const ids = presets.custom.map((p) => p.id);
      await window.electronAPI.patternCustomPresetsExport(ids);
    });
    document.getElementById("open-ai-creator")?.addEventListener("click", () => {
      document.getElementById("gallery-overlay").hidden = true;
      const panel = document.getElementById("create-cat-panel");
      if (panel) {
        panel.hidden = false;
        panel.classList.add("active");
      }
      document.getElementById("create-your-cat")?.click();
    });
    document.getElementById("back-to-presets")?.addEventListener("click", () => {
      const panel = document.getElementById("create-cat-panel");
      if (panel) {
        panel.hidden = true;
        panel.classList.remove("active");
      }
      document.getElementById("gallery-overlay").hidden = false;
    });
  }

  async function boot() {
    applyI18n();
    bindColorControls();
    bindMarkingTools();
    bindBodyParts();
    bindChrome();
    await ensureSilhouetteMask();
    if (window.electronAPI?.languageGet) {
      language = (await window.electronAPI.languageGet()) === "ru" ? "ru" : "en";
      applyI18n();
    }
    window.electronAPI?.onLanguageChanged?.((value) => {
      language = value === "ru" ? "ru" : "en";
      applyI18n();
      renderCurrentCard();
      renderGallery();
      syncRegionUi();
    });
    await loadPresets();
    window.electronAPI?.onPatternPresetsChanged?.(() => {
      loadPresets().catch(console.error);
    });
    const current = await window.electronAPI.patternGet();
    pattern = clonePattern(current);
    baseline = clonePattern(pattern);
    dirty = false;
    paintPreview(pattern);
    syncColorInputs();
    drawMarkingCanvas();
    renderCurrentCard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      boot().catch(console.error);
    });
  } else {
    boot().catch(console.error);
  }
})();
