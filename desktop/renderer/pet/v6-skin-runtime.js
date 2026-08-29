"use strict";

// V6 skin selection resolves exact authored PNGs. Never recolours Ginger.
(() => {
  const catalog = typeof window !== "undefined" ? window.CatCodeV6SkinCatalog : null;
  const staticAssets = typeof window !== "undefined" ? window.CatCodeV6StaticSkinAssets : null;
  const customPalette = typeof window !== "undefined" ? window.CatCodeV6CustomPalette : null;
  const customContracts = typeof window !== "undefined" ? window.CatCodeV6CustomPaletteContracts : null;
  const BASE_SKIN_ID = catalog ? catalog.V6_DEFAULT_SKIN_ID : "snowball";
  const CUSTOM_SKIN_ID = customPalette ? customPalette.CUSTOM_SKIN_ID : "custom-palette-v1";
  let selectedId = BASE_SKIN_ID;
  let selectedPalette = {};

  function normalize(value) {
    return catalog && typeof catalog.normalizeV6SkinId === "function"
      ? catalog.normalizeV6SkinId(value)
      : BASE_SKIN_ID;
  }

  function syncGazePaintMode() {
    if (typeof document === "undefined" || !document.body || !document.body.dataset) return;
    const skin = catalog && typeof catalog.getV6Skin === "function"
      ? catalog.getV6Skin(selectedId)
      : null;
    // This flag is published with the skin switch so the gaze painter cannot
    // observe the previous skin for one frame and repaint an iris over a pupil.
    document.body.dataset.v6GazePaintMode =
      skin && skin.idleGazeBaseWithoutPupils === true ? "pupil-only" : "full";
  }

  function resolveSource(source) {
    if (selectedId === BASE_SKIN_ID || typeof source !== "string") return source;
    const prefix = "assets/v6/";
    if (!source.startsWith(prefix)) return source;
    const relative = source.slice(prefix.length);
    if (selectedId === CUSTOM_SKIN_ID) {
      const entry = customContracts && customContracts.hosts && customContracts.hosts[relative];
      return entry && customPalette ? customPalette.assetUrl(relative, entry) : source;
    }
    const assets = staticAssets && staticAssets[selectedId];
    if (!Array.isArray(assets) || !assets.includes(relative)) return source;
    return `assets/v6/skins/${selectedId}/${relative}`;
  }

  function setHostSource(host, explicitSource) {
    if (!host || !host.dataset) return;
    const source = explicitSource || host.dataset.src;
    if (!source) return;
    const prefix = "assets/v6/";
    const relative = source.startsWith(prefix) ? source.slice(prefix.length) : null;
    const resolved = resolveSource(source);
    const previousId = host.dataset.v6SkinId;
    host.dataset.v6SkinId = selectedId;
    if (host.getAttribute("src") !== resolved) host.src = resolved;
    else if (previousId && previousId !== selectedId) host.src = resolved;
    if (
      selectedId === CUSTOM_SKIN_ID &&
      relative &&
      customContracts &&
      customContracts.hosts &&
      customContracts.hosts[relative] &&
      customPalette
    ) {
      const request = `${relative}:${customPalette.paletteSignature(selectedPalette)}`;
      host.dataset.v6CustomPaletteRequest = request;
      customPalette.paintAsset(relative, selectedPalette).then((painted) => {
        if (
          painted &&
          selectedId === CUSTOM_SKIN_ID &&
          host.dataset.v6CustomPaletteRequest === request
        ) {
          host.src = painted;
        }
      }).catch(() => {});
    }
  }

  function refreshHosts() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("img.v6-pose-host[data-src], img[data-v6-skin-layer='1'][data-src]")
      .forEach((host) => setHostSource(host));
  }

  function clearStaleOverlays(reason) {
    const gaze = typeof window !== "undefined" ? window.CatCodeV6Gaze : null;
    if (gaze) {
      if (typeof gaze.clear === "function") gaze.clear();
      if (typeof gaze.clearHunt === "function") gaze.clearHunt();
      if (typeof gaze.resetIdleAttention === "function") gaze.resetIdleAttention();
      if (typeof gaze.resetHeadMotion === "function") gaze.resetHeadMotion();
    }
    const exclusive = typeof window !== "undefined" ? window.CatCodeV6ExclusivePoseReset : null;
    if (exclusive && typeof exclusive.resetForReturn === "function") {
      exclusive.resetForReturn(reason);
    }
    const pose = typeof window !== "undefined" ? window.CatCodeV6VisualPose : null;
    if (pose && typeof pose.wakeToIdle === "function") {
      try {
        pose.wakeToIdle(reason);
      } catch (_) {}
    }
  }

  function setSelected(value) {
    const next = normalize(value);
    const changed = next !== selectedId;
    selectedId = next;
    if (typeof document !== "undefined" && document.body && document.body.dataset) {
      document.body.dataset.v6Skin = selectedId;
    }
    syncGazePaintMode();
    if (changed) {
      clearStaleOverlays("skin-switch");
      refreshHosts();
      // Re-request idle head/body decode so 256 layers can set head-motion-ready
      // again after overlay cleanup (do not leave readiness permanently cleared).
      const gaze = typeof window !== "undefined" ? window.CatCodeV6Gaze : null;
      if (gaze && typeof gaze.requestTick === "function") gaze.requestTick();
      // Pupil-free skin heads must receive a centre gaze frame immediately
      // after switching, even when the OS cursor has not moved yet.
      if (gaze && typeof gaze.handleCursorPos === "function") {
        gaze.handleCursorPos({ dx: 0, dy: 0 });
      }
    } else {
      refreshHosts();
    }
    return selectedId;
  }

  function syncPattern(pattern) {
    if (customPalette) selectedPalette = customPalette.normalizePalette(pattern && pattern.v6CustomPalette);
    setSelected(pattern && pattern.v6SkinId);
  }

  if (typeof document !== "undefined" && document.body && document.body.dataset) {
    document.body.dataset.v6Skin = selectedId;
  }
  syncGazePaintMode();

  if (typeof window !== "undefined") {
    window.CatCodeV6Skin = {
      getSelected: () => ({ id: selectedId }),
      getReady: () => Promise.resolve(),
      setHostSource,
      refreshHosts,
      setSelected,
      clearCache: () => customPalette && customPalette.clearCache(),
    };
    if (window.electronAPI && typeof window.electronAPI.patternGet === "function") {
      window.electronAPI.patternGet().then(syncPattern).catch(() => {});
    }
    if (window.electronAPI && typeof window.electronAPI.onPatternChanged === "function") {
      window.electronAPI.onPatternChanged(syncPattern);
    }
  }
})();

if (typeof module === "object" && module.exports) {
  module.exports = {
    createV6SkinHelpers(catalog, staticAssets = {}) {
      const baseId = catalog.V6_DEFAULT_SKIN_ID;
      return {
        getV6Skin: (id) => catalog.getV6Skin(id),
        shouldSkipHost: () => false,
        resolveSource: (id, source) => {
          const normalized = catalog.normalizeV6SkinId(id);
          if (normalized === baseId || typeof source !== "string" || !source.startsWith("assets/v6/")) {
            return source;
          }
          const relative = source.slice("assets/v6/".length);
          return Array.isArray(staticAssets[normalized]) && staticAssets[normalized].includes(relative)
            ? `assets/v6/skins/${normalized}/${relative}`
            : source;
        },
      };
    },
  };
}
