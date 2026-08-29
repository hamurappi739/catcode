"use strict";

(() => {
  // Display defaults for the editor colour pickers. These are NOT applied unless
  // the user explicitly changes a token — untouched custom-palette-v1 must
  // remain pixel-identical to Black Canonical source PNGs.
  const CANONICAL_BASELINE = Object.freeze({
    coatBase: "#12161d",
    coatShadow: "#0a0c10",
    outline: "#080a0e",
    separator: "#0a0c10",
    earInner: "#e894a2",
    iris: "#f5bf2d",
    nose: "#a8606e",
    mouth: "#a8606e",
  });
  const DEFAULT_PALETTE = CANONICAL_BASELINE;
  const TOKEN_KEYS = Object.freeze(Object.keys(CANONICAL_BASELINE));
  const TOKEN_SET = new Set(TOKEN_KEYS);
  const CUSTOM_SKIN_ID = "custom-palette-v1";

  function normalizeColor(value, fallback) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toLowerCase()
      : fallback;
  }

  /** Keep only explicitly provided tokens. Never invent a full repaint palette. */
  function normalizePalette(value, options) {
    const fillDefaults = options && options.fillDefaults === true;
    const input = value && typeof value === "object" ? value : {};
    const next = {};
    for (const key of TOKEN_KEYS) {
      if (input[key] !== undefined) {
        next[key] = normalizeColor(input[key], CANONICAL_BASELINE[key]);
      } else if (fillDefaults) {
        next[key] = CANONICAL_BASELINE[key];
      }
    }
    return next;
  }

  function displayPalette(value) {
    return { ...CANONICAL_BASELINE, ...normalizePalette(value) };
  }

  function hexToRgb(value) {
    const hex = normalizeColor(value, "#000000").slice(1);
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  function paletteSignature(palette) {
    const normalized = normalizePalette(palette);
    return TOKEN_KEYS.filter((key) => normalized[key] !== undefined)
      .map((key) => `${key}:${normalized[key]}`)
      .join("|");
  }

  function applyPaletteToImageData(imageData, entry, palette) {
    if (!imageData || !imageData.data || !entry || !entry.runsByToken) return imageData;
    const explicit = normalizePalette(palette);
    const tokens = Object.keys(explicit);
    if (!tokens.length) return imageData;
    const data = imageData.data;
    for (const token of tokens) {
      if (!TOKEN_SET.has(token)) continue;
      const runs = entry.runsByToken[token];
      if (!runs) continue;
      const color = hexToRgb(explicit[token]);
      for (const run of runs) {
        const [start, end, y] = run;
        for (let x = start; x <= end; x += 1) {
          const offset = (y * 256 + x) * 4;
          if (data[offset + 3] === 0) continue;
          data[offset] = color[0];
          data[offset + 1] = color[1];
          data[offset + 2] = color[2];
        }
      }
    }
    return imageData;
  }

  const cache = new Map();

  /** Editor preview hosts (Black Canonical runtime art). */
  const EDITOR_PREVIEW_PATHS = Object.freeze({
    idle: "idle-master.png",
    walkLeft: "walk/walk-left-f0.png",
    walkRight: "walk/walk-right-f0.png",
    sleep: "sleep/sleep-f1-transition.png",
    hunt: "hunt-smooth/hunt-f8-gaze-ready.png",
    typing: "typing/typing-f0-ready.png",
  });

  const EDITOR_PREVIEW_ORDER = Object.freeze([
    "idle",
    "walkLeft",
    "walkRight",
    "sleep",
    "hunt",
    "typing",
  ]);

  /** Path relative to v6-editor/index.html — never the pet-page asset root. */
  function editorRelativeAssetUrl(relativePath) {
    return `../pet/assets/v6/skins/black-owner-v1/${relativePath}`;
  }

  /** Path relative to pet/index.html. */
  function petRelativeAssetUrl(relativePath) {
    return `assets/v6/skins/black-owner-v1/${relativePath}`;
  }

  function assetRootFromScriptSrc(scriptSrc) {
    if (!scriptSrc) return null;
    try {
      return new URL("./assets/v6/skins/", scriptSrc).href.replace(/\/$/, "");
    } catch (_) {
      return null;
    }
  }

  function assetRootFromLocation(pathnameOrHref) {
    const text = String(pathnameOrHref || "").replace(/\\/g, "/");
    // Match packaged/dev editor pages even if a custom protocol omits /renderer/.
    if (text.includes("/v6-editor/") || text.includes("/v6-editor\\")) {
      return "../pet/assets/v6/skins";
    }
    return "assets/v6/skins";
  }

  function assetRoot() {
    // Prefer the core script directory so editor and pet both resolve to
    // renderer/pet/assets/v6/skins without fragile relative-path guessing.
    if (typeof document !== "undefined") {
      const scripts = document.getElementsByTagName("script");
      for (let i = scripts.length - 1; i >= 0; i -= 1) {
        const src = scripts[i] && scripts[i].src;
        if (src && /v6-custom-palette-core\.js(?:\?|#|$)/i.test(src)) {
          const rooted = assetRootFromScriptSrc(src);
          if (rooted) return rooted;
        }
      }
    }
    if (typeof window !== "undefined" && window.location) {
      return assetRootFromLocation(window.location.pathname || window.location.href || "");
    }
    return "assets/v6/skins";
  }

  /** Always load the runtime host PNG. Contract provenance paths are not image sources. */
  function assetUrl(relativePath, entry) {
    void entry;
    return `${assetRoot()}/black-owner-v1/${relativePath}`;
  }

  /**
   * Resolve a preview URL for a known browsing context.
   * context: "editor" | "pet" | "auto"
   */
  function resolvePreviewAssetUrl(relativePath, context = "auto") {
    if (context === "editor") return editorRelativeAssetUrl(relativePath);
    if (context === "pet") return petRelativeAssetUrl(relativePath);
    return assetUrl(relativePath);
  }

  /** True when a URL cannot load Black Canonical art from the editor page. */
  function isBrokenEditorPreviewUrl(url) {
    const text = String(url || "").replace(/\\/g, "/");
    if (!text) return true;
    if (text.startsWith("data:image/")) return false;
    // Missing sibling tree under v6-editor/ (pathname-detection fallback bug).
    if (/\/v6-editor\/assets\/v6\/skins\//i.test(text)) return true;
    // Bare pet-page relative root — resolves under v6-editor/ and 404s.
    if (/^assets\/v6\/skins\/black-owner-v1\//i.test(text)) return true;
    if (/^\.\/assets\/v6\/skins\/black-owner-v1\//i.test(text)) return true;
    // Accept editor-relative, absolute file/app URLs into pet assets, or script-rooted URLs.
    if (text.startsWith("../pet/assets/v6/skins/black-owner-v1/")) return false;
    if (/\/pet\/assets\/v6\/skins\/black-owner-v1\//i.test(text)) return false;
    return true;
  }

  function paintAsset(relativePath, palette) {
    const contracts = typeof window !== "undefined" ? window.CatCodeV6CustomPaletteContracts : null;
    const entry = contracts && contracts.hosts ? contracts.hosts[relativePath] : null;
    if (!entry || typeof document === "undefined") return Promise.resolve(null);
    const explicit = normalizePalette(palette);
    if (!Object.keys(explicit).length) return Promise.resolve(null);
    const key = `${relativePath}:${paletteSignature(palette)}`;
    if (cache.has(key)) return cache.get(key);
    const task = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, 256, 256);
        const pixels = context.getImageData(0, 0, 256, 256);
        applyPaletteToImageData(pixels, entry, palette);
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => resolve(null);
      image.src = assetUrl(relativePath, entry);
    });
    cache.set(key, task);
    return task;
  }

  /** Editor preview: idle/walk via palette recolour; hunt f8 adds centred runtime pupils. */
  function paintEditorPreview(relativePath, palette) {
    const huntPreview = typeof window !== "undefined" ? window.CatCodeV6EditorHuntPreview : null;
    if (huntPreview && typeof huntPreview.isHuntPreviewPath === "function"
      && huntPreview.isHuntPreviewPath(relativePath)
      && typeof huntPreview.paintHuntPreview === "function") {
      const key = `editor-hunt:${relativePath}:${paletteSignature(palette)}`;
      if (cache.has(key)) return cache.get(key);
      const task = huntPreview.paintHuntPreview(relativePath, palette, api, assetUrl);
      cache.set(key, task);
      return task;
    }
    return paintAsset(relativePath, palette);
  }

  const api = {
    CUSTOM_SKIN_ID,
    CANONICAL_BASELINE,
    DEFAULT_PALETTE,
    TOKEN_KEYS,
    EDITOR_PREVIEW_PATHS,
    EDITOR_PREVIEW_ORDER,
    normalizePalette,
    displayPalette,
    paletteSignature,
    applyPaletteToImageData,
    assetRoot,
    assetRootFromLocation,
    assetRootFromScriptSrc,
    editorRelativeAssetUrl,
    petRelativeAssetUrl,
    resolvePreviewAssetUrl,
    isBrokenEditorPreviewUrl,
    assetUrl,
    paintAsset,
    paintEditorPreview,
    clearCache: () => cache.clear(),
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatCodeV6CustomPalette = api;
})();
