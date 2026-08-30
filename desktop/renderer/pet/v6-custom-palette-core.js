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
  const HUNT_FINAL_RELATIVE_PATH = "hunt-smooth/hunt-f8-gaze-ready.png";
  const IDLE_MASTER_RELATIVE_PATH = "idle-master.png";
  const IDLE_BODY_RELATIVE_PATH = "head-layers/idle-body-under-head-256.png";
  const IDLE_HEAD_RELATIVE_PATH = "head-layers/idle-head-with-neck-underlap-256.png";
  const BLACK_CANONICAL_IDLE_IRIS = Object.freeze([245, 191, 45]);
  const BLACK_CANONICAL_HUNT_IRIS = Object.freeze([245, 191, 45]);
  const typingEyePalette = typeof window !== "undefined"
    ? window.CatCodeV6TypingEyePalette
    : (typeof require === "function" ? require("./v6-eye-palette-raster.js") : null);

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

  function repaintBlackCanonicalHuntIris(imageData, entry, explicit) {
    if (!entry || entry.contractSourcePath !== HUNT_FINAL_RELATIVE_PATH || !explicit.iris) return 0;
    const data = imageData.data;
    const target = hexToRgb(explicit.iris);
    let painted = 0;
    // This is an exact, source-bound role: the black canonical f8 has this
    // one yellow only in its two visible irises (x 54..131, y 174..196).
    // Do not use the 1024 live-gaze mask here: it belongs to a different layer.
    for (let y = 174; y <= 196; y += 1) {
      for (let x = 54; x <= 131; x += 1) {
        const offset = (y * 256 + x) * 4;
        if (data[offset + 3] === 0
          || data[offset] !== BLACK_CANONICAL_HUNT_IRIS[0]
          || data[offset + 1] !== BLACK_CANONICAL_HUNT_IRIS[1]
          || data[offset + 2] !== BLACK_CANONICAL_HUNT_IRIS[2]) continue;
        data[offset] = target[0];
        data[offset + 1] = target[1];
        data[offset + 2] = target[2];
        painted += 1;
      }
    }
    return painted;
  }

  function repaintBlackCanonicalIdleIris(imageData, entry, explicit) {
    if (!imageData || !imageData.data || !entry
      || entry.contractSourcePath !== IDLE_HEAD_RELATIVE_PATH
      || !explicit || !explicit.iris) return 0;
    const data = imageData.data;
    const target = hexToRgb(explicit.iris);
    let painted = 0;
    // The pupil-free idle head intentionally leaves the 161-pixel resting
    // pupil hole in the canonical iris colour. It is still iris material, not
    // a pupil and not an independent static eye colour. Repaint every exact
    // canonical iris pixel in this head, including that hidden-under-pupil
    // area, before the live pupil layer is composited.
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0
        || data[i] !== BLACK_CANONICAL_IDLE_IRIS[0]
        || data[i + 1] !== BLACK_CANONICAL_IDLE_IRIS[1]
        || data[i + 2] !== BLACK_CANONICAL_IDLE_IRIS[2]) continue;
      data[i] = target[0];
      data[i + 1] = target[1];
      data[i + 2] = target[2];
      painted += 1;
    }
    return painted;
  }

  function repaintBlackCanonicalCustomIris(imageData, entry, explicit) {
    if (!imageData || !imageData.data || !entry || typeof entry.sourceSha256 !== "string"
      || !explicit || !explicit.iris) return 0;
    const data = imageData.data;
    const target = hexToRgb(explicit.iris);
    let painted = 0;
    // Stage 16 marks visible eye surfaces as protected-authored because static
    // skins must keep them byte-identical. A custom palette is different: its
    // iris token is explicitly editable. The Black Canonical source uses this
    // exact yellow only for the authored iris pixels in every custom host. Do
    // not touch pupil-black or anti-aliased eye pixels here.
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0
        || data[i] !== BLACK_CANONICAL_IDLE_IRIS[0]
        || data[i + 1] !== BLACK_CANONICAL_IDLE_IRIS[1]
        || data[i + 2] !== BLACK_CANONICAL_IDLE_IRIS[2]) continue;
      data[i] = target[0];
      data[i + 1] = target[1];
      data[i + 2] = target[2];
      painted += 1;
    }
    return painted;
  }

  function composeLayerPixels(bodyPixels, headPixels) {
    const width = 256;
    const height = 256;
    const out = new Uint8ClampedArray(width * height * 4);
    const body = bodyPixels.data;
    const head = headPixels.data;
    for (let i = 0; i < out.length; i += 4) {
      const ba = body[i + 3] / 255;
      const ha = head[i + 3] / 255;
      const alpha = ha + ba * (1 - ha);
      if (alpha <= 0) continue;
      if (ha > 0) {
        out[i] = head[i];
        out[i + 1] = head[i + 1];
        out[i + 2] = head[i + 2];
      } else {
        out[i] = body[i];
        out[i + 1] = body[i + 1];
        out[i + 2] = body[i + 2];
      }
      out[i + 3] = Math.round(alpha * 255);
    }
    return { data: out, width, height };
  }

  function getContracts() {
    if (typeof window !== "undefined" && window.CatCodeV6CustomPaletteContracts) {
      return window.CatCodeV6CustomPaletteContracts;
    }
    if (typeof require === "function") {
      try {
        return require("./v6-custom-palette-contracts.js");
      } catch (_) {}
    }
    return null;
  }

  function buildRoleMap(entry) {
    const map = new Uint8Array(256 * 256);
    if (!entry || !entry.runsByToken) return map;
    for (let roleIndex = 0; roleIndex < TOKEN_KEYS.length; roleIndex += 1) {
      const runs = entry.runsByToken[TOKEN_KEYS[roleIndex]] || [];
      for (const run of runs) {
        const [start, end, y] = run;
        for (let x = start; x <= end; x += 1) {
          map[y * 256 + x] = roleIndex + 1;
        }
      }
    }
    return map;
  }

  // The split head contains an intentional underlap, but its source role at
  // the shared boundary is still outline. For a recoloured coat, resolve only
  // those overlapping pixels through the flattened master role so the seam
  // cannot become a visible line between two differently coloured layers.
  function reconcileIdleHeadBoundary(imageData, palette, contracts) {
    const sourceContracts = contracts || getContracts();
    const masterEntry = sourceContracts && sourceContracts.hosts
      ? sourceContracts.hosts[IDLE_MASTER_RELATIVE_PATH]
      : null;
    const bodyEntry = sourceContracts && sourceContracts.hosts
      ? sourceContracts.hosts[IDLE_BODY_RELATIVE_PATH]
      : null;
    if (!imageData || !imageData.data || !masterEntry || !bodyEntry) return imageData;
    const masterRoles = buildRoleMap(masterEntry);
    const bodyRoles = buildRoleMap(bodyEntry);
    // Preserve explicit-only semantics: an iris-only edit must not silently
    // repaint the boundary with canonical coat tokens.
    const effectivePalette = normalizePalette(palette);
    for (let index = 0; index < bodyRoles.length; index += 1) {
      if (!bodyRoles[index] || !masterRoles[index]) continue;
      const roleIndex = masterRoles[index] - 1;
      const token = TOKEN_KEYS[roleIndex];
      const color = effectivePalette[token];
      if (!color) continue;
      const rgb = hexToRgb(color);
      const offset = index * 4;
      if (imageData.data[offset + 3] === 0) continue;
      imageData.data[offset] = rgb[0];
      imageData.data[offset + 1] = rgb[1];
      imageData.data[offset + 2] = rgb[2];
    }
    return imageData;
  }

  // The body layer has one legacy outline row directly below the head
  // underlap. It is hidden at rest, but becomes visible when the head moves
  // upward. Resolve only that measured boundary row through the master role;
  // all other body anatomy keeps its own authored ownership.
  function reconcileIdleBodyBoundary(imageData, palette, contracts) {
    const sourceContracts = contracts || getContracts();
    const masterEntry = sourceContracts && sourceContracts.hosts
      ? sourceContracts.hosts[IDLE_MASTER_RELATIVE_PATH]
      : null;
    const bodyEntry = sourceContracts && sourceContracts.hosts
      ? sourceContracts.hosts[IDLE_BODY_RELATIVE_PATH]
      : null;
    if (!imageData || !imageData.data || !masterEntry || !bodyEntry) return imageData;
    const masterRoles = buildRoleMap(masterEntry);
    const bodyRoles = buildRoleMap(bodyEntry);
    const effectivePalette = normalizePalette(palette);
    const boundaryY = 170;
    for (let x = 0; x < 256; x += 1) {
      const index = boundaryY * 256 + x;
      if (!bodyRoles[index] || !masterRoles[index]) continue;
      if (bodyRoles[index] === masterRoles[index]) continue;
      const token = TOKEN_KEYS[masterRoles[index] - 1];
      const color = effectivePalette[token];
      if (!color) continue;
      const offset = index * 4;
      if (imageData.data[offset + 3] === 0) continue;
      const rgb = hexToRgb(color);
      imageData.data[offset] = rgb[0];
      imageData.data[offset + 1] = rgb[1];
      imageData.data[offset + 2] = rgb[2];
    }
    return imageData;
  }

  // The pupil-safe idle layers intentionally contain a small shared underlap.
  // For a flat custom idle, the adopted full master is the authority for those
  // shared pixels; otherwise the head's outline role can become a visible
  // horizontal seam when the coat token is changed.
  function reconcileIdleLayerBoundary(composed, bodyPixels, headPixels, masterEntry, palette) {
    if (!composed || !composed.data || !bodyPixels || !headPixels
      || !masterEntry || !masterEntry.runsByToken) return composed;
    const effectivePalette = displayPalette(palette);
    const roleByPixel = new Uint8Array(256 * 256);
    const roleNames = TOKEN_KEYS;
    for (let roleIndex = 0; roleIndex < roleNames.length; roleIndex += 1) {
      const runs = masterEntry.runsByToken[roleNames[roleIndex]] || [];
      for (const run of runs) {
        const [start, end, y] = run;
        for (let x = start; x <= end; x += 1) {
          roleByPixel[y * 256 + x] = roleIndex + 1;
        }
      }
    }
    const body = bodyPixels.data;
    const head = headPixels.data;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const index = y * 256 + x;
        const offset = index * 4;
        if (body[offset + 3] === 0 || head[offset + 3] === 0) continue;
        const roleIndex = roleByPixel[index] - 1;
        if (roleIndex < 0) continue;
        const token = roleNames[roleIndex];
        const color = effectivePalette[token];
        if (!color) continue;
        const rgb = hexToRgb(color);
        composed.data[offset] = rgb[0];
        composed.data[offset + 1] = rgb[1];
        composed.data[offset + 2] = rgb[2];
      }
    }
    return composed;
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
    repaintBlackCanonicalIdleIris(imageData, entry, explicit);
    repaintBlackCanonicalHuntIris(imageData, entry, explicit);
    repaintBlackCanonicalCustomIris(imageData, entry, explicit);
    if (explicit.iris && typingEyePalette
      && typeof typingEyePalette.recolorExactTypingIris === "function") {
      typingEyePalette.recolorExactTypingIris(imageData, entry.contractSourcePath, explicit.iris);
    }
    if (entry.contractSourcePath === IDLE_HEAD_RELATIVE_PATH) {
      reconcileIdleHeadBoundary(imageData, palette);
    }
    if (entry.contractSourcePath === IDLE_BODY_RELATIVE_PATH) {
      reconcileIdleBodyBoundary(imageData, palette);
    }
    return imageData;
  }

  function paintLayerImageData(relativePath, palette, contracts) {
    const entry = contracts && contracts.hosts ? contracts.hosts[relativePath] : null;
    if (!entry) return null;
    return new Promise((resolve) => {
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
        resolve(pixels);
      };
      image.onerror = () => resolve(null);
      image.src = assetUrl(relativePath, entry);
    });
  }

  function paintComposedIdle(palette) {
    const key = `composed-idle:${paletteSignature(palette)}`;
    if (cache.has(key)) return cache.get(key);
    const contracts = typeof window !== "undefined" ? window.CatCodeV6CustomPaletteContracts : null;
    if (!contracts || typeof document === "undefined") return Promise.resolve(null);
    const task = Promise.all([
      paintLayerImageData(IDLE_BODY_RELATIVE_PATH, palette, contracts),
      paintLayerImageData(IDLE_HEAD_RELATIVE_PATH, palette, contracts),
    ]).then((layers) => {
      const [bodyPixels, headPixels] = layers;
      if (!bodyPixels || !headPixels) return null;
      const composed = composeLayerPixels(bodyPixels, headPixels);
      reconcileIdleLayerBoundary(
        composed,
        bodyPixels,
        headPixels,
        contracts.hosts[IDLE_MASTER_RELATIVE_PATH],
        palette,
      );
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.putImageData(
        new ImageData(composed.data, composed.width, composed.height),
        0,
        0,
      );
      return canvas.toDataURL("image/png");
    });
    cache.set(key, task);
    return task;
  }

  function composeIdlePaletteImageData(palette, readLayerPixels) {
    const contracts = typeof require === "function"
      ? require("./v6-custom-palette-contracts.js")
      : (typeof window !== "undefined" ? window.CatCodeV6CustomPaletteContracts : null);
    if (!contracts || typeof readLayerPixels !== "function") return null;
    const bodyEntry = contracts.hosts[IDLE_BODY_RELATIVE_PATH];
    const headEntry = contracts.hosts[IDLE_HEAD_RELATIVE_PATH];
    if (!bodyEntry || !headEntry) return null;
    const body = readLayerPixels(IDLE_BODY_RELATIVE_PATH);
    const head = readLayerPixels(IDLE_HEAD_RELATIVE_PATH);
    if (!body || !head) return null;
    applyPaletteToImageData(body, bodyEntry, palette);
    applyPaletteToImageData(head, headEntry, palette);
    const composed = composeLayerPixels(body, head);
    return reconcileIdleLayerBoundary(
      composed,
      body,
      head,
      contracts.hosts[IDLE_MASTER_RELATIVE_PATH],
      palette,
    );
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
    if (relativePath === IDLE_MASTER_RELATIVE_PATH) {
      return paintComposedIdle(palette);
    }
    const contracts = typeof window !== "undefined" ? window.CatCodeV6CustomPaletteContracts : null;
    const entry = contracts && contracts.hosts ? contracts.hosts[relativePath] : null;
    if (!entry || typeof document === "undefined") return Promise.resolve(null);
    const explicit = normalizePalette(palette);
    if (!Object.keys(explicit).length) {
      return Promise.resolve(null);
    }
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
    const idlePreview = typeof window !== "undefined" ? window.CatCodeV6EditorIdlePreview : null;
    if (idlePreview && typeof idlePreview.isIdlePreviewPath === "function"
      && idlePreview.isIdlePreviewPath(relativePath)
      && typeof idlePreview.paintIdlePreview === "function") {
      const key = `editor-idle:${relativePath}:${paletteSignature(palette)}`;
      if (cache.has(key)) return cache.get(key);
      const task = idlePreview.paintIdlePreview(relativePath, palette, api);
      cache.set(key, task);
      return task;
    }
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
    IDLE_BODY_RELATIVE_PATH,
    IDLE_HEAD_RELATIVE_PATH,
    IDLE_MASTER_RELATIVE_PATH,
    normalizePalette,
    displayPalette,
    paletteSignature,
    applyPaletteToImageData,
    composeLayerPixels,
    reconcileIdleLayerBoundary,
    composeIdlePaletteImageData,
    reconcileIdleBodyBoundary,
    reconcileIdleHeadBoundary,
    repaintBlackCanonicalHuntIris,
    repaintBlackCanonicalIdleIris,
    repaintBlackCanonicalCustomIris,
    assetRoot,
    assetRootFromLocation,
    assetRootFromScriptSrc,
    editorRelativeAssetUrl,
    petRelativeAssetUrl,
    resolvePreviewAssetUrl,
    isBrokenEditorPreviewUrl,
    assetUrl,
    paintAsset,
    paintComposedIdle,
    paintEditorPreview,
    clearCache: () => cache.clear(),
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatCodeV6CustomPalette = api;
})();
