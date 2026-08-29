"use strict";

// V6-M16: visual frames for the main-process cursor theft sequence. This
// renderer never reads, moves, clicks, or otherwise manipulates the pointer.
// Classic scripts share one global lexical scope. These names must remain
// tease-specific: v6-hunt owns its own frame sequence in the same document.
const V6_TEASE_FRAME_SEQUENCE = Object.freeze(["f0", "f1", "f2", "f3", "f4"]);
const V6_TEASE_REDUCED_MOTION_HOLD_MS = 520;
const V6_TEASE_PHASE_FRAME = Object.freeze({
  stalk: "f0",
  pounce: "f1",
  caught: "f2",
  carry: "f3",
  release: "f4",
});

function isDragging(body) {
  try {
    return !!(body && body.classList && body.classList.contains("dragging"));
  } catch (_) {
    return false;
  }
}

function wireV6CursorTease({
  win = window,
  electronAPI = win && win.electronAPI,
  document: doc = win && win.document,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let running = false;
  let timer = null;
  let token = 0;
  let forensicEnabled = false;
  let theftCopyForensicEnabled = false;

  function body() {
    return doc && doc.body ? doc.body : null;
  }

  function clearFrameTimer() {
    if (timer) clearTimer(timer);
    timer = null;
  }

  function guardReason(pose) {
    const currentBody = body();
    if (!pose || !pose.isLatched || !pose.isLatched()) return "not-latched";
    if (!currentBody || !currentBody.dataset) return "missing-body";
    if (isDragging(currentBody)) return "dragging";
    if (pose.getPose && pose.getPose() !== "idle") return "pose-not-idle";
    const data = currentBody.dataset;
    if (data.idleSleep === "1") return "sleep";
    if (data.purring === "1") return "purr";
    if (data.press) return "typing";
    if (data.scroll) return "scroll";
    if (data.musicDance === "1" || data.musicActive === "1") return "music";
    if (data.hunting === "1") return "hunt";
    if (data.petPeek) return "peek";
    if (data.reminderPanel === "1" || data.reminderForm === "1" || data.reminderJump === "1") return "reminder";
    if (data.sharing === "1") return "sharing";
    if (data.stretching === "1") return "stretch";
    if (data.drinking === "1") return "drink";
    return "";
  }

  function logForensic(source, payload = {}) {
    if (!forensicEnabled || !electronAPI || typeof electronAPI.cursorTeaseForensicLog !== "function") return;
    try {
      electronAPI.cursorTeaseForensicLog({ source, ...payload });
    } catch (_) {}
  }

  function finish(reason) {
    clearFrameTimer();
    running = false;
    token += 1;
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.leaveTease && pose.getPose && pose.getPose() === "tease") {
      pose.leaveTease(reason || "tease-finish");
    }
    logForensic("cancel", { reason: String(reason || "tease-finish"), running: false });
  }

  function play(index, runToken) {
    if (!running || runToken !== token) return;
    const pose = win && win.CatCodeV6VisualPose;
    if (!pose || !pose.enterTease || !pose.getPose) {
      finish("missing-pose");
      return;
    }
    if (index >= V6_TEASE_FRAME_SEQUENCE.length) {
      finish("complete");
      return;
    }
    const key = V6_TEASE_FRAME_SEQUENCE[index];
    if (!pose.enterTease(key)) {
      finish("frame-rejected");
      return;
    }
    logForensic("frame", { frame: key, pose: pose.getPose() || "" });
    const duration =
      (pose.getTeaseFrameDuration && pose.getTeaseFrameDuration(key)) || 0;
    timer = setTimer(() => {
      timer = null;
      play(index + 1, runToken);
    }, duration);
  }

  function trigger() {
    logForensic("renderer-received", { running: !!running });
    if (running) {
      logForensic("guard-reject", { reason: "already-running" });
      return false;
    }
    const pose = win && win.CatCodeV6VisualPose;
    const blocked = guardReason(pose);
    const assetsReady = !!(pose && pose.areTeaseAssetsReady && pose.areTeaseAssetsReady());
    if (blocked || !assetsReady) {
      const currentBody = body();
      logForensic("guard-reject", {
        reason: blocked || "assets-not-ready",
        pose: pose && pose.getPose ? pose.getPose() || "" : "",
        model: currentBody && currentBody.dataset ? currentBody.dataset.catcodeModel || "" : "",
        latched: !!(pose && pose.isLatched && pose.isLatched()),
        assetsReady,
      });
      return false;
    }
    running = true;
    token += 1;
    const runToken = token;
    if (pose.isReducedMotion && pose.isReducedMotion()) {
      if (!pose.enterTease("f0")) {
        finish("reduced-motion-rejected");
        return false;
      }
      logForensic("pose-enter", { frame: "f0", reducedMotion: true });
      timer = setTimer(() => finish("reduced-motion"), V6_TEASE_REDUCED_MOTION_HOLD_MS);
      return true;
    }
    play(0, runToken);
    logForensic("pose-enter", { frame: "f0", reducedMotion: false });
    return true;
  }

  function showPlayfulPhase(state = {}) {
    if (theftCopyForensicEnabled && electronAPI && typeof electronAPI.cursorTheftCopyForensicLog === "function") {
      try {
        electronAPI.cursorTheftCopyForensicLog({
          source: "tease-phase",
          listener: "v6-cursor-tease",
          phase: state && state.phase ? String(state.phase) : state && state.active ? "active" : "inactive",
          active: !!(state && state.active),
          mode: state && state.mode ? String(state.mode) : "",
          warpedFlag: !!(state && state.cursorWarped),
          attrPose: body() && body().dataset ? body().dataset.v6Pose || "" : "",
        });
      } catch (_) {}
    }
    if (!state || !state.active || state.mode !== "cursor") {
      if (running) finish("movement-finished");
      return false;
    }
    const frame = V6_TEASE_PHASE_FRAME[state.phase];
    const pose = win && win.CatCodeV6VisualPose;
    if (!frame || !pose || !pose.enterTease || !pose.areTeaseAssetsReady || !pose.areTeaseAssetsReady()) {
      return false;
    }
    clearFrameTimer();
    running = true;
    token += 1;
    if (!pose.enterTease(frame)) {
      finish("phase-rejected");
      return false;
    }
    logForensic("movement-phase", { phase: state.phase, frame });
    return true;
  }

  function cancel(reason) {
    if (!running && (!win || !win.CatCodeV6VisualPose || win.CatCodeV6VisualPose.getPose() !== "tease")) {
      return false;
    }
    finish(reason || "cancel");
    return true;
  }

  if (electronAPI && typeof electronAPI.onV6CursorTease === "function") {
    electronAPI.onV6CursorTease(() => trigger());
  }
  if (electronAPI && typeof electronAPI.onPetPlayfulMovement === "function") {
    electronAPI.onPetPlayfulMovement((state) => showPlayfulPhase(state));
  }
  if (electronAPI && typeof electronAPI.onPetReturnToScreen === "function") {
    electronAPI.onPetReturnToScreen(() => cancel("return-cat"));
  }
  if (electronAPI && typeof electronAPI.onPetWakeForPlay === "function") {
    electronAPI.onPetWakeForPlay(() => cancel("wake"));
  }
  if (electronAPI && typeof electronAPI.cursorTeaseForensicEnabled === "function") {
    Promise.resolve(electronAPI.cursorTeaseForensicEnabled())
      .then((info) => {
        forensicEnabled = !!(info && info.enabled);
        if (!forensicEnabled) return;
        const pose = win && win.CatCodeV6VisualPose;
        logForensic("assets", {
          pose: pose && pose.getPose ? pose.getPose() || "" : "",
          ready: !!(pose && pose.areTeaseAssetsReady && pose.areTeaseAssetsReady()),
        });
      })
      .catch(() => {
        forensicEnabled = false;
      });
  }
  if (electronAPI && typeof electronAPI.cursorTheftCopyForensicEnabled === "function") {
    Promise.resolve(electronAPI.cursorTheftCopyForensicEnabled())
      .then((info) => {
        theftCopyForensicEnabled = !!(info && info.enabled);
      })
      .catch(() => {
        theftCopyForensicEnabled = false;
      });
  }

  try {
    const currentBody = body();
    if (currentBody && typeof MutationObserver === "function") {
      const observer = new MutationObserver(() => {
        if (!running) return;
        const pose = win && win.CatCodeV6VisualPose;
        if (isDragging(currentBody) || !pose || pose.getPose() !== "tease") {
          cancel("preempted");
        }
      });
      observer.observe(currentBody, {
        attributes: true,
        attributeFilter: [
          "class",
          "data-v6-pose",
          "data-idle-sleep",
          "data-purring",
          "data-press",
          "data-scroll",
          "data-music-dance",
          "data-reminder-panel",
          "data-reminder-form",
        ],
      });
    }
  } catch (_) {}

  return {
    trigger,
    showPlayfulPhase,
    cancel,
    isRunning: () => running,
    guardReason: () => guardReason(win && win.CatCodeV6VisualPose),
    FRAME_SEQUENCE: V6_TEASE_FRAME_SEQUENCE,
    PHASE_FRAME: V6_TEASE_PHASE_FRAME,
    REDUCED_MOTION_HOLD_MS: V6_TEASE_REDUCED_MOTION_HOLD_MS,
  };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6CursorTease = wireV6CursorTease();
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    FRAME_SEQUENCE: V6_TEASE_FRAME_SEQUENCE,
    PHASE_FRAME: V6_TEASE_PHASE_FRAME,
    REDUCED_MOTION_HOLD_MS: V6_TEASE_REDUCED_MOTION_HOLD_MS,
    wireV6CursorTease,
  };
}
