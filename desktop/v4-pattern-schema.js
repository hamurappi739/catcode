"use strict";

// Shared V4 pattern/skin schema helpers for pet + editor.
// schemaVersion 4 is the canonical CatCode V4 appearance contract.
// Legacy part spot arrays are preserved under the same keys and mirrored
// into `legacy.parts` for explicit compatibility — never discarded.

const V4_SCHEMA_VERSION = 4;
const V6_CUSTOM_PALETTE_KEYS = Object.freeze([
  "coatBase",
  "coatShadow",
  "outline",
  "separator",
  "earInner",
  "iris",
  "nose",
  "mouth",
]);
// Versions before the explicit-only editor wrote this complete default object
// into every pattern. It was never an owner choice and must migrate to empty.
const V6_CUSTOM_PALETTE_LEGACY_AUTOFILL = Object.freeze({
  coatBase: "#12161d",
  coatShadow: "#0a0c10",
  outline: "#080a0e",
  separator: "#0a0c10",
  earInner: "#e894a2",
  iris: "#f5bf2d",
  nose: "#a8606e",
  mouth: "#a8606e",
});
const V6_CUSTOM_PALETTE_VERSION = 2;

const V4_PATTERN_DEFAULTS = Object.freeze({
  schemaVersion: V4_SCHEMA_VERSION,
  selectedPresetId: null,
  // V6 is currently locked to its authored white master. Keep the old field
  // only so saved settings remain readable; normalization always selects it.
  v6SkinId: "snowball",
  v6CustomPalette: {},
  v6CustomPaletteVersion: V6_CUSTOM_PALETTE_VERSION,
  name: "",
  pixelResolution: 2,
  baseColor: "#20242D",
  earInnerColor: "#F18AA5",
  eyeColor: "#A7EFF0",
  eyeBgColor: "#EDF4F5",
  eyeOutlineColor: "#1C1C1C",
  eyePupilScale: 100,
  eyeStyle: "natural",
  eyePupilColor: "#141820",
  oddEye: false,
  eyeColorLeft: "#A7EFF0",
  eyeColorRight: "#A7EFF0",
  closedLidColor: "#1A1E26",
  noseColor: "#304055",
  markingColor: "#3A4559",
  markings: [],
  regionColors: {
    head: "",
    body: "",
    frontPaws: "",
    hindPaws: "",
    tail: "",
    ears: "",
  },
  regionMarkings: {
    head: [],
    body: [],
    frontPaws: [],
    hindPaws: [],
    tail: [],
    ears: [],
  },
  head: [],
  body: [],
  tail: [],
  legFl: [],
  legFr: [],
  legRl: [],
  legRr: [],
  earL: [],
  earR: [],
  sidePatternMode: "auto",
  side: [],
  legacy: {},
});

const V4_SPOT_KEYS = Object.freeze([
  "head",
  "body",
  "tail",
  "legFl",
  "legFr",
  "legRl",
  "legRr",
  "earL",
  "earR",
  "side",
]);

const V4_REGION_KEYS = Object.freeze([
  "head",
  "body",
  "frontPaws",
  "hindPaws",
  "tail",
  "ears",
]);

function clampEyePupilScale(value) {
  return Math.max(40, Math.min(140, Math.round(Number(value) || 100)));
}

function asColor(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asSpotArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeMarkings(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const spot of value) {
    if (!spot || typeof spot.color !== "string" || !spot.color) continue;
    const x = Number(spot.x);
    const y = Number(spot.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (x < 0 || y < 0 || x > 63 || y > 63) continue;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y, color: spot.color });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

function normalizeRegionColors(value) {
  const source = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of V4_REGION_KEYS) {
    out[key] =
      typeof source[key] === "string" && /^#[0-9A-Fa-f]{6}$/.test(source[key])
        ? source[key]
        : "";
  }
  return out;
}

function normalizeRegionMarkings(value) {
  const source = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of V4_REGION_KEYS) {
    out[key] = normalizeMarkings(source[key]);
  }
  return out;
}

function normalizeV6CustomPalette(value) {
  const source = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of V6_CUSTOM_PALETTE_KEYS) {
    if (typeof source[key] === "string" && /^#[0-9A-Fa-f]{6}$/.test(source[key])) {
      out[key] = source[key].toLowerCase();
    }
  }
  const isLegacyAutofill = V6_CUSTOM_PALETTE_KEYS.every(
    (key) => out[key] === V6_CUSTOM_PALETTE_LEGACY_AUTOFILL[key],
  );
  // Preserve real user palettes, including partial ones. Only the former
  // all-token machine default becomes an identity-safe empty palette.
  return isLegacyAutofill ? {} : out;
}

function collectLegacyParts(nested) {
  const parts = {};
  let any = false;
  for (const key of V4_SPOT_KEYS) {
    const spots = asSpotArray(nested[key]);
    parts[key] = spots;
    if (spots.length) any = true;
  }
  const prior =
    nested.legacy && typeof nested.legacy === "object" ? nested.legacy : {};
  const merged = { ...prior };
  if (any || prior.parts) merged.parts = prior.parts || parts;
  if (typeof nested.pixelResolution === "number" && nested.pixelResolution !== 2) {
    merged.sourcePixelResolution = nested.pixelResolution;
  }
  return merged;
}

/**
 * Normalize a persisted or imported pattern for V4 runtime.
 * Accepts pre-v4 files without dropping coat-marking arrays.
 */
function normalizeV4Pattern(input) {
  const source = input && typeof input === "object" ? input : {};
  const nested =
    source.pattern && typeof source.pattern === "object" ? source.pattern : source;
  const eye = asColor(nested.eyeColor, V4_PATTERN_DEFAULTS.eyeColor);
  const schemaVersion = Number(nested.schemaVersion) === 4 ? 4 : Number(nested.schemaVersion) || 1;
  const legacy = collectLegacyParts(nested);
  const v6SkinId = (() => {
    try {
      const {
        normalizeV6SkinId,
      } = require("./renderer/pet/v6-skin-catalog");
      return normalizeV6SkinId(nested.v6SkinId);
    } catch (_) {
      return typeof nested.v6SkinId === "string" && nested.v6SkinId.trim()
        ? nested.v6SkinId.trim().slice(0, 48)
        : V4_PATTERN_DEFAULTS.v6SkinId;
    }
  })();
  const isCurrentCustomPalette =
    v6SkinId === "custom-palette-v1" &&
    Number(nested.v6CustomPaletteVersion) === V6_CUSTOM_PALETTE_VERSION;
  const v6CustomPalette = isCurrentCustomPalette
    ? normalizeV6CustomPalette(nested.v6CustomPalette)
    : {};
  const normalized = {
    schemaVersion: V4_SCHEMA_VERSION,
    selectedPresetId:
      typeof nested.selectedPresetId === "string"
        ? nested.selectedPresetId
        : typeof source.selectedPresetId === "string"
          ? source.selectedPresetId
          : null,
    v6SkinId,
    v6CustomPalette,
    v6CustomPaletteVersion: V6_CUSTOM_PALETTE_VERSION,
    name:
      typeof nested.name === "string"
        ? nested.name
        : typeof source.name === "string"
          ? source.name
          : "",
    // Version 2 skins keep coordinates on doubled per-part detail grids.
    // Older files intentionally remain unmarked so the renderer can migrate them.
    pixelResolution: Number(nested.pixelResolution) === 2 ? 2 : 1,
    baseColor: asColor(nested.baseColor, V4_PATTERN_DEFAULTS.baseColor),
    earInnerColor: asColor(
      nested.earInnerColor,
      V4_PATTERN_DEFAULTS.earInnerColor,
    ),
    eyeColor: eye,
    eyeBgColor: asColor(nested.eyeBgColor, V4_PATTERN_DEFAULTS.eyeBgColor),
    eyeOutlineColor: asColor(
      nested.eyeOutlineColor,
      V4_PATTERN_DEFAULTS.eyeOutlineColor,
    ),
    eyePupilScale: clampEyePupilScale(nested.eyePupilScale),
    eyeStyle: nested.eyeStyle === "solid" ? "solid" : "natural",
    eyePupilColor: asColor(
      nested.eyePupilColor,
      V4_PATTERN_DEFAULTS.eyePupilColor,
    ),
    oddEye: !!nested.oddEye,
    eyeColorLeft: asColor(nested.eyeColorLeft, eye),
    eyeColorRight: asColor(nested.eyeColorRight, eye),
    closedLidColor: asColor(
      nested.closedLidColor,
      V4_PATTERN_DEFAULTS.closedLidColor,
    ),
    noseColor: asColor(nested.noseColor, V4_PATTERN_DEFAULTS.noseColor),
    markingColor: asColor(
      nested.markingColor,
      V4_PATTERN_DEFAULTS.markingColor,
    ),
    markings: normalizeMarkings(nested.markings),
    regionColors: normalizeRegionColors(nested.regionColors),
    regionMarkings: normalizeRegionMarkings(nested.regionMarkings),
    sidePatternMode: nested.sidePatternMode === "custom" ? "custom" : "auto",
    legacy,
    migratedFromSchemaVersion: schemaVersion === 4 ? undefined : schemaVersion,
  };
  for (const key of V4_SPOT_KEYS) {
    normalized[key] = asSpotArray(nested[key]);
  }
  if (!normalized.migratedFromSchemaVersion) delete normalized.migratedFromSchemaVersion;
  return normalized;
}

function stripSelectedPresetId(pattern) {
  const next = normalizeV4Pattern(pattern);
  delete next.selectedPresetId;
  return next;
}

const api = {
  V4_SCHEMA_VERSION,
  V4_PATTERN_DEFAULTS,
  V4_SPOT_KEYS,
  V4_REGION_KEYS,
  clampEyePupilScale,
  normalizeMarkings,
  normalizeRegionColors,
  normalizeRegionMarkings,
  normalizeV6CustomPalette,
  normalizeV4Pattern,
  stripSelectedPresetId,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.CatCodeV4PatternSchema = api;
}
