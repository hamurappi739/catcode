"use strict";

/**
 * Opt-in V6 music-dance forensic logger.
 * Active only with --catcode-dance-forensic. Never logs audio samples,
 * keystrokes, cursor coordinates, clipboard, window titles, or arbitrary paths.
 */

const fs = require("node:fs");
const path = require("node:path");

const DANCE_FORENSIC_FLAG = "--catcode-dance-forensic";
const LOG_FILE_NAME = "v6-dance-forensic.jsonl";
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_RATE_LIMIT_MS = 250;

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
  "main-meter",
  "main-setting",
  "music-dance-sync",
  "v6-dance-sync",
  "v6-dance-step",
  "v6-dance-stop",
  "renderer",
]);

function isDanceForensicArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(DANCE_FORENSIC_FLAG);
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
    if (t === "boolean" || t === "number" || t === "string") {
      if (t === "string" && value.length > 64) out[key] = value.slice(0, 64);
      else if (t === "number" && !Number.isFinite(value)) out[key] = null;
      else out[key] = value;
      continue;
    }
    if (t === "object" && !Array.isArray(value)) {
      const nested = {};
      for (const [nk, nv] of Object.entries(value)) {
        if (isForbiddenKey(nk)) continue;
        if (typeof nv === "boolean" || typeof nv === "number" || typeof nv === "string") {
          nested[nk] = nv;
        }
      }
      out[key] = nested;
    }
  }
  return out;
}

function createDanceForensicController({
  enabled = false,
  userDataPath,
  version = "0",
  platform = process.platform,
  now = Date.now,
  maxBytes = DEFAULT_MAX_BYTES,
  rateLimitMs = DEFAULT_RATE_LIMIT_MS,
} = {}) {
  const active = !!enabled;
  let logPath = null;
  let lastWriteAt = 0;
  let dropped = 0;

  if (active && userDataPath) {
    const logsDir = path.join(userDataPath, "logs");
    try {
      fs.mkdirSync(logsDir, { recursive: true });
    } catch (_) {}
    logPath = path.join(logsDir, LOG_FILE_NAME);
  }

  function getLogPath() {
    return logPath;
  }

  function append(record) {
    if (!active || !logPath) return false;
    const t = now();
    if (t - lastWriteAt < rateLimitMs) {
      dropped += 1;
      return false;
    }
    lastWriteAt = t;
    const line =
      JSON.stringify({
        ts: t,
        v: 1,
        appVersion: String(version).slice(0, 32),
        platform: String(platform).slice(0, 16),
        dropped,
        ...sanitizeRecord(record),
      }) + "\n";
    dropped = 0;
    try {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > maxBytes) {
        fs.writeFileSync(logPath, "", "utf8");
      }
      fs.appendFileSync(logPath, line, "utf8");
      return true;
    } catch (_) {
      return false;
    }
  }

  function record(source, payload = {}) {
    const src = ALLOWED_SOURCES.includes(source) ? source : "renderer";
    return append({ source: src, ...payload });
  }

  if (active) {
    record("startup", { enabled: true });
  }

  return {
    enabled: active,
    getLogPath,
    record,
    sanitizeRecord,
  };
}

let activeController = null;

function initDanceForensic(options) {
  activeController = createDanceForensicController(options);
  return activeController;
}

function getDanceForensic() {
  return activeController;
}

function resetDanceForensicForTests() {
  activeController = null;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    DANCE_FORENSIC_FLAG,
    LOG_FILE_NAME,
    isDanceForensicArgEnabled,
    createDanceForensicController,
    initDanceForensic,
    getDanceForensic,
    resetDanceForensicForTests,
    sanitizeRecord,
  };
}
