"use strict";

// Portable V6 skin recipes. This file intentionally stores palette choices,
// never PNG paths, geometry, contracts, or runtime state.
(() => {
  const FORMAT = "catcode-skin";
  const VERSION = 1;
  const TOKEN_KEYS = Object.freeze([
    "coatBase",
    "coatShadow",
    "outline",
    "separator",
    "earInner",
    "iris",
    "nose",
    "mouth",
  ]);
  const TOKEN_SET = new Set(TOKEN_KEYS);
  const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

  function normalizeName(value) {
    if (typeof value !== "string") return "Мой окрас";
    const name = value.trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);
    return name || "Мой окрас";
  }

  function normalizePalette(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const palette = {};
    for (const token of TOKEN_KEYS) {
      if (value[token] !== undefined) palette[token] = String(value[token]).toLowerCase();
    }
    return palette;
  }

  function validateSkinFile(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, reason: "file-not-object" };
    }
    if (value.format !== FORMAT) return { ok: false, reason: "unsupported-format" };
    if (value.version !== VERSION) return { ok: false, reason: "unsupported-version" };
    if (!value.palette || typeof value.palette !== "object" || Array.isArray(value.palette)) {
      return { ok: false, reason: "palette-not-object" };
    }
    for (const token of Object.keys(value.palette)) {
      if (!TOKEN_SET.has(token)) return { ok: false, reason: `unknown-token:${token}` };
      if (typeof value.palette[token] !== "string" || !COLOR_PATTERN.test(value.palette[token])) {
        return { ok: false, reason: `invalid-color:${token}` };
      }
    }
    return {
      ok: true,
      value: {
        format: FORMAT,
        version: VERSION,
        name: normalizeName(value.name),
        palette: normalizePalette(value.palette),
      },
    };
  }

  function createSkinFile({ name, palette } = {}) {
    const candidate = {
      format: FORMAT,
      version: VERSION,
      name: normalizeName(name),
      palette: normalizePalette(palette),
    };
    for (const token of Object.keys(candidate.palette)) {
      if (!COLOR_PATTERN.test(candidate.palette[token])) {
        throw new TypeError(`Invalid color for ${token}`);
      }
    }
    return candidate;
  }

  function serializeSkinFile(file) {
    const result = validateSkinFile(file);
    if (!result.ok) throw new TypeError(result.reason);
    return `${JSON.stringify(result.value, null, 2)}\n`;
  }

  function parseSkinFileText(text) {
    if (typeof text !== "string" || text.length > 1024 * 1024) {
      return { ok: false, reason: "file-too-large-or-not-text" };
    }
    try {
      return validateSkinFile(JSON.parse(text));
    } catch (_) {
      return { ok: false, reason: "invalid-json" };
    }
  }

  const api = Object.freeze({
    FORMAT,
    VERSION,
    TOKEN_KEYS,
    createSkinFile,
    validateSkinFile,
    serializeSkinFile,
    parseSkinFileText,
  });

  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatCodeV6SkinFileFormat = api;
})();
