"use strict";

/**
 * Opt-in agent activity diagnostics.
 * Active only with --catcode-agent-diagnostics.
 * Logs state transitions only — never prompts, replies, code, keys, or file bodies.
 */

const fs = require("node:fs");
const path = require("node:path");

const AGENT_DIAGNOSTICS_FLAG = "--catcode-agent-diagnostics";
const LOG_FILE_NAME = "v4-agent-diagnostics.jsonl";
const DEFAULT_MAX_BYTES = 512 * 1024;

const ALLOWED_STATES = new Set([
  "thinking",
  "working",
  "complete",
  "idle",
  "error",
  "notification",
]);

function isAgentDiagnosticsArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(AGENT_DIAGNOSTICS_FLAG);
}

function sanitizeAgentId(value) {
  const s = String(value || "").slice(0, 64);
  return /^[a-z0-9._-]+$/i.test(s) ? s : "unknown";
}

function sanitizeSessionId(value) {
  const s = String(value || "").slice(0, 128);
  // Allow opaque ids (uuid / codex:uuid) without free text.
  return /^[a-z0-9:._-]+$/i.test(s) ? s : "redacted";
}

function sanitizeEventCategory(value) {
  const s = String(value || "").slice(0, 96);
  // Event keys look like event_msg:task_started — never free-form content.
  return /^[a-z0-9:._-]+$/i.test(s) ? s : "unknown";
}

function sanitizeState(value) {
  const s = String(value || "");
  return ALLOWED_STATES.has(s) ? s : "unknown";
}

/**
 * Strip any accidental sensitive fields from a diagnostic record.
 */
function sanitizeAgentDiagnosticEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ts: typeof raw.ts === "string" ? raw.ts : new Date().toISOString(),
    agentId: sanitizeAgentId(raw.agentId),
    eventCategory: sanitizeEventCategory(raw.eventCategory || raw.event),
    state: sanitizeState(raw.state),
    sessionId: sanitizeSessionId(raw.sessionId),
  };
}

function createAgentDiagnosticsController({
  enabled,
  userDataPath,
  maxBytes = DEFAULT_MAX_BYTES,
  now = () => Date.now(),
} = {}) {
  if (!enabled) {
    return {
      enabled: false,
      logPath: null,
      record() {},
      getLogPath() {
        return null;
      },
    };
  }

  const logsDir = path.join(String(userDataPath || ""), "logs");
  const logPath = path.join(logsDir, LOG_FILE_NAME);
  let bytesWritten = 0;

  try {
    fs.mkdirSync(logsDir, { recursive: true });
    if (fs.existsSync(logPath)) {
      bytesWritten = fs.statSync(logPath).size;
    } else {
      const header = JSON.stringify({
        ts: new Date(now()).toISOString(),
        type: "startup",
        agentId: "catcode",
        eventCategory: "diagnostics-start",
        state: "idle",
        sessionId: "diagnostics",
      });
      fs.writeFileSync(logPath, `${header}\n`, "utf8");
      bytesWritten = Buffer.byteLength(`${header}\n`, "utf8");
    }
  } catch {
    return {
      enabled: false,
      logPath: null,
      record() {},
      getLogPath() {
        return null;
      },
    };
  }

  function rotateIfNeeded(nextBytes) {
    if (bytesWritten + nextBytes <= maxBytes) return;
    try {
      const rotated = `${logPath}.1`;
      if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
      if (fs.existsSync(logPath)) fs.renameSync(logPath, rotated);
      bytesWritten = 0;
    } catch {
      /* ignore rotate failures */
    }
  }

  function record(raw) {
    const event = sanitizeAgentDiagnosticEvent({
      ...raw,
      ts: new Date(now()).toISOString(),
    });
    if (!event) return;
    const line = `${JSON.stringify(event)}\n`;
    const size = Buffer.byteLength(line, "utf8");
    try {
      rotateIfNeeded(size);
      fs.appendFileSync(logPath, line, "utf8");
      bytesWritten += size;
    } catch {
      /* swallow — diagnostics must never break monitoring */
    }
  }

  return {
    enabled: true,
    logPath,
    record,
    getLogPath() {
      return logPath;
    },
  };
}

let activeController = createAgentDiagnosticsController({ enabled: false });

function initAgentDiagnostics(options) {
  activeController = createAgentDiagnosticsController(options);
  return activeController;
}

function getAgentDiagnostics() {
  return activeController;
}

module.exports = {
  AGENT_DIAGNOSTICS_FLAG,
  LOG_FILE_NAME,
  isAgentDiagnosticsArgEnabled,
  sanitizeAgentDiagnosticEvent,
  createAgentDiagnosticsController,
  initAgentDiagnostics,
  getAgentDiagnostics,
};
