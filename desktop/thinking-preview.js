"use strict";

/**
 * QA-only thinking overlay preview.
 * Active only with --catcode-preview-thinking.
 * Forces the normal ai-task-state → data-thinking path (no settings UI).
 */

const THINKING_PREVIEW_FLAG = "--catcode-preview-thinking";
const THINKING_PREVIEW_AGENT_ID = "preview";
const THINKING_PREVIEW_SESSION_ID = "preview";

function isThinkingPreviewArgEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(THINKING_PREVIEW_FLAG);
}

/**
 * Payload identical to a real agent thinking emit (applyAiTaskState path).
 */
function thinkingPreviewAiTaskStatePayload() {
  return {
    agentId: THINKING_PREVIEW_AGENT_ID,
    sessionId: THINKING_PREVIEW_SESSION_ID,
    event: "catcode-preview-thinking",
    state: "thinking",
  };
}

/**
 * Send preview thinking through the same IPC channel as Cursor/Codex.
 * No-op when disabled or pet window missing.
 */
function applyThinkingPreviewIfEnabled({
  enabled,
  getPetWindow,
  send,
  logInfo,
} = {}) {
  if (!enabled) return false;
  const win = typeof getPetWindow === "function" ? getPetWindow() : null;
  if (!win || win.isDestroyed()) return false;
  const payload = thinkingPreviewAiTaskStatePayload();
  if (typeof send === "function") {
    send("ai-task-state", payload);
  } else if (win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send("ai-task-state", payload);
  } else {
    return false;
  }
  if (typeof logInfo === "function") {
    logInfo("[CatCode] thinking preview armed via --catcode-preview-thinking");
  }
  return true;
}

module.exports = {
  THINKING_PREVIEW_FLAG,
  THINKING_PREVIEW_AGENT_ID,
  THINKING_PREVIEW_SESSION_ID,
  isThinkingPreviewArgEnabled,
  thinkingPreviewAiTaskStatePayload,
  applyThinkingPreviewIfEnabled,
};
