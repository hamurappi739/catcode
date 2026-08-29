"use strict";

/**
 * G-D1: opt-in, privacy-safe V4 gaze diagnostics.
 * Active only with --catcode-gaze-diagnostics. Never logs raw cursor
 * coordinates, keys, titles, clipboard, or typed text.
 */

const fs = require("node:fs");
const path = require("node:path");

const GAZE_DIAGNOSTICS_FLAG = "--catcode-gaze-diagnostics";
const LOG_FILE_NAME = "v4-gaze-diagnostics.jsonl";
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_RATE_LIMIT_MS = 400;

/** Forbidden field names (normalized alphanumeric). */
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
]);
const FORBIDDEN_KEY_PARTS = Object.freeze([
  "keycode",
  "typedtext",
  "clipboard",
  "password",
  "token",
  "cursorhistory",
  "rawcursor",
  "screencoord",
  "windowtitle",
  "apptitle",
  "appname",
]);

const ALLOWED_DIRECTION_BUCKETS = Object.freeze([
  "C",
  "L",
  "R",
  "U",
  "D",
  "UL",
  "UR",
  "DL",
  "DR",
  "step",
  "unknown",
]);

const ALLOWED_SOURCES = Object.freeze([
  "cursor-ipc",
  "poll",
  "gaze-sync",
  "startup",
  "renderer",
]);

// Mirror V4 gaze mapping thresholds (keep aligned with v4-cursor-attention).
const DEAD_ZONE = 36;
const AXIS_THRESHOLD = 0.28;
const SATURATION_DIST = 280;
const NEAR_POLL_HYPOT = 300;
const MAX_DX = 2;
const MAX_DY_UP = 2;
const MAX_DY_DOWN = 1;
const DIAG_DX = 1;
const DIAG_DY = 1;

function isGazeDiagnosticsArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(GAZE_DIAGNOSTICS_FLAG);
}

function hypotDistanceBucket(hypot) {
  const h = Number(hypot);
  if (!Number.isFinite(h)) return "unknown";
  if (h < DEAD_ZONE) return "<36";
  if (h <= NEAR_POLL_HYPOT) return "36-300";
  return ">300";
}

/**
 * Map focus-relative offsets to the same nine direction buckets as V4 gaze.
 * Used only to derive a label — never write dx/dy to the log.
 */
function directionBucketFromFocusOffset(dx, dy) {
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "C";
  const dist = Math.hypot(x, y);
  if (dist < DEAD_ZONE) return "C";
  const intensity = Math.min(1, dist / SATURATION_DIST);
  const tx = (x / dist) * intensity;
  const ty = (y / dist) * intensity;
  if (Math.abs(tx) < AXIS_THRESHOLD && Math.abs(ty) < AXIS_THRESHOLD) {
    return "C";
  }
  const horiz = Math.abs(tx) >= AXIS_THRESHOLD;
  const vert = Math.abs(ty) >= AXIS_THRESHOLD;
  if (horiz && vert) {
    const left = tx < 0;
    const up = ty < 0;
    if (left && up) return "UL";
    if (!left && up) return "UR";
    if (left && !up) return "DL";
    return "DR";
  }
  if (horiz) return tx < 0 ? "L" : "R";
  return ty < 0 ? "U" : "D";
}

function directionBucketFromPupilOffset(ox, oy) {
  const ix = ox | 0;
  const iy = oy | 0;
  if (ix === 0 && iy === 0) return "C";
  if (ix === -MAX_DX && iy === 0) return "L";
  if (ix === MAX_DX && iy === 0) return "R";
  if (ix === 0 && iy === -MAX_DY_UP) return "U";
  if (ix === 0 && iy === MAX_DY_DOWN) return "D";
  if (ix === -DIAG_DX && iy === -DIAG_DY) return "UL";
  if (ix === DIAG_DX && iy === -DIAG_DY) return "UR";
  if (ix === -DIAG_DX && iy === DIAG_DY) return "DL";
  if (ix === DIAG_DX && iy === DIAG_DY) return "DR";
  return "step";
}

function normalizeDirectionBucket(value) {
  const s = String(value || "");
  const upper = s.toUpperCase();
  if (s === "step" || upper === "STEP") return "step";
  if (ALLOWED_DIRECTION_BUCKETS.includes(upper)) return upper;
  return "unknown";
}

function isForbiddenKey(key) {
  const k = String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!k) return true;
  if (FORBIDDEN_KEY_EXACT.has(k)) return true;
  for (const part of FORBIDDEN_KEY_PARTS) {
    if (k.includes(part)) return true;
  }
  // Catch common coordinate aliases without blocking ox/oy pupil snaps.
  if (
    k === "pagex" ||
    k === "pagey" ||
    k === "clientx" ||
    k === "clienty" ||
    k === "screenx" ||
    k === "screeny" ||
    k.endsWith("coordinate") ||
    k.endsWith("coordinates")
  ) {
    return true;
  }
  return false;
}

/**
 * Strip anything that could leak sensitive or coordinate data.
 */
function sanitizeGazeDiagnosticEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenKey(key)) continue;
    if (value == null) {
      out[key] = value;
      continue;
    }
    const t = typeof value;
    if (t === "boolean" || t === "number") {
      if (t === "number" && !Number.isFinite(value)) continue;
      // Reject large magnitudes that look like screen coords.
      if (t === "number" && Math.abs(value) > 64) continue;
      out[key] = value;
      continue;
    }
    if (t === "string") {
      out[key] = value.replace(/[\r\n\t]+/g, " ").slice(0, 80);
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value
        .filter((item) => typeof item === "string" || typeof item === "boolean")
        .map((item) =>
          typeof item === "string"
            ? item.replace(/[\r\n\t]+/g, " ").slice(0, 48)
            : item,
        )
        .slice(0, 24);
      continue;
    }
    if (t === "object") {
      const nested = {};
      for (const [nk, nv] of Object.entries(value)) {
        if (isForbiddenKey(nk)) continue;
        if (typeof nv === "boolean") nested[nk] = nv;
        else if (typeof nv === "string") {
          nested[nk] = nv.replace(/[\r\n\t]+/g, " ").slice(0, 48);
        } else if (
          typeof nv === "number" &&
          Number.isFinite(nv) &&
          Math.abs(nv) <= 64
        ) {
          nested[nk] = nv;
        }
      }
      out[key] = nested;
    }
  }
  if (out.direction != null) {
    out.direction = normalizeDirectionBucket(out.direction);
  }
  if (out.source != null) {
    const src = String(out.source);
    out.source = ALLOWED_SOURCES.includes(src) ? src : "renderer";
  }
  return out;
}

function rotateLogFile(filePath) {
  const rotated = `${filePath}.1`;
  try {
    fs.rmSync(rotated, { force: true });
  } catch {
    // ignore
  }
  try {
    fs.renameSync(filePath, rotated);
  } catch {
    // ignore
  }
}

function appendBoundedLogLine(filePath, line, maxBytes = DEFAULT_MAX_BYTES) {
  if (!filePath) return;
  const n = Number.isFinite(maxBytes) ? maxBytes : DEFAULT_MAX_BYTES;
  if (n <= 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const buf = Buffer.from(String(line));
  if (buf.length >= n) {
    rotateLogFile(filePath);
    fs.writeFileSync(filePath, buf.subarray(buf.length - n));
    return;
  }
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    size = 0;
  }
  if (size > 0 && size + buf.length > n) rotateLogFile(filePath);
  fs.appendFileSync(filePath, buf);
}

function createNoopController() {
  return {
    enabled: false,
    logPath: null,
    record() {},
    recordMainCursorPoll() {},
    recordRendererEvent() {},
    getLogPath() {
      return null;
    },
  };
}

/**
 * @param {object} options
 */
function createGazeDiagnosticsController(options = {}) {
  const enabled = !!options.enabled;
  if (!enabled) return createNoopController();

  const userDataPath = options.userDataPath;
  if (!userDataPath || typeof userDataPath !== "string") {
    return createNoopController();
  }

  const logPath = path.join(userDataPath, "logs", LOG_FILE_NAME);
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const rateLimitMs = options.rateLimitMs || DEFAULT_RATE_LIMIT_MS;
  const now =
    typeof options.now === "function" ? options.now : () => Date.now();
  const getHelperHealth =
    typeof options.getHelperHealth === "function"
      ? options.getHelperHealth
      : () => ({});

  /** @type {Map<string, number>} */
  const lastByFingerprint = new Map();
  let headerWritten = false;

  function writeLine(obj) {
    try {
      if (!headerWritten) {
        headerWritten = true;
        const header = sanitizeGazeDiagnosticEvent({
          type: "startup",
          source: "startup",
          diagnosticsEnabled: true,
          version: String(options.version || ""),
          platform: String(options.platform || process.platform || ""),
          helpers: getHelperHealth() || {},
        });
        header.ts = new Date(now()).toISOString();
        appendBoundedLogLine(logPath, `${JSON.stringify(header)}\n`, maxBytes);
      }
      const safe = sanitizeGazeDiagnosticEvent(obj);
      if (!safe) return;
      safe.ts = new Date(now()).toISOString();
      appendBoundedLogLine(logPath, `${JSON.stringify(safe)}\n`, maxBytes);
    } catch {
      // Diagnostics must never throw into the app.
    }
  }

  function shouldRateLimit(fingerprint, force) {
    if (force) return false;
    const t = now();
    const prev = lastByFingerprint.get(fingerprint) || 0;
    if (t - prev < rateLimitMs) return true;
    lastByFingerprint.set(fingerprint, t);
    if (lastByFingerprint.size > 200) {
      const first = lastByFingerprint.keys().next().value;
      lastByFingerprint.delete(first);
    }
    return false;
  }

  function record(event, { force = false } = {}) {
    try {
      if (!event || typeof event !== "object") return;
      const type = String(event.type || "event");
      const source = String(event.source || "renderer");
      const direction =
        event.direction != null
          ? normalizeDirectionBucket(event.direction)
          : "";
      const fingerprint = [
        type,
        source,
        direction,
        event.eligible === true ? "1" : event.eligible === false ? "0" : "",
        Array.isArray(event.blockingReasons)
          ? event.blockingReasons.join(",")
          : "",
        event.transformAction || "",
        event.moversReady === true
          ? "m1"
          : event.moversReady === false
            ? "m0"
            : "",
        event.payloadReceived === true
          ? "p1"
          : event.payloadReceived === false
            ? "p0"
            : "",
        event.hypotBucket || "",
        event.petVisible === true
          ? "v1"
          : event.petVisible === false
            ? "v0"
            : "",
      ].join("|");
      if (shouldRateLimit(fingerprint, force)) return;
      writeLine({
        ...event,
        type,
        source,
        direction: direction || undefined,
      });
    } catch {
      // ignore
    }
  }

  function recordMainCursorPoll({ sent, petVisible, hypot, dx, dy } = {}) {
    try {
      const direction = directionBucketFromFocusOffset(dx, dy);
      const hypotBucket = hypotDistanceBucket(hypot);
      record(
        {
          type: sent ? "cursor-payload" : "cursor-poll",
          source: sent ? "cursor-ipc" : "poll",
          payloadReceived: !!sent,
          direction,
          hypotBucket,
          petVisible: petVisible !== false,
          helpers: getHelperHealth() || {},
        },
        { force: !!sent },
      );
    } catch {
      // ignore
    }
  }

  function recordRendererEvent(payload) {
    try {
      record(
        {
          ...(payload && typeof payload === "object" ? payload : {}),
          source: payload && payload.source ? payload.source : "gaze-sync",
        },
        {
          force: !!(
            payload &&
            (payload.type === "eligibility" ||
              payload.type === "transform" ||
              payload.type === "movers")
          ),
        },
      );
    } catch {
      // ignore
    }
  }

  return {
    enabled: true,
    logPath,
    record,
    recordMainCursorPoll,
    recordRendererEvent,
    getLogPath() {
      return logPath;
    },
  };
}

let activeController = createNoopController();

function initGazeDiagnostics(options) {
  try {
    activeController = createGazeDiagnosticsController(options);
  } catch {
    activeController = createNoopController();
  }
  return activeController;
}

function getGazeDiagnostics() {
  return activeController || createNoopController();
}

function resetGazeDiagnosticsForTests() {
  activeController = createNoopController();
}

module.exports = {
  GAZE_DIAGNOSTICS_FLAG,
  LOG_FILE_NAME,
  DEAD_ZONE,
  SATURATION_DIST,
  isGazeDiagnosticsArgEnabled,
  hypotDistanceBucket,
  directionBucketFromFocusOffset,
  directionBucketFromPupilOffset,
  normalizeDirectionBucket,
  sanitizeGazeDiagnosticEvent,
  createGazeDiagnosticsController,
  initGazeDiagnostics,
  getGazeDiagnostics,
  resetGazeDiagnosticsForTests,
  appendBoundedLogLine,
};
