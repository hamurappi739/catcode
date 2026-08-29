"use strict";

/**
 * V6-M7: scroll/paper reaction controller.
 * Subscribes to electronAPI.onMouseWheel; owns one release timer only.
 * Pose pixels are written exclusively via CatCodeV6VisualPose.
 */

const ACTIVITY_HOLD_MS = 420;
const ACTION_LOOP = Object.freeze(["f1", "f2", "f3"]);

function isDraggingBody(body) {
  try {
    return !!(body && body.classList && body.classList.contains("dragging"));
  } catch (_) {
    return false;
  }
}

function wireV6Scroll({
  win = window,
  electronAPI = win && win.electronAPI,
  document: doc = win && win.document,
  now = Date.now,
  activityHoldMs = ACTIVITY_HOLD_MS,
} = {}) {
  let releaseTimer = null;
  let actionIndex = 0;
  let inSession = false;
  let recovering = false;

  function clearReleaseTimer() {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = null;
  }

  function bodyEl() {
    return doc && doc.body ? doc.body : null;
  }

  function shouldDeferToHigherPriority(poseApi) {
    if (!poseApi || typeof poseApi.getPose !== "function") return true;
    if (isDraggingBody(bodyEl())) return true;
    const pose = poseApi.getPose();
    // Sleep / purr win; existing product wake paths may clear sleep separately.
    if (
      pose === "sleep" ||
      pose === "sleep-settle" ||
      pose === "sleep-peek" ||
      pose === "purr"
    ) {
      return true;
    }
    // Active typing wins while keys continue.
    if (pose === "typing") return true;
    // Celebrate is a bounded one-shot — do not cut for a wheel tick.
    if (pose === "celebrate") return true;
    if (pose === "hunt" || pose === "walk") return true;
    return false;
  }

  function finishToIdle() {
    recovering = false;
    inSession = false;
    actionIndex = 0;
    clearReleaseTimer();
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.leaveScroll) pose.leaveScroll("scroll-idle");
  }

  function beginRecovery() {
    releaseTimer = null;
    const pose = win && win.CatCodeV6VisualPose;
    if (!pose || !pose.enterScroll || !pose.leaveScroll) {
      finishToIdle();
      return;
    }
    if (shouldDeferToHigherPriority(pose) && pose.getPose() !== "scroll") {
      finishToIdle();
      return;
    }
    recovering = true;
    // Recovery frame once, then idle via pose timer/epoch-safe leave.
    const ok = pose.enterScroll("f4", { phase: "recovery" });
    if (!ok) {
      finishToIdle();
      return;
    }
    // Pose owner schedules recovery duration when phase=recovery; controller
    // also arms a bounded fallback leave so one timer owner remains clear.
    const recoveryMs =
      (pose.SCROLL_RECOVERY_MS != null && pose.SCROLL_RECOVERY_MS) || 240;
    clearReleaseTimer();
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      finishToIdle();
    }, recoveryMs + 16);
  }

  function armHold() {
    clearReleaseTimer();
    releaseTimer = setTimeout(() => {
      beginRecovery();
    }, activityHoldMs);
  }

  function handleMouseWheel(payload) {
    // Privacy: accept only rotation sign; never log payload.
    const rotation =
      payload && typeof payload.rotation === "number" ? payload.rotation : 0;
    if (rotation !== -1 && rotation !== 1) return;

    const pose = win && win.CatCodeV6VisualPose;
    if (!pose || !pose.isLatched || !pose.isLatched() || !pose.enterScroll) {
      return;
    }
    if (shouldDeferToHigherPriority(pose)) return;
    if (recovering && pose.getPose() === "scroll") {
      // New wheel during recovery restarts action (extend session).
      recovering = false;
    }

    let frameKey;
    const alreadyScroll = pose.getPose() === "scroll";
    if (!inSession || !alreadyScroll) {
      inSession = true;
      actionIndex = 0;
      frameKey = "f0";
    } else {
      frameKey = ACTION_LOOP[actionIndex % ACTION_LOOP.length];
      actionIndex += 1;
    }

    const ok = pose.enterScroll(frameKey, { phase: "action" });
    if (!ok) {
      inSession = false;
      return;
    }
    armHold();
  }

  function cancel(reason) {
    recovering = false;
    inSession = false;
    actionIndex = 0;
    clearReleaseTimer();
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.leaveScroll && pose.getPose && pose.getPose() === "scroll") {
      pose.leaveScroll(reason || "scroll-cancel");
    }
  }

  if (electronAPI && typeof electronAPI.onMouseWheel === "function") {
    electronAPI.onMouseWheel(handleMouseWheel);
  }

  // Drag cancel: observe class changes on body when available.
  try {
    const body = bodyEl();
    if (body && typeof MutationObserver === "function") {
      const obs = new MutationObserver(() => {
        if (isDraggingBody(body)) cancel("drag");
      });
      obs.observe(body, { attributes: true, attributeFilter: ["class"] });
    }
  } catch (_) {}

  return {
    handleMouseWheel,
    cancel,
    ACTIVITY_HOLD_MS: activityHoldMs,
    ACTION_LOOP,
  };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6Scroll = wireV6Scroll();
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    ACTIVITY_HOLD_MS,
    ACTION_LOOP,
    wireV6Scroll,
  };
}
