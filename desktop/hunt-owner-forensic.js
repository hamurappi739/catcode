"use strict";

/**
 * Opt-in V6 hunt owner forensic logger.
 * Active only with --catcode-v6-hunt-owner-forensic (or the QA package marker).
 * Logs state/booleans/named reasons only — never absolute cursor coordinates,
 * key text, clipboard, window titles, or full filesystem paths.
 */

const fs = require("node:fs");
const path = require("node:path");

const HUNT_OWNER_FORENSIC_FLAG = "--catcode-v6-hunt-owner-forensic";
const LOG_FILE_NAME = "v6-hunt-owner-forensic.jsonl";
const QA_MARKER_FILE = "v6-hunt-owner-forensic-qa.marker";
const REPAIR_QA_MARKER_FILE = "v6-hunt-forensic-ipc-gap-repair-qa.marker";
const HANDSHAKE_QA_MARKER_FILE = "v6-hunt-renderer-ready-handshake-qa.marker";
const BOOT_QA_MARKER_FILE = "v6-hunt-renderer-boot-chain-repair-qa.marker";
const DELIVERY_QA_MARKER_FILE =
  "v6-hunt-post-handshake-delivery-and-gesture-qa.marker";
const HEAD_DANCE_QA_MARKER_FILE = "v6-hunt-head-dance-repair-qa.marker";
const VISUAL_FOCUS_QA_MARKER_FILE =
  "v6-hunt-visual-focus-and-play-gesture-qa.marker";
const LIVE_BOOT_QA_MARKER_FILE =
  "v6-hunt-renderer-live-boot-and-focus-qa.marker";
const PACKAGE_MARKER = "v6-hunt-owner-forensic-qa";
const REPAIR_PACKAGE_MARKER = "v6-hunt-forensic-ipc-gap-repair-qa";
const HANDSHAKE_PACKAGE_MARKER = "v6-hunt-renderer-ready-handshake-qa";
const BOOT_PACKAGE_MARKER = "v6-hunt-renderer-boot-chain-repair-qa";
const DELIVERY_PACKAGE_MARKER =
  "v6-hunt-post-handshake-delivery-and-gesture-qa";
const HEAD_DANCE_PACKAGE_MARKER = "v6-hunt-head-dance-repair-qa";
const VISUAL_FOCUS_PACKAGE_MARKER =
  "v6-hunt-visual-focus-and-play-gesture-qa";
const LIVE_BOOT_PACKAGE_MARKER = "v6-hunt-renderer-live-boot-and-focus-qa";
const CURSOR_POS_CHANNEL = "cursor-pos";
/** Raw send channel — never route through catcodeTrustedIpcMain. */
const HUNT_OWNER_FORENSIC_EVENT_CHANNEL = "hunt-owner-forensic-event";
const MAX_BYTES = 384 * 1024;

const ALLOWED_SOURCES = new Set([
  "startup",
  "sample",
  "gesture",
  "trigger",
  "pose",
  "frame",
  "host",
  "cancel",
  "gate",
  "status",
  "main-poll",
  "renderer",
  "cursor-pos",
  "handshake",
  "boot",
  "preload",
]);

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
  "clipboard",
  "password",
  "token",
  "path",
  "filepath",
  "pathname",
  "coord",
  "coords",
  "point",
  "mouse",
]);

const FORBIDDEN_KEY_PARTS = Object.freeze([
  "clipboard",
  "password",
  "token",
  "keycode",
  "windowtitle",
  "filepath",
  "pathname",
  "absolutepath",
]);

function isHuntOwnerForensicArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(HUNT_OWNER_FORENSIC_FLAG);
}

function markerExists(resourcesPath, fileName) {
  return (
    typeof resourcesPath === "string" &&
    resourcesPath.length > 0 &&
    fs.existsSync(path.join(resourcesPath, fileName))
  );
}

function isHuntOwnerForensicQaPackage(resourcesPath = process.resourcesPath) {
  return (
    markerExists(resourcesPath, QA_MARKER_FILE) ||
    markerExists(resourcesPath, REPAIR_QA_MARKER_FILE) ||
    markerExists(resourcesPath, HANDSHAKE_QA_MARKER_FILE) ||
    markerExists(resourcesPath, BOOT_QA_MARKER_FILE) ||
    markerExists(resourcesPath, DELIVERY_QA_MARKER_FILE) ||
    markerExists(resourcesPath, HEAD_DANCE_QA_MARKER_FILE) ||
    markerExists(resourcesPath, VISUAL_FOCUS_QA_MARKER_FILE) ||
    markerExists(resourcesPath, LIVE_BOOT_QA_MARKER_FILE)
  );
}

function resolveHuntOwnerForensicPackageMarker(
  resourcesPath = process.resourcesPath,
) {
  if (markerExists(resourcesPath, LIVE_BOOT_QA_MARKER_FILE)) {
    return LIVE_BOOT_PACKAGE_MARKER;
  }
  if (markerExists(resourcesPath, VISUAL_FOCUS_QA_MARKER_FILE)) {
    return VISUAL_FOCUS_PACKAGE_MARKER;
  }
  if (markerExists(resourcesPath, HEAD_DANCE_QA_MARKER_FILE)) {
    return HEAD_DANCE_PACKAGE_MARKER;
  }
  if (markerExists(resourcesPath, DELIVERY_QA_MARKER_FILE)) {
    return DELIVERY_PACKAGE_MARKER;
  }
  if (markerExists(resourcesPath, BOOT_QA_MARKER_FILE)) {
    return BOOT_PACKAGE_MARKER;
  }
  if (markerExists(resourcesPath, HANDSHAKE_QA_MARKER_FILE)) {
    return HANDSHAKE_PACKAGE_MARKER;
  }
  if (markerExists(resourcesPath, REPAIR_QA_MARKER_FILE)) {
    return REPAIR_PACKAGE_MARKER;
  }
  if (markerExists(resourcesPath, QA_MARKER_FILE)) {
    return PACKAGE_MARKER;
  }
  return PACKAGE_MARKER;
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isForbiddenKey(key) {
  const n = normalizeKey(key);
  if (FORBIDDEN_KEY_EXACT.has(n)) return true;
  // Allow skinId / hostId / frameKey — block bare "cursor*" coordinate fields only.
  if (n === "cursor" || n === "cursorx" || n === "cursory" || n === "cursorpos") return true;
  return FORBIDDEN_KEY_PARTS.some((part) => n.includes(part));
}

function sanitizeValue(value) {
  if (value == null) return value;
  const t = typeof value;
  if (t === "boolean") return value;
  if (t === "number") return Number.isFinite(value) ? value : null;
  if (t === "string") return value.slice(0, 64);
  return undefined;
}

function sanitizeRecord(input = {}) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (isForbiddenKey(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = {};
      for (const [nk, nv] of Object.entries(value)) {
        if (isForbiddenKey(nk)) continue;
        const safe = sanitizeValue(nv);
        if (safe !== undefined) nested[nk] = safe;
      }
      out[key] = nested;
      continue;
    }
    const safe = sanitizeValue(value);
    if (safe !== undefined) out[key] = safe;
  }
  return out;
}

function createHuntOwnerForensicController({
  enabled = false,
  userDataPath,
  packageMarker = PACKAGE_MARKER,
  qaMarkerPresent = false,
  now = Date.now,
  maxBytes = MAX_BYTES,
} = {}) {
  const active = !!enabled;
  let logPath = null;

  if (active && userDataPath) {
    try {
      const logsDir = path.join(userDataPath, "logs");
      fs.mkdirSync(logsDir, { recursive: true });
      logPath = path.join(logsDir, LOG_FILE_NAME);
      fs.writeFileSync(logPath, "", "utf8");
    } catch (_) {
      logPath = null;
    }
  }

  function record(source, payload = {}) {
    if (!active || !logPath) return false;
    const safeSource = ALLOWED_SOURCES.has(source) ? source : "status";
    const line =
      JSON.stringify({
        ts: now(),
        v: 1,
        prefix: "v6-hunt-owner-forensic",
        source: safeSource,
        ...sanitizeRecord(payload),
      }) + "\n";
    try {
      if (fs.existsSync(logPath) && fs.statSync(logPath).size >= maxBytes) {
        return false;
      }
      fs.appendFileSync(logPath, line, "utf8");
      return true;
    } catch (_) {
      return false;
    }
  }

  if (active) {
    record("startup", {
      enabled: true,
      packageMarker,
      qaMarkerPresent: !!qaMarkerPresent,
      modelExpected: "v6-idle-preview",
    });
  }

  return {
    enabled: active,
    getLogPath: () => logPath,
    packageMarker,
    record,
    sanitizeRecord,
  };
}

let current = null;

function initHuntOwnerForensic(options) {
  current = createHuntOwnerForensicController(options);
  return current;
}

function getHuntOwnerForensic() {
  return current;
}

module.exports = {
  HUNT_OWNER_FORENSIC_FLAG,
  LOG_FILE_NAME,
  QA_MARKER_FILE,
  REPAIR_QA_MARKER_FILE,
  HANDSHAKE_QA_MARKER_FILE,
  BOOT_QA_MARKER_FILE,
  DELIVERY_QA_MARKER_FILE,
  HEAD_DANCE_QA_MARKER_FILE,
  VISUAL_FOCUS_QA_MARKER_FILE,
  LIVE_BOOT_QA_MARKER_FILE,
  PACKAGE_MARKER,
  REPAIR_PACKAGE_MARKER,
  HANDSHAKE_PACKAGE_MARKER,
  BOOT_PACKAGE_MARKER,
  DELIVERY_PACKAGE_MARKER,
  HEAD_DANCE_PACKAGE_MARKER,
  VISUAL_FOCUS_PACKAGE_MARKER,
  LIVE_BOOT_PACKAGE_MARKER,
  CURSOR_POS_CHANNEL,
  HUNT_OWNER_FORENSIC_EVENT_CHANNEL,
  isHuntOwnerForensicArgEnabled,
  isHuntOwnerForensicQaPackage,
  resolveHuntOwnerForensicPackageMarker,
  sanitizeRecord,
  createHuntOwnerForensicController,
  initHuntOwnerForensic,
  getHuntOwnerForensic,
};
