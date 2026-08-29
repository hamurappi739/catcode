"use strict";

// Live V4 editor preview — same idle SVG + palette pipeline as the desktop pet.
(() => {
  const preview = document.getElementById("v4-editor-preview");
  if (!preview) return;

  function normalize(pattern) {
    if (
      window.CatCodeV4PatternSchema &&
      typeof window.CatCodeV4PatternSchema.normalizeV4Pattern === "function"
    ) {
      return window.CatCodeV4PatternSchema.normalizeV4Pattern(pattern || {});
    }
    return pattern || {};
  }

  function paint(pattern) {
    const palette = window.CatCodeV4Palette;
    if (!palette || typeof palette.applyPalette !== "function") return;
    const next = normalize(pattern);
    const apply = () => {
      const root =
        preview.contentDocument && preview.contentDocument.documentElement;
      if (!root) return;
      palette.applyPalette(root, next);
    };
    if (preview.contentDocument && preview.contentDocument.documentElement) {
      apply();
      return;
    }
    preview.addEventListener("load", apply, { once: true });
  }

  preview.addEventListener("load", () => {
    if (window.__catcodeEditorPattern) paint(window.__catcodeEditorPattern);
  });

  if (window.electronAPI && typeof window.electronAPI.patternGet === "function") {
    window.electronAPI.patternGet().then((pattern) => {
      window.__catcodeEditorPattern = pattern;
      paint(pattern);
    });
  }
  if (
    window.electronAPI &&
    typeof window.electronAPI.onPatternChanged === "function"
  ) {
    window.electronAPI.onPatternChanged((pattern) => {
      window.__catcodeEditorPattern = pattern;
      paint(pattern);
    });
  }

  window.CatCodeV4EditorPreview = { paint };
})();
