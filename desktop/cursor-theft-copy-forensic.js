"use strict";

// Opt-in V6 cursor-theft-copy forensic. Logs lifecycle + visibility facts only.
// Never logs screen coordinates, key presses, clipboard, prompt text, titles,
// or arbitrary speech strings — only copy category names.
const fs = require("node:fs");
const path = require("node:path");

const CURSOR_THEFT_COPY_FORENSIC_FLAG = "--catcode-v6-cursor-theft-copy-forensic";
const LOG_FILE_NAME = "v6-cursor-theft-copy-forensic.jsonl";
const MAX_BYTES = 256 * 1024;

const ALLOWED_SOURCES = new Set([
  "startup",
  "main-menu",
  "main-send",
  "main-warp",
  "main-restore",
  "tease-phase",
  "renderer-recv",
  "speech-apply",
  "speech-guard",
  "chip-show",
  "chip-clear",
  "chip-sample",
]);

const ALLOWED_KEYS = new Set([
  "enabled",
  "phase",
  "active",
  "mode",
  "warpedFlag",
  "warpOk",
  "restoreOk",
  "announce",
  "listener",
  "copyKind",
  "guard",
  "attrSpeech",
  "attrTheft",
  "attrPose",
  "attrStolen",
  "wellnessBtn",
  "display",
  "visibility",
  "opacity",
  "rectW",
  "rectH",
  "zIndex",
  "hasHost",
  "started",
  "v6Enabled",
  "sleeping",
  "windowReady",
  "reason",
]);

function isCursorTheftCopyForensicArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(CURSOR_THEFT_COPY_FORENSIC_FLAG);
}

function sanitizeRecord(input = {}) {
  const output = {};
  if (!input || typeof input !== "object") return output;
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === "boolean") output[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (typeof value === "string") output[key] = value.slice(0, 48);
  }
  return output;
}

function createCursorTheftCopyForensicController({
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
    const safeSource = ALLOWED_SOURCES.has(source) ? source : "speech-guard";
    const line =
      JSON.stringify({
        ts: now(),
        v: 1,
        source: safeSource,
        ...sanitizeRecord(payload),
      }) + "\n";
    try {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size >= MAX_BYTES) {
        return false;
      }
      fs.appendFileSync(logPath, line, "utf8");
      return true;
    } catch (_) {
      return false;
    }
  }

  if (active) record("startup", { enabled: true });
  return {
    enabled: active,
    getLogPath: () => logPath,
    record,
    sanitizeRecord,
  };
}

let current = null;

function initCursorTheftCopyForensic(options) {
  current = createCursorTheftCopyForensicController(options);
  return current;
}

function getCursorTheftCopyForensic() {
  return current;
}

module.exports = {
  CURSOR_THEFT_COPY_FORENSIC_FLAG,
  LOG_FILE_NAME,
  ALLOWED_SOURCES,
  ALLOWED_KEYS,
  isCursorTheftCopyForensicArgEnabled,
  sanitizeRecord,
  createCursorTheftCopyForensicController,
  initCursorTheftCopyForensic,
  getCursorTheftCopyForensic,
};
