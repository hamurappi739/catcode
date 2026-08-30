"use strict";

(() => {
  const api = window.electronAPI;
  const painter = window.CatCodeV6CustomPalette;
  const skinFile = window.CatCodeV6SkinFileFormat;
  if (!painter) {
    const statusNode = document.getElementById("status");
    if (statusNode) statusNode.textContent = "Ошибка: палитра не загружена";
    return;
  }

  const previewPaths = painter.EDITOR_PREVIEW_PATHS || Object.freeze({
    idle: "idle-master.png",
    walkLeft: "walk/walk-left-f0.png",
    walkRight: "walk/walk-right-f0.png",
    sleep: "sleep/sleep-f1-transition.png",
    hunt: "hunt-smooth/hunt-f8-gaze-ready.png",
    typing: "typing/typing-f0-ready.png",
  });
  const huntPreview = window.CatCodeV6EditorHuntPreview;
  const inputs = Array.from(document.querySelectorAll("input[data-token]"));
  const status = document.getElementById("status");
  let palette = {};
  let currentPattern = null;
  let previewEpoch = 0;

  function setStatus(value) {
    if (status) status.textContent = value || "";
  }

  function syncInputs() {
    const display = painter.displayPalette(palette);
    for (const input of inputs) input.value = display[input.dataset.token];
  }

  function sourcePreviewUrl(relative) {
    // Prefer runtime assetUrl (script-rooted absolute). Fall back to the
    // editor-relative path so HTML never depends on the pet-page root.
    const resolved = painter.assetUrl(relative);
    if (painter.isBrokenEditorPreviewUrl && painter.isBrokenEditorPreviewUrl(resolved)) {
      return painter.editorRelativeAssetUrl
        ? painter.editorRelativeAssetUrl(relative)
        : `../pet/assets/v6/skins/black-owner-v1/${relative}`;
    }
    return resolved;
  }

  function bindSourceFallback(image, relative, sourceUrl) {
    if (!image) return;
    image.onerror = () => {
      if (image.getAttribute("data-preview-failed") === relative) return;
      image.setAttribute("data-preview-failed", relative);
      // Last resort: explicit editor-relative path (never blank the card).
      const fallback = painter.editorRelativeAssetUrl
        ? painter.editorRelativeAssetUrl(relative)
        : `../pet/assets/v6/skins/black-owner-v1/${relative}`;
      if (image.src !== fallback && sourceUrl !== fallback) {
        image.src = fallback;
      }
      setStatus(`Ошибка загрузки предпросмотра: ${relative}`);
    };
  }

  function isHuntPreview(relative) {
    return huntPreview && typeof huntPreview.isHuntPreviewPath === "function"
      && huntPreview.isHuntPreviewPath(relative);
  }

  async function paintPreviewCard(image, name, relative, epoch) {
    if (isHuntPreview(relative) && typeof painter.paintEditorPreview === "function") {
      try {
        const composed = await painter.paintEditorPreview(relative, palette);
        if (image && composed && epoch === previewEpoch) {
          bindSourceFallback(image, relative, composed);
          image.src = composed;
          return null;
        }
      } catch (_) {
        return relative;
      }
    }
    const sourceUrl = sourcePreviewUrl(relative);
    if (image && epoch === previewEpoch) {
      bindSourceFallback(image, relative, sourceUrl);
      image.src = sourceUrl;
    }
    try {
      const dataUrl = await painter.paintEditorPreview(relative, palette);
      if (image && dataUrl && epoch === previewEpoch) image.src = dataUrl;
      else if (!dataUrl && !isHuntPreview(relative) && Object.keys(painter.normalizePalette(palette)).length) {
        return relative;
      }
    } catch (_) {
      return relative;
    }
    return null;
  }

  async function renderPreviews() {
    const epoch = ++previewEpoch;
    setStatus("Обновляю предпросмотр");
    const failures = [];
    await Promise.all(Object.entries(previewPaths).map(async ([name, relative]) => {
      const image = document.getElementById(`preview-${name}`);
      const failure = await paintPreviewCard(image, name, relative, epoch);
      if (failure) failures.push(failure);
    }));
    if (epoch !== previewEpoch) return;
    if (failures.length) {
      setStatus(`Предпросмотр источника показан; перекрас не удался (${failures.join(", ")})`);
      return;
    }
    const explicit = painter.normalizePalette(palette);
    setStatus(Object.keys(explicit).length ? "Предпросмотр обновлён" : "");
  }

  function updateToken(token, value) {
    palette = { ...palette, [token]: value };
    renderPreviews();
  }

  async function apply() {
    if (!api || typeof api.patternSet !== "function") {
      setStatus("Ошибка: нет связи с приложением");
      return;
    }
    const next = {
      ...(currentPattern && typeof currentPattern === "object" ? currentPattern : {}),
      v6SkinId: painter.CUSTOM_SKIN_ID,
      v6CustomPalette: palette,
      v6CustomPaletteVersion: 2,
    };
    currentPattern = next;
    api.patternSet(next);
    setStatus("Окрас применён");
  }

  async function restoreBlack() {
    if (!api || typeof api.patternSet !== "function") {
      setStatus("Ошибка: нет связи с приложением");
      return;
    }
    const next = {
      ...(currentPattern && typeof currentPattern === "object" ? currentPattern : {}),
      v6SkinId: "black-owner-v1",
      v6CustomPalette: {},
      v6CustomPaletteVersion: 2,
    };
    currentPattern = next;
    api.patternSet(next);
    palette = {};
    syncInputs();
    await renderPreviews();
    setStatus("Возвращён чёрный окрас");
  }

  async function exportSkin() {
    if (!api || typeof api.v6SkinExport !== "function" || !skinFile) {
      setStatus("Ошибка: экспорт JSON недоступен");
      return;
    }
    try {
      const file = skinFile.createSkinFile({ name: "Мой окрас", palette });
      const result = await api.v6SkinExport(file);
      if (result && result.ok) setStatus("JSON-скин сохранён");
      else if (!result || !result.canceled) setStatus("Не удалось сохранить JSON-скин");
    } catch (_) {
      setStatus("Не удалось сохранить JSON-скин");
    }
  }

  async function importSkin() {
    if (!api || typeof api.v6SkinImport !== "function" || !skinFile) {
      setStatus("Ошибка: импорт JSON недоступен");
      return;
    }
    let result;
    try {
      result = await api.v6SkinImport();
    } catch (_) {
      setStatus("Не удалось открыть JSON-скин");
      return;
    }
    if (!result || result.canceled) return;
    if (!result.ok || !result.file) {
      setStatus("Этот JSON не является файлом скина CatCode");
      return;
    }
    const checked = skinFile.validateSkinFile(result.file);
    if (!checked.ok) {
      setStatus("Этот JSON не прошёл проверку");
      return;
    }
    palette = checked.value.palette;
    syncInputs();
    await renderPreviews();
    setStatus("Скин загружен в предпросмотр. Нажмите «Применить»");
  }

  for (const input of inputs) {
    input.addEventListener("input", () => updateToken(input.dataset.token, input.value));
  }
  document.getElementById("reset").addEventListener("click", () => {
    palette = {};
    syncInputs();
    renderPreviews().then(() => setStatus("Палитра сброшена"));
  });
  document.getElementById("apply").addEventListener("click", apply);
  document.getElementById("use-black").addEventListener("click", restoreBlack);
  document.getElementById("export-skin").addEventListener("click", exportSkin);
  document.getElementById("import-skin").addEventListener("click", importSkin);

  async function boot() {
    setStatus("Загрузка…");
    // Paint source previews immediately (before pattern IPC) so cards are never empty.
    for (const [name, relative] of Object.entries(previewPaths)) {
      const image = document.getElementById(`preview-${name}`);
      if (isHuntPreview(relative) && typeof painter.paintEditorPreview === "function") {
        try {
          const composed = await painter.paintEditorPreview(relative, palette);
          if (image && composed) {
            bindSourceFallback(image, relative, composed);
            image.src = composed;
            continue;
          }
        } catch (_) {}
      }
      const sourceUrl = sourcePreviewUrl(relative);
      if (image) {
        bindSourceFallback(image, relative, sourceUrl);
        image.src = sourceUrl;
      }
    }
    if (api && typeof api.patternGet === "function") {
      try {
        currentPattern = await api.patternGet();
        palette = painter.normalizePalette(currentPattern && currentPattern.v6CustomPalette);
      } catch (_) {
        setStatus("Ошибка чтения сохранённой палитры");
      }
    }
    syncInputs();
    await renderPreviews();
  }

  if (api && typeof api.onPatternChanged === "function") {
    api.onPatternChanged((pattern) => {
      currentPattern = pattern;
    });
  }
  boot();
})();
