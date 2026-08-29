"use strict";

/**
 * Codex-M1 — tail-safe live monitor for ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 *
 * First discovery seeks to EOF (never parses historical multi-GB content).
 * Subsequent polls read at most READ_CHUNK_BYTES per read, decode UTF-8 safely
 * via StringDecoder, and commit offset only after a successful chunk.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { StringDecoder } = require("string_decoder");

const MAX_TRACKED_FILES = 50;
const MAX_PARTIAL_CHARS = 65536;
const MAX_SESSION_DAY_DIRS = 14;
const FRESH_MTIME_MS = 120000;
const WORKING_EMIT_DEDUP_MS = 8000;
/** Hard cap per read — never allocate/decode larger than this in one shot. */
const READ_CHUNK_BYTES = 256 * 1024;
/** Max chunks processed per file per poll (backlog drain without blocking forever). */
const MAX_CHUNKS_PER_POLL = 8;

function defaultBaseDir() {
  return path.join(os.homedir(), ".codex", "sessions");
}

class CodexLogMonitor {
  /**
   * @param {(event: object) => void} onStateChange
   * @param {{ fs?: typeof fs, baseDir?: string, now?: () => number }} [options]
   */
  constructor(onStateChange, options = {}) {
    this._onStateChange = onStateChange;
    this._fs = options.fs || fs;
    this._baseDir =
      typeof options.baseDir === "string" ? options.baseDir : defaultBaseDir();
    this._now = typeof options.now === "function" ? options.now : Date.now;
    this._interval = null;
    this._tracked = new Map();
    this._startedAtMs = this._now();
    this._lastErrorAt = 0;
  }

  start() {
    if (this._interval) return;
    this._startedAtMs = this._now();
    try {
      this._poll();
    } catch (err) {
      this._noteError("poll", err);
    }
    this._interval = setInterval(() => {
      try {
        this._poll();
      } catch (err) {
        this._noteError("poll", err);
      }
    }, 1500);
    // Allow Node test processes to exit if a caller forgets stop().
    if (typeof this._interval.unref === "function") this._interval.unref();
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._tracked.clear();
  }

  _noteError(where, err) {
    const now = this._now();
    // Rate-limit noisy failures (at most once / 30s).
    if (now - this._lastErrorAt < 30000) return;
    this._lastErrorAt = now;
    const message = err && err.message ? err.message : String(err);
    console.warn(`[CatCode] codex monitor ${where}: ${message}`);
  }

  _poll() {
    const now = this._now();
    const candidates = new Set(this._tracked.keys());
    for (const dir of this._getSessionDirs()) {
      let names;
      try {
        names = this._fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (!name.startsWith("rollout-") || !name.endsWith(".jsonl")) continue;
        candidates.add(path.join(dir, name));
      }
    }
    for (const filePath of candidates) {
      if (!this._tracked.has(filePath)) {
        try {
          if (now - this._fs.statSync(filePath).mtimeMs > FRESH_MTIME_MS) {
            continue;
          }
        } catch {
          continue;
        }
      }
      try {
        this._pollFile(filePath, path.basename(filePath));
      } catch (err) {
        this._noteError("file", err);
      }
    }
    this._cleanStaleFiles();
  }

  _getSessionDirs() {
    const out = [];
    let years;
    try {
      years = this._fs.readdirSync(this._baseDir);
    } catch {
      return [];
    }
    for (const year of years) {
      if (!/^\d{4}$/.test(year)) continue;
      const yearPath = path.join(this._baseDir, year);
      let months;
      try {
        months = this._fs.readdirSync(yearPath);
      } catch {
        continue;
      }
      for (const month of months) {
        if (!/^\d{2}$/.test(month)) continue;
        const monthPath = path.join(yearPath, month);
        let days;
        try {
          days = this._fs.readdirSync(monthPath);
        } catch {
          continue;
        }
        for (const day of days) {
          if (!/^\d{2}$/.test(day)) continue;
          out.push({
            key: year + month + day,
            path: path.join(monthPath, day),
          });
        }
      }
    }
    out.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
    return out.slice(0, MAX_SESSION_DAY_DIRS).map((e) => e.path);
  }

  _pollFile(filePath, baseName) {
    let stat;
    try {
      stat = this._fs.statSync(filePath);
    } catch {
      return;
    }

    let state = this._tracked.get(filePath);
    if (!state) {
      const sessionId = this._extractSessionId(baseName);
      if (!sessionId) return;
      if (this._tracked.size >= MAX_TRACKED_FILES) this._cleanStaleFiles(true);
      // Codex-M1: attach at EOF — never parse historical multi-GB content.
      state = {
        offset: stat.size,
        partial: "",
        decoder: new StringDecoder("utf8"),
        sessionId: `codex:${sessionId}`,
        cwd: "",
        lastEventTime: this._now(),
        lastState: null,
        lastEmitAt: 0,
        lastNotificationEvent: "",
        activeTurn: false,
        hadToolUse: false,
        hadAgentMessage: false,
        approvalPolicy: "",
      };
      this._tracked.set(filePath, state);
      return;
    }

    // Truncation / rewrite: re-tail.
    if (stat.size < state.offset) {
      state.offset = stat.size;
      state.partial = "";
      state.decoder = new StringDecoder("utf8");
      return;
    }
    if (stat.size === state.offset) return;

    let chunks = 0;
    while (stat.size > state.offset && chunks < MAX_CHUNKS_PER_POLL) {
      const toRead = Math.min(READ_CHUNK_BYTES, stat.size - state.offset);
      let buffer;
      try {
        buffer = Buffer.alloc(toRead);
        const fd = this._fs.openSync(filePath, "r");
        try {
          const bytesRead = this._fs.readSync(
            fd,
            buffer,
            0,
            toRead,
            state.offset,
          );
          if (bytesRead <= 0) return;
          if (bytesRead < toRead) buffer = buffer.subarray(0, bytesRead);
        } finally {
          this._fs.closeSync(fd);
        }
      } catch (err) {
        this._noteError("read", err);
        return;
      }

      let text;
      try {
        if (!state.decoder) state.decoder = new StringDecoder("utf8");
        text = state.decoder.write(buffer);
      } catch (err) {
        this._noteError("decode", err);
        return;
      }

      // Commit offset only after successful read + decode.
      state.offset += buffer.length;
      state.lastEventTime = this._now();
      chunks += 1;

      const combined = state.partial + text;
      const lines = combined.split("\n");
      const incomplete = lines.pop() || "";
      state.partial =
        incomplete.length > MAX_PARTIAL_CHARS ? "" : incomplete;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this._processLine(line, state);
        } catch (err) {
          this._noteError("parse", err);
        }
      }

      // Refresh size in case the file grew while we drained.
      try {
        stat = this._fs.statSync(filePath);
      } catch {
        return;
      }
      if (stat.size < state.offset) {
        state.offset = stat.size;
        state.partial = "";
        state.decoder = new StringDecoder("utf8");
        return;
      }
    }
  }

  _processLine(line, state) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      // Malformed JSONL must not stop later valid events.
      return;
    }
    if (typeof event.timestamp === "string") {
      const ts = Date.parse(event.timestamp);
      if (Number.isFinite(ts) && ts < this._startedAtMs - 1500) return;
    }
    const type = event.type;
    const payload = event.payload;
    const payloadType =
      (payload && typeof payload === "object" && payload.type) || "";
    const key = payloadType ? `${type}:${payloadType}` : type;
    const toolName =
      (payload && typeof payload === "object" && payload.name) || "";

    if (type === "session_meta" && payload) {
      state.cwd = payload.cwd || "";
      if (typeof payload.approval_policy === "string") {
        state.approvalPolicy = payload.approval_policy;
      }
      return;
    }
    if (type === "turn_context" && payload) {
      if (typeof payload.cwd === "string" && payload.cwd) state.cwd = payload.cwd;
      if (typeof payload.approval_policy === "string") {
        state.approvalPolicy = payload.approval_policy;
      }
      return;
    }

    if (key === "event_msg:task_started" || key === "event_msg:user_message") {
      state.activeTurn = true;
      state.hadToolUse = false;
      state.hadAgentMessage = false;
      this._emit(state, "thinking", key);
      return;
    }

    // Mid-turn reasoning (verified on live rollouts).
    if (
      key === "event_msg:agent_reasoning" ||
      key === "response_item:reasoning"
    ) {
      state.activeTurn = true;
      this._emit(state, "thinking", key);
      return;
    }

    if (key === "event_msg:agent_message" || key === "response_item:message") {
      state.hadAgentMessage = true;
      return;
    }

    if (this._isUserInterventionRequest(event, state)) {
      const id = payload && (payload.id || payload.call_id);
      this._emitNotification(state, id ? `${key}:${id}` : key);
      return;
    }

    if (
      key === "response_item:function_call" ||
      key === "response_item:custom_tool_call" ||
      key === "response_item:web_search_call"
    ) {
      state.hadToolUse = true;
      this._emit(state, "working", key);
      return;
    }

    if (
      key === "event_msg:exec_command_end" ||
      key === "event_msg:patch_apply_end" ||
      key === "event_msg:custom_tool_call_output"
    ) {
      this._emit(state, "working", key);
      return;
    }

    if (key === "event_msg:task_complete") {
      if (!state.activeTurn) return;
      this._emit(
        state,
        state.hadToolUse || state.hadAgentMessage ? "complete" : "idle",
        key,
      );
      state.activeTurn = false;
      state.hadToolUse = false;
      state.hadAgentMessage = false;
      return;
    }

    if (key === "event_msg:turn_aborted") {
      state.activeTurn = false;
      this._emit(state, "idle", key);
    }

    // toolName kept only for intervention matching above — never logged as content.
    void toolName;
  }

  _isUserInterventionRequest(event, state) {
    const payload = event && event.payload;
    if (!payload || typeof payload !== "object" || payload.type !== "function_call") {
      return false;
    }
    if (
      payload.name === "request_user_input" ||
      payload.name === "request_plugin_install"
    ) {
      return true;
    }
    if (payload.name === "exec_command" || payload.name === "shell_command") {
      let args = {};
      try {
        args = JSON.parse(payload.arguments || "{}");
      } catch {
        args = {};
      }
      if (!args || args.sandbox_permissions !== "require_escalated") return false;
      const policy = String((state && state.approvalPolicy) || "");
      return !(policy === "never" || policy === "on-failure");
    }
    return false;
  }

  _emitNotification(state, eventKey) {
    const now = this._now();
    if (
      state.lastNotificationEvent === eventKey &&
      now - state.lastEventTime < 5000
    ) {
      return;
    }
    state.lastNotificationEvent = eventKey;
    this._emit(state, "notification", eventKey);
  }

  _emit(state, nextState, eventKey) {
    const now = this._now();
    if (
      nextState === state.lastState &&
      nextState === "working" &&
      now - (state.lastEmitAt || 0) < WORKING_EMIT_DEDUP_MS
    ) {
      return;
    }
    state.lastState = nextState;
    state.lastEmitAt = now;
    state.lastEventTime = now;
    this._onStateChange({
      agentId: "codex",
      sessionId: state.sessionId,
      state: nextState,
      event: eventKey,
      cwd: state.cwd,
    });
  }

  _extractSessionId(fileName) {
    const parts = fileName.replace(".jsonl", "").split("-");
    return parts.length >= 10 ? parts.slice(-5).join("-") : null;
  }

  _cleanStaleFiles(force = false) {
    const now = this._now();
    for (const [filePath, state] of this._tracked) {
      if ((force || now - state.lastEventTime > 300000) && this._tracked.delete(filePath)) {
        /* deleted */
      }
      if (!force && this._tracked.size <= MAX_TRACKED_FILES) break;
    }
  }
}

module.exports = CodexLogMonitor;
module.exports.CodexLogMonitor = CodexLogMonitor;
module.exports.READ_CHUNK_BYTES = READ_CHUNK_BYTES;
module.exports.MAX_CHUNKS_PER_POLL = MAX_CHUNKS_PER_POLL;
module.exports.FRESH_MTIME_MS = FRESH_MTIME_MS;
