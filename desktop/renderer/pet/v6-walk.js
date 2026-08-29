"use strict";

/**
 * V6-M9: side-walk visual controller.
 * Main owns window motion via pet-playful-movement; this owns exclusive V6 frames.
 */

const FRAME_KEYS = Object.freeze(["f0", "f1", "f2", "f3", "f4"]);
const FRAME_DURATION_MS = 200;

function isDraggingBody(body) {
  try {
    return !!(body && body.classList && body.classList.contains("dragging"));
  } catch (_) {
    return false;
  }
}

function wireV6Walk({
  win = window,
  electronAPI = win && win.electronAPI,
  document: doc = win && win.document,
  frameDurationMs = FRAME_DURATION_MS,
} = {}) {
  let running = false;
  let direction = "right";
  let frameIndex = 0;
  let frameTimer = null;
  let frameToken = 0;

  function bodyEl() {
    return doc && doc.body ? doc.body : null;
  }

  function clearFrameTimer() {
    if (frameTimer) clearTimeout(frameTimer);
    frameTimer = null;
  }

  function requestMainCancel() {
    try {
      if (electronAPI && typeof electronAPI.cancelPetPlayfulMovement === "function") {
        electronAPI.cancelPetPlayfulMovement();
      }
    } catch (_) {}
  }

  function exclusiveBlocked(poseApi) {
    if (!poseApi || typeof poseApi.getPose !== "function") return true;
    if (isDraggingBody(bodyEl())) return true;
    const pose = poseApi.getPose();
    if (pose !== "idle" && pose !== "walk") return true;
    const body = bodyEl();
    if (!body || !body.dataset) return true;
    const d = body.dataset;
    if (
      d.musicActive === "1" ||
      d.musicDance === "1" ||
      d.v4DanceActive === "1" ||
      d.petPeek ||
      d.reminderPanel === "1" ||
      d.reminderForm === "1" ||
      d.reminderJump === "1" ||
      d.cursorStolen === "1" ||
      d.press ||
      d.scroll ||
      d.jump ||
      d.hunting === "1" ||
      d.sharing === "1" ||
      d.stretching === "1" ||
      d.drinking === "1" ||
      d.purring === "1"
    ) {
      return true;
    }
    return false;
  }

  function stopVisual(reason) {
    clearFrameTimer();
    running = false;
    frameToken += 1;
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.leaveWalk && pose.getPose && pose.getPose() === "walk") {
      pose.leaveWalk(reason || "walk-stop");
    }
    const body = bodyEl();
    if (body && body.dataset && body.dataset.petRoaming) {
      delete body.dataset.petRoaming;
      delete body.dataset.petRoamingDirection;
      delete body.dataset.petMotionPhase;
    }
  }

  function advanceFrame() {
    const pose = win && win.CatCodeV6VisualPose;
    if (!running || !pose || !pose.enterWalk) return;
    if (exclusiveBlocked(pose) && pose.getPose() !== "walk") {
      stopVisual("blocked");
      requestMainCancel();
      return;
    }
    if (pose.isReducedMotion && pose.isReducedMotion()) {
      stopVisual("reduced-motion");
      requestMainCancel();
      return;
    }
    frameIndex = (frameIndex + 1) % FRAME_KEYS.length;
    const ok = pose.enterWalk(direction, FRAME_KEYS[frameIndex]);
    if (!ok) {
      stopVisual("enter-failed");
      requestMainCancel();
      return;
    }
    const token = frameToken;
    clearFrameTimer();
    frameTimer = setTimeout(() => {
      frameTimer = null;
      if (!running || token !== frameToken) return;
      advanceFrame();
    }, frameDurationMs);
  }

  function startVisual(nextDirection) {
    const pose = win && win.CatCodeV6VisualPose;
    if (!pose || !pose.isLatched || !pose.isLatched() || !pose.enterWalk) {
      requestMainCancel();
      return false;
    }
    if (pose.isReducedMotion && pose.isReducedMotion()) {
      requestMainCancel();
      return false;
    }
    if (exclusiveBlocked(pose)) {
      requestMainCancel();
      return false;
    }
    direction = nextDirection === "left" ? "left" : "right";
    frameIndex = 0;
    running = true;
    frameToken += 1;
    const ok = pose.enterWalk(direction, FRAME_KEYS[0]);
    if (!ok) {
      running = false;
      requestMainCancel();
      return false;
    }
    const body = bodyEl();
    if (body && body.dataset) {
      body.dataset.petRoaming = "walk";
      body.dataset.petRoamingDirection = direction;
      body.dataset.petMotionPhase = "moving";
    }
    const token = frameToken;
    clearFrameTimer();
    frameTimer = setTimeout(() => {
      frameTimer = null;
      if (!running || token !== frameToken) return;
      advanceFrame();
    }, frameDurationMs);
    return true;
  }

  function handlePlayful(state) {
    if (!state || !state.active) {
      stopVisual("ipc-idle");
      return;
    }
    if (state.mode && state.mode !== "walk") {
      // Cursor theft / jump are not V6 walk visuals.
      stopVisual("non-walk-mode");
      return;
    }
    if (running && state.direction && state.direction !== direction) {
      direction = state.direction === "left" ? "left" : "right";
      const pose = win && win.CatCodeV6VisualPose;
      if (pose && pose.enterWalk) {
        pose.enterWalk(direction, FRAME_KEYS[frameIndex] || "f0");
      }
      return;
    }
    if (!running) startVisual(state.direction || "right");
  }

  function handleReturnToScreen() {
    stopVisual("return-cat");
  }

  function cancel(reason) {
    const wasRunning = running;
    stopVisual(reason || "cancel");
    if (wasRunning) requestMainCancel();
  }

  if (electronAPI && typeof electronAPI.onPetPlayfulMovement === "function") {
    electronAPI.onPetPlayfulMovement(handlePlayful);
  }
  if (electronAPI && typeof electronAPI.onPetReturnToScreen === "function") {
    electronAPI.onPetReturnToScreen(handleReturnToScreen);
  }

  try {
    const body = bodyEl();
    if (body && typeof MutationObserver === "function") {
      const obs = new MutationObserver(() => {
        if (!running) return;
        if (isDraggingBody(body)) cancel("drag");
        else if (
          body.dataset &&
          body.dataset.v6Pose &&
          body.dataset.v6Pose !== "walk" &&
          body.dataset.v6Pose !== "idle"
        ) {
          cancel("pose-stolen");
        }
      });
      obs.observe(body, {
        attributes: true,
        attributeFilter: ["class", "data-v6-pose", "data-purring"],
      });
    }
  } catch (_) {}

  return {
    handlePlayful,
    handleReturnToScreen,
    cancel,
    isRunning: () => running,
    getDirection: () => direction,
    FRAME_KEYS,
    FRAME_DURATION_MS: frameDurationMs,
  };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6Walk = wireV6Walk();
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    FRAME_KEYS,
    FRAME_DURATION_MS,
    wireV6Walk,
  };
}
