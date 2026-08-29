"use strict";

// Opt-in V6 cursor-tease trace. It records state names only: never pointer
// coordinates, input content, window titles, clipboard, or OS cursor data.
const fs = require("node:fs");
const path = require("node:path");

const CURSOR_TEASE_FORENSIC_FLAG = "--catcode-v6-cursor-tease-forensic";
const LOG_FILE_NAME = "v6-cursor-tease-forensic.jsonl";
const MAX_BYTES = 128 * 1024;
const ALLOWED_SOURCES = new Set([
  "startup",
  "main-menu",
  "ipc-send",
  "renderer-received",
  "guard-reject",
  "pose-enter",
  "frame",
  "cancel",
  "assets",
]);
const FORBIDDEN_KEY_PARTS = Object.freeze([
  "cursor",
  "coord",
  "point",
  "mouse",
  "key",
  "text",
  "clipboard",
  "title",
  "token",
  "password",
  "path",
]);

function isCursorTeaseForensicArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(CURSOR_TEASE_FORENSIC_FLAG);
}

function isForbiddenKey(key) {
  const normalized = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "x" || normalized === "y") return true;
  return FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitizeRecord(input = {}) {
  const output = {};
  if (!input || typeof input !== "object") return output;
  for (const [key, value] of Object.entries(input)) {
    if (isForbiddenKey(key)) continue;
    if (typeof value === "boolean") output[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (typeof value === "string") output[key] = value.slice(0, 64);
  }
  return output;
}

function createCursorTeaseForensicController({
  enabled = false,
  userDataPath,
  now = Date.now,
} = {}) {
  const active = !!enabled;
  let logPath = null;
  if (active && userDataPath) {
    try {
      const logsDir = path.join(userDataPath, "logs");
      fs.mkdirSync(logsDir, { recursive: true });
      logPath = path.join(logsDir, LOG_FILE_NAME);
      fs.writeFileSync(logPath, "", "utf8");
    } catch (_) {}
  }

  function record(source, payload = {}) {
    if (!active || !logPath) return false;
    const safeSource = ALLOWED_SOURCES.has(source) ? source : "guard-reject";
    const line = JSON.stringify({ ts: now(), v: 1, source: safeSource, ...sanitizeRecord(payload) }) + "\n";
    try {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size >= MAX_BYTES) return false;
      fs.appendFileSync(logPath, line, "utf8");
      return true;
    } catch (_) {
      return false;
    }
  }

  if (active) record("startup", { enabled: true });
  return { enabled: active, getLogPath: () => logPath, record, sanitizeRecord };
}

let current = null;
function initCursorTeaseForensic(options) {
  current = createCursorTeaseForensicController(options);
  return current;
}
function getCursorTeaseForensic() {
  return current;
}

module.exports = {
  CURSOR_TEASE_FORENSIC_FLAG,
  LOG_FILE_NAME,
  isCursorTeaseForensicArgEnabled,
  sanitizeRecord,
  createCursorTeaseForensicController,
  initCursorTeaseForensic,
  getCursorTeaseForensic,
};
