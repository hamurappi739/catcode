"use strict";

// Optional V4 cursor-hunt controller.
// Visual hunt assets are not ready: the setting persists, but activation is
// blocked by V4_HUNT_READY. Never moves, captures, or redirects the OS cursor.

const V4_HUNT_READY = false;

const BLOCKED_STATES = Object.freeze([
  "sleep",
  "purr",
  "drag",
  "music",
  "typing",
  "peek",
  "wellness",
]);

function createV4HuntController({
  getEnabled,
  setEnabled,
  isFullscreenHidden,
  getPetState,
  onCancel,
}) {
  let active = false;
  let timer = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function cancel(reason) {
    const wasActive = active;
    active = false;
    clearTimer();
    if (wasActive && typeof onCancel === "function") onCancel(reason || "cancel");
    return { ok: true, active: false, reason: reason || "cancel" };
  }

  function canStart() {
    if (!V4_HUNT_READY) return false;
    if (!getEnabled()) return false;
    if (typeof isFullscreenHidden === "function" && isFullscreenHidden()) {
      return false;
    }
    const state =
      typeof getPetState === "function" ? getPetState() || "idle" : "idle";
    if (state !== "idle") return false;
    if (BLOCKED_STATES.includes(state)) return false;
    return true;
  }

  function tryStart() {
    if (!canStart() || active) {
      return {
        ok: false,
        active: false,
        ready: V4_HUNT_READY,
        reason: V4_HUNT_READY ? "blocked" : "not-ready",
      };
    }
    // Ready path reserved for a future dedicated V4 hunt pose.
    return { ok: false, active: false, ready: false, reason: "not-ready" };
  }

  function setHuntEnabled(next) {
    const enabled = !!next && V4_HUNT_READY;
    setEnabled(enabled);
    if (!enabled) cancel("disabled");
    return {
      enabled,
      ready: V4_HUNT_READY,
      requested: !!next,
    };
  }

  return {
    V4_HUNT_READY,
    BLOCKED_STATES,
    canStart,
    tryStart,
    cancel,
    setHuntEnabled,
    isActive: () => active,
  };
}

module.exports = {
  V4_HUNT_READY,
  BLOCKED_STATES,
  createV4HuntController,
};
