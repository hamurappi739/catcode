"use strict";

/**
 * Opt-in V6 dance-rotation forensic logger.
 * Active only with --catcode-v6-dance-rotation-forensic.
 * Never logs audio samples, keys, cursor coords, titles, clipboard, or paths
 * outside the CatCode userData logs directory.
 */

const fs = require("node:fs");
const path = require("node:path");

const DANCE_ROTATION_FORENSIC_FLAG = "--catcode-v6-dance-rotation-forensic";
const LOG_FILE_NAME = "v6-dance-rotation-forensic.jsonl";
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_MS = 20_000;
const DEFAULT_RATE_LIMIT_MS = 80;

const FORBIDDEN_KEY_EXACT = new Set([
  "dx",
  "dy",
  "x",
  "y",
  "key",
  "keys",
  "code",
  "text",
  "title",
  "peak",
  "sample",
  "samples",
  "pcm",
  "waveform",
]);
const FORBIDDEN_KEY_PARTS = Object.freeze([
  "clipboard",
  "password",
  "token",
  "cursor",
  "keycode",
  "windowtitle",
  "filepath",
  "pathname",
]);

const ALLOWED_SOURCES = Object.freeze([
  "startup",
  "controller-loaded",
  "sync-music",
  "step",
  "stop",
  "reset",
  "attr",
  "assets",
  "visible-host",
  "window-error",
  "music-dance",
  "renderer",
]);

function isDanceRotationForensicArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(DANCE_ROTATION_FORENSIC_FLAG);
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isForbiddenKey(key) {
  const n = normalizeKey(key);
  if (FORBIDDEN_KEY_EXACT.has(n)) return true;
  return FORBIDDEN_KEY_PARTS.some((part) => n.includes(part));
}

function sanitizeRecord(input = {}) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (isForbiddenKey(key)) continue;
    if (value == null) {
      out[key] = value;
      continue;
    }
    const t = typeof value;
    if (t === "boolean" || t === "number") {
      out[key] = t === "number" && !Number.isFinite(value) ? null : value;
      continue;
    }
    if (t === "string") {
      out[key] = value.length > 96 ? value.slice(0, 96) : value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value
        .slice(0, 32)
        .map((item) =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean"
            ? item
            : null,
        )
        .filter((item) => item != null);
      continue;
    }
    if (t === "object") {
      const nested = {};
      for (const [nk, nv] of Object.entries(value)) {
        if (isForbiddenKey(nk)) continue;
        if (
          typeof nv === "boolean" ||
          typeof nv === "number" ||
          typeof nv === "string"
        ) {
          nested[nk] = typeof nv === "string" && nv.length > 64 ? nv.slice(0, 64) : nv;
        }
      }
      out[key] = nested;
    }
  }
  return out;
}

function createDanceRotationForensicController({
  enabled = false,
  userDataPath,
  version = "0",
  platform = process.platform,
  now = Date.now,
  maxBytes = DEFAULT_MAX_BYTES,
  maxMs = DEFAULT_MAX_MS,
  rateLimitMs = DEFAULT_RATE_LIMIT_MS,
} = {}) {
  const active = !!enabled;
  let logPath = null;
  let startedAt = now();
  let lastWriteAt = 0;
  let dropped = 0;
  let sealed = false;
  let bytesWritten = 0;

  if (active && userDataPath) {
    const logsDir = path.join(userDataPath, "logs");
    try {
      fs.mkdirSync(logsDir, { recursive: true });
    } catch (_) {}
    logPath = path.join(logsDir, LOG_FILE_NAME);
    try {
      fs.writeFileSync(logPath, "", "utf8");
    } catch (_) {}
  }

  function getLogPath() {
    return logPath;
  }

  function expired() {
    return sealed || now() - startedAt >= maxMs || bytesWritten >= maxBytes;
  }

  function append(record, { force = false } = {}) {
    if (!active || !logPath || (expired() && !force)) {
      if (active && !sealed && expired()) {
        sealed = true;
      }
      return false;
    }
    const t = now();
    if (!force && t - lastWriteAt < rateLimitMs) {
      dropped += 1;
      return false;
    }
    lastWriteAt = t;
    const line =
      JSON.stringify({
        ts: t,
        elapsedMs: t - startedAt,
        v: 1,
        appVersion: String(version).slice(0, 32),
        platform: String(platform).slice(0, 16),
        dropped,
        ...sanitizeRecord(record),
      }) + "\n";
    dropped = 0;
    try {
      fs.appendFileSync(logPath, line, "utf8");
      bytesWritten += Buffer.byteLength(line, "utf8");
      if (expired()) sealed = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function record(source, payload = {}, opts) {
    const src = ALLOWED_SOURCES.includes(source) ? source : "renderer";
    return append({ source: src, ...payload }, opts);
  }

  if (active) {
    record("startup", { enabled: true, maxMs, maxBytes }, { force: true });
  }

  return {
    enabled: active,
    getLogPath,
    record,
    sanitizeRecord,
    isSealed: () => sealed,
  };
}

let activeController = null;

function initDanceRotationForensic(options) {
  activeController = createDanceRotationForensicController(options);
  return activeController;
}

function getDanceRotationForensic() {
  return activeController;
}

function resetDanceRotationForensicForTests() {
  activeController = null;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    DANCE_ROTATION_FORENSIC_FLAG,
    LOG_FILE_NAME,
    DEFAULT_MAX_BYTES,
    DEFAULT_MAX_MS,
    isDanceRotationForensicArgEnabled,
    createDanceRotationForensicController,
    initDanceRotationForensic,
    getDanceRotationForensic,
    resetDanceRotationForensicForTests,
    sanitizeRecord,
  };
}
