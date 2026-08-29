"use strict";

/**
 * V6-M15 hunt: near-zone play gesture + walk preemption (opt-in).
 * Uses relative cursor-pos only. Never manipulates the OS cursor.
 *
 * Trigger state: unarmed (disabled) -> armed -> running.
 * Visual: f0 alert -> f1 micro-lower -> f2 lower -> f3 half-crouch ->
 * f4 deep -> f5 low-settle -> f6 watch-arrive -> f7 watch-settle -> f8 hold.
 *
 * Walk is low priority: a valid gesture cancels V6 walk (main motion + visual)
 * then enters hunt from a clean idle handoff.
 */

/** @deprecated retained for compatibility; re-arming no longer needs an outer leave. */
const ARM_OUTER_PX = 420;
/** Near trigger radius: a complete play gesture must happen around the cat. */
const TRIGGER_NEAR_PX = 300;
/** @deprecated alias — former outside→inside inner ring */
const TRIGGER_INNER_PX = TRIGGER_NEAR_PX;
const HOLD_NEAR_DISTANCE_PX = 320;
/**
 * Deliberate near-cat play: playable quick back-and-forth (~1s), stricter than
 * the old 260 accidental gate, softer than the unplayable 420/600 gates.
 */
const MIN_GESTURE_SPEED_PX_S = 300;
/** @deprecated alias of MIN_GESTURE_SPEED_PX_S */
const MIN_APPROACH_SPEED_PX_S = MIN_GESTURE_SPEED_PX_S;
/** Reject micro-jitter and one fast sweep. The path is cumulative. */
const MIN_GESTURE_PATH_PX = 48;
const MIN_GESTURE_SEGMENTS = 2;
const MIN_GESTURE_TURNS = 1;
const GESTURE_WINDOW_MS = 1000;
const GESTURE_SAMPLE_GAP_MS = 240;
/** No post-hunt interval: a new, complete gesture may immediately start play. */
const REARM_DEBOUNCE_MS = 0;
// The crouch is a watching state, not a five-second canned animation. It ends
// only when the cursor leaves the cat's near zone or a higher-priority state wins.
const HOLD_MAX_MS = 0;
const HOLD_FAR_GRACE_MS = 380;
const SAMPLE_DT_FLOOR_MS = 16;
const SAMPLE_DT_CEIL_MS = 250;

/** Main-process poll policy (mirrored in main.js; asserted by tests). */
const CURSOR_POLL_NEAR_BAND_PX = 760;
const CURSOR_POLL_NEAR_MS = 60;
const CURSOR_POLL_FAR_MS = 500;

const ENTRY_SEQUENCE = Object.freeze(["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"]);
const HOLD_FRAME = "f8";
const FRAME_SEQUENCE = Object.freeze(["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"]);
// Keep fallback cadence identical to visual-pose entry (14 FPS). Prefer
// pose.getHuntFrameDuration when the visual owner is available.
// Unique names: classic scripts share one global lexical env, so these must
// not reuse v6-visual-pose.js's HUNT_ENTRY_FPS / HUNT_ENTRY_FRAME_MS.
const V6_HUNT_TRIGGER_ENTRY_FPS = 14;
const V6_HUNT_TRIGGER_ENTRY_FRAME_MS = 1000 / V6_HUNT_TRIGGER_ENTRY_FPS;
const FRAME_DURATIONS_MS = Object.freeze({
  f0: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
  f1: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
  f2: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
  f3: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
  f4: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
  f5: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
  f6: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
  f7: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
});
const HEAD_MAX_ROTATE_DEG = 2.2;
const HEAD_MAX_TRANSLATE_PX = 2;
const HEAD_SATURATION_PX = 220;
const HEAD_SMOOTH = 0.28;

/** @deprecated kept as alias of TRIGGER_NEAR_PX for older callers/tests */
const NEAR_DISTANCE_PX = TRIGGER_NEAR_PX;
/** @deprecated 45s global cooldown removed; re-arm policy replaces it */
const COOLDOWN_MS = 0;

function isDraggingBody(body) {
  try {
    return !!(body && body.classList && body.classList.contains("dragging"));
  } catch (_) {
    return false;
  }
}

function hypot(dx, dy) {
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function cursorPollIntervalMs(
  distancePx,
  {
    nearBandPx = CURSOR_POLL_NEAR_BAND_PX,
    nearMs = CURSOR_POLL_NEAR_MS,
    farMs = CURSOR_POLL_FAR_MS,
  } = {},
) {
  return distancePx <= nearBandPx ? nearMs : farMs;
}

function isWalkRoamingFlag(value) {
  return value === "walk";
}

function wireV6Hunt({
  win = window,
  electronAPI = win && win.electronAPI,
  document: doc = win && win.document,
  now = Date.now,
  armOuterPx = ARM_OUTER_PX,
  triggerNearPx = TRIGGER_NEAR_PX,
  triggerInnerPx = triggerNearPx,
  holdNearDistancePx = HOLD_NEAR_DISTANCE_PX,
  minGestureSpeedPxS = MIN_GESTURE_SPEED_PX_S,
  minApproachSpeedPxS = minGestureSpeedPxS,
  minGesturePathPx = MIN_GESTURE_PATH_PX,
  rearmDebounceMs = REARM_DEBOUNCE_MS,
  holdMaxMs = HOLD_MAX_MS,
  holdFarGraceMs = HOLD_FAR_GRACE_MS,
  headMaxRotateDeg = HEAD_MAX_ROTATE_DEG,
  headMaxTranslatePx = HEAD_MAX_TRANSLATE_PX,
} = {}) {
  let nearPx = triggerInnerPx != null ? triggerInnerPx : triggerNearPx;
  let holdNearPx =
    holdNearDistancePx != null ? holdNearDistancePx : HOLD_NEAR_DISTANCE_PX;
  const minSpeed =
    minApproachSpeedPxS != null ? minApproachSpeedPxS : minGestureSpeedPxS;

  function api() {
    const live = win && win.electronAPI;
    if (live && typeof live.onCursorPos === "function") return live;
    if (electronAPI && typeof electronAPI.onCursorPos === "function") {
      return electronAPI;
    }
    return live || electronAPI || null;
  }

  function focusApi() {
    return (
      (win && win.CatCodeV6HuntVisualFocus) ||
      (typeof CatCodeV6HuntVisualFocus !== "undefined"
        ? CatCodeV6HuntVisualFocus
        : null)
    );
  }

  let enabled = false;
  let running = false;
  /** @type {"unarmed"|"armed"|"running"|"entry"|"hold"} */
  let phase = "unarmed";
  let frameTimer = null;
  let holdTimer = null;
  let lastDx = null;
  let lastDy = null;
  let lastSampleAt = -Infinity;
  let lastNearAt = -Infinity;
  let holdStartedAt = -Infinity;
  let gesture = {
    startedAt: -Infinity,
    lastAt: -Infinity,
    pathPx: 0,
    segments: 0,
    turns: 0,
    velocity: null,
  };
  let gazeActive = false;
  let head = { rotateDeg: 0, translateX: 0, translateY: 0 };
  let forensicEnabled = false;
  let forensicPackageMarker = null;
  let lastForensicSampleAt = 0;
  let lastStatusReason = "waiting";
  let statusLabelEl = null;
  let rendererBootLogged = Object.create(null);
  let firstCursorPosLogged = false;
  let cursorSubscribed = false;
  let lastFocusReportAt = 0;
  let lastFocusSignature = "";
  let focusReportTimer = null;

  function logForensic(source, payload = {}) {
    const bridge = api();
    if (!bridge) return;
    if (!forensicEnabled && !isForensicQueryEnabled()) return;
    const body = {
      source,
      process: "renderer",
      ...payload,
    };
    try {
      if (typeof bridge.huntOwnerForensicEvent === "function") {
        bridge.huntOwnerForensicEvent(body);
        return;
      }
    } catch (_) {}
    try {
      if (typeof bridge.huntOwnerForensicLog === "function") {
        bridge.huntOwnerForensicLog(body);
      }
    } catch (_) {}
  }

  function logRendererBoot(event, payload = {}) {
    if (rendererBootLogged[event]) return;
    rendererBootLogged[event] = true;
    logForensic("boot", { event, ...payload });
  }

  // On-screen hunt debug badge is forbidden (owner QA / normal / forensic).
  // Keep reason state for logs only; never create or show DOM status text.
  // Historical source: setStatusLabel painted #v6-hunt-owner-forensic-status
  // with Russian hunt-status phrases (accepted / reason / waiting), including
  // reject reasons such as turns-below.
  function clearStatusLabelDom() {
    try {
      if (statusLabelEl) {
        statusLabelEl.textContent = "";
        statusLabelEl.style.display = "none";
        if (typeof statusLabelEl.remove === "function") statusLabelEl.remove();
        statusLabelEl = null;
      }
      if (!doc || typeof doc.getElementById !== "function") return;
      const stale = doc.getElementById("v6-hunt-owner-forensic-status");
      if (stale) {
        stale.textContent = "";
        if (stale.style) stale.style.display = "none";
        if (typeof stale.remove === "function") stale.remove();
      }
    } catch (_) {}
  }

  function ensureStatusLabel() {
    clearStatusLabelDom();
  }

  function setStatusLabel(kind, reason) {
    try {
      // Track reason for forensic JSONL consumers; never paint pet-window UI.
      if (kind === "accepted") lastStatusReason = "accepted";
      else if (kind === "reason" && reason) lastStatusReason = String(reason).slice(0, 28);
      else lastStatusReason = "waiting";
      clearStatusLabelDom();
    } catch (_) {}
  }

  // Boot / reload: remove any stale badge left from a previous session DOM.
  clearStatusLabelDom();

  function coerceHuntEnabled(value) {
    if (value === true || value === false) return value;
    if (typeof value === "number") return value !== 0;
    if (value && typeof value === "object") {
      if (Object.prototype.hasOwnProperty.call(value, "enabled")) {
        return !!value.enabled;
      }
      if (Object.prototype.hasOwnProperty.call(value, "huntCursorEnabled")) {
        return !!value.huntCursorEnabled;
      }
      // Untrusted/error IPC shapes must not force hunt off.
      return null;
    }
    return null;
  }

  function isForensicQueryEnabled() {
    try {
      const search =
        (win && win.location && win.location.search) ||
        (typeof location !== "undefined" && location.search) ||
        "";
      return new URLSearchParams(search).get("huntOwnerForensic") === "1";
    } catch (_) {
      return false;
    }
  }

  function gateSnapshot(poseApi) {
    const body = bodyEl();
    const d = (body && body.dataset) || {};
    return {
      huntEnabled: !!enabled,
      reducedMotion: !!(poseApi && poseApi.isReducedMotion && poseApi.isReducedMotion()),
      dragging: isDraggingBody(body),
      music: d.musicActive === "1" || d.musicDance === "1",
      sleep: d.idleSleep === "1",
      purr: d.purring === "1",
      typing: !!d.press,
      scroll: !!d.scroll,
      dance: d.v4DanceActive === "1" || d.musicDance === "1",
      cursorStolen: d.cursorStolen === "1",
      walkRoam: !!d.petRoaming,
      reminder: d.reminderPanel === "1" || d.reminderForm === "1",
      skinId: d.v6Skin || "unknown",
      model: d.catcodeModel || "",
      latched: d.catcodeModelLatched === "1",
      pose: poseApi && poseApi.getPose ? poseApi.getPose() : "none",
      epoch: poseApi && poseApi.getEpoch ? poseApi.getEpoch() : -1,
    };
  }

  function hostVisual(host) {
    if (!host) return { hostMissing: true };
    let display = "unknown";
    let visibility = "unknown";
    let opacityClass = "unknown";
    try {
      if (win && typeof win.getComputedStyle === "function") {
        const style = win.getComputedStyle(host);
        display = String(style.display || "").slice(0, 16);
        visibility = String(style.visibility || "").slice(0, 16);
        const opacity = Number(style.opacity);
        opacityClass = Number.isFinite(opacity) && opacity > 0.01 ? "opaque" : "transparent";
      }
    } catch (_) {}
    const src =
      (host.getAttribute && host.getAttribute("src")) ||
      host.src ||
      (host.dataset && host.dataset.src) ||
      "";
    const base = String(src).split("/").pop() || "";
    return {
      hostHidden: !!host.hidden,
      display,
      visibility,
      opacityClass,
      assetBase: base.slice(0, 64),
    };
  }

  function logAppliedFrame(requestedKey) {
    const pose = win && win.CatCodeV6VisualPose;
    const visual =
      pose && typeof pose.getHuntVisualState === "function"
        ? pose.getHuntVisualState()
        : null;
    const hostId = visual && visual.hostId;
    const host =
      hostId && doc && typeof doc.getElementById === "function"
        ? doc.getElementById(hostId)
        : null;
    const idle =
      doc && typeof doc.getElementById === "function"
        ? doc.getElementById("v6-idle-preview")
        : null;
    logForensic("frame", {
      event: "frameApplied",
      requestedFrame: requestedKey,
      appliedFrame: visual && visual.frameKey,
      pose: pose && pose.getPose ? pose.getPose() : "none",
      epoch: pose && pose.getEpoch ? pose.getEpoch() : -1,
      host: hostVisual(host),
      idleHost: hostVisual(idle),
      skinId: visual && visual.skinId,
    });
    if (requestedKey === "f0") {
      logForensic("frame", {
        event: "entry-f0-applied",
        requestedFrame: "f0",
        appliedFrame: visual && visual.frameKey,
      });
    }
    if (requestedKey === HOLD_FRAME) {
      logForensic("frame", {
        event: "hold-f8-reached",
        requestedFrame: HOLD_FRAME,
        appliedFrame: visual && visual.frameKey,
      });
    }
    logForensic("host", {
      event: "hostVisibility",
      appliedFrame: visual && visual.frameKey,
      ...hostVisual(host),
      idleHidden: idle ? !!idle.hidden : true,
    });
  }

  function clearFrameTimer() {
    if (frameTimer) clearTimeout(frameTimer);
    frameTimer = null;
  }

  function clearHoldTimer() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  }

  function bodyEl() {
    return doc && doc.body ? doc.body : null;
  }

  function hardBlockedReason(poseApi, { allowWalk = false } = {}) {
    if (!poseApi || typeof poseApi.getPose !== "function") return "no-pose";
    if (isDraggingBody(bodyEl())) return "dragging";
    const pose = poseApi.getPose();
    if (pose !== "idle" && !(allowWalk && pose === "walk")) return `pose-${pose}`;
    const body = bodyEl();
    if (!body || !body.dataset) return "missing-body";
    const d = body.dataset;
    if (d.musicActive === "1" || d.musicDance === "1") return "music";
    if (d.v4DanceActive === "1") return "dance";
    if (d.petPeek) return "peek";
    if (d.reminderPanel === "1" || d.reminderForm === "1" || d.reminderJump === "1") {
      return "reminder";
    }
    if (d.cursorStolen === "1") return "cursor-stolen";
    if (d.press) return "typing";
    if (d.scroll) return "scroll";
    if (d.jump) return "jump";
    if (d.hunting === "1") return "v4-hunting";
    if (d.sharing === "1") return "sharing";
    if (d.stretching === "1") return "stretch";
    if (d.drinking === "1") return "drink";
    if (d.petRoaming && !(allowWalk && isWalkRoamingFlag(d.petRoaming))) {
      return "roaming";
    }
    return "";
  }

  function hardBlocked(poseApi, options) {
    return !!hardBlockedReason(poseApi, options);
  }

  function exclusiveBlocked(poseApi) {
    return hardBlocked(poseApi, { allowWalk: false });
  }

  function holdInterrupted(poseApi) {
    if (!poseApi || typeof poseApi.getPose !== "function") return true;
    if (isDraggingBody(bodyEl())) return true;
    if (poseApi.getPose() !== "hunt") return true;
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
      d.petRoaming ||
      d.cursorStolen === "1" ||
      d.press ||
      d.scroll ||
      d.jump ||
      d.hunting === "1" ||
      d.sharing === "1" ||
      d.stretching === "1" ||
      d.drinking === "1"
    ) {
      return true;
    }
    return false;
  }

  function walkIsActive(poseApi) {
    if (poseApi && poseApi.getPose && poseApi.getPose() === "walk") return true;
    const body = bodyEl();
    if (body && body.dataset && isWalkRoamingFlag(body.dataset.petRoaming)) {
      return true;
    }
    const walk = win && win.CatCodeV6Walk;
    if (walk && typeof walk.isRunning === "function" && walk.isRunning()) {
      return true;
    }
    return false;
  }

  function requestMainWalkCancel() {
    try {
      const bridge = api();
      if (bridge && typeof bridge.cancelPetPlayfulMovement === "function") {
        bridge.cancelPetPlayfulMovement();
      }
    } catch (_) {}
  }

  /**
   * Cancel active V6 walk (visual + main window motion) and require idle.
   * Prefer CatCodeV6Walk.cancel so main IPC is owned by the walk controller once.
   */
  function preemptWalkForHunt(poseApi) {
    if (!walkIsActive(poseApi)) return true;
    const walk = win && win.CatCodeV6Walk;
    const walkWasRunning =
      !!(walk && typeof walk.isRunning === "function" && walk.isRunning());

    if (walk && typeof walk.cancel === "function") {
      walk.cancel("hunt-preempt");
    } else if (poseApi && poseApi.leaveWalk && poseApi.getPose() === "walk") {
      poseApi.leaveWalk("hunt-preempt");
    }

    const body = bodyEl();
    if (body && body.dataset) {
      delete body.dataset.petRoaming;
      delete body.dataset.petRoamingDirection;
      delete body.dataset.petMotionPhase;
    }

    // walk.cancel already requests main cancel when it was running.
    if (!walkWasRunning) requestMainWalkCancel();

    if (!poseApi || poseApi.getPose() !== "idle") return false;
    if (body && body.dataset && body.dataset.petRoaming) return false;
    if (walk && typeof walk.isRunning === "function" && walk.isRunning()) {
      return false;
    }
    return true;
  }

  function setGazeFlag(active) {
    gazeActive = !!active;
    const body = bodyEl();
    if (!body || !body.dataset) return;
    if (gazeActive) body.dataset.v6HuntGaze = "1";
    else delete body.dataset.v6HuntGaze;
  }

  function resetHeadResponse() {
    head = { rotateDeg: 0, translateX: 0, translateY: 0 };
    const body = bodyEl();
    if (body && body.style) {
      body.style.removeProperty("--v6-hunt-response-x");
      body.style.removeProperty("--v6-hunt-response-y");
      body.style.removeProperty("--v6-hunt-response-rotate");
    }
  }

  function stopGazeAndHead() {
    setGazeFlag(false);
    resetHeadResponse();
  }

  function applyHeadResponse(dx, dy) {
    if (!gazeActive) return head;
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.isReducedMotion && pose.isReducedMotion()) {
      resetHeadResponse();
      return head;
    }
    const sat = HEAD_SATURATION_PX;
    const nx = clamp(dx / sat, -1, 1);
    const ny = clamp(dy / sat, -1, 1);
    const target = {
      rotateDeg: nx * headMaxRotateDeg,
      translateX: nx * headMaxTranslatePx,
      translateY: ny * headMaxTranslatePx * 0.65,
    };
    head = {
      rotateDeg:
        head.rotateDeg + (target.rotateDeg - head.rotateDeg) * HEAD_SMOOTH,
      translateX:
        head.translateX + (target.translateX - head.translateX) * HEAD_SMOOTH,
      translateY:
        head.translateY + (target.translateY - head.translateY) * HEAD_SMOOTH,
    };
    head.rotateDeg = clamp(head.rotateDeg, -headMaxRotateDeg, headMaxRotateDeg);
    head.translateX = clamp(
      head.translateX,
      -headMaxTranslatePx,
      headMaxTranslatePx,
    );
    head.translateY = clamp(
      head.translateY,
      -headMaxTranslatePx,
      headMaxTranslatePx,
    );
    const body = bodyEl();
    if (body && body.style) {
      body.style.setProperty("--v6-hunt-response-x", `${head.translateX.toFixed(2)}px`);
      body.style.setProperty("--v6-hunt-response-y", `${head.translateY.toFixed(2)}px`);
      body.style.setProperty("--v6-hunt-response-rotate", `${head.rotateDeg.toFixed(2)}deg`);
    }
    return head;
  }

  function resetGesture() {
    gesture = {
      startedAt: -Infinity,
      lastAt: -Infinity,
      pathPx: 0,
      segments: 0,
      turns: 0,
      velocity: null,
    };
  }

  function enterArmed() {
    running = false;
    phase = enabled ? "armed" : "unarmed";
    resetGesture();
  }

  function finish(reason) {
    clearFrameTimer();
    clearHoldTimer();
    stopGazeAndHead();
    const wasActive = running || phase === "entry" || phase === "hold";
    const named = reason || "hunt-complete";
    if (wasActive) {
      logForensic("cancel", {
        reason: named,
        phase,
        ...gateSnapshot(win && win.CatCodeV6VisualPose),
      });
      if (named !== "hunt-complete" && named !== "eligibility-end") {
        setStatusLabel("reason", named);
      } else {
        setStatusLabel("waiting");
      }
    }
    running = false;
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.leaveHunt && pose.getPose && pose.getPose() === "hunt") {
      pose.leaveHunt(named);
    }
    if (wasActive) enterArmed();
  }

  function cursorEligibleForHold() {
    const t = now();
    if (lastDx == null || lastDy == null) return false;
    const dist = hypot(lastDx, lastDy);
    if (dist <= holdNearPx) {
      lastNearAt = t;
      return true;
    }
    return t - lastNearAt <= holdFarGraceMs;
  }

  function beginHold() {
    phase = "hold";
    holdStartedAt = now();
    lastNearAt = now();
    setGazeFlag(true);
    if (lastDx != null && lastDy != null) applyHeadResponse(lastDx, lastDy);
    clearHoldTimer();
    // An injected positive value is useful to narrow a test harness, but the
    // shipped policy is unbounded while the cursor remains in the watch zone.
    if (holdMaxMs > 0) {
      const pose = win && win.CatCodeV6VisualPose;
      const token = pose && pose.getEpoch ? pose.getEpoch() : 0;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!running || phase !== "hold") return;
        if (pose && pose.getEpoch && pose.getEpoch() !== token) return;
        finish("hold-test-limit");
      }, holdMaxMs);
    }
  }

  function playEntry(index) {
    const pose = win && win.CatCodeV6VisualPose;
    if (!pose || !pose.enterHunt) {
      finish("no-pose");
      return;
    }
    if (!running) return;
    if (pose.getPose() !== "hunt" && exclusiveBlocked(pose)) {
      finish("blocked");
      return;
    }
    if (pose.getPose() !== "idle" && pose.getPose() !== "hunt") {
      finish("stolen");
      return;
    }
    if (index >= ENTRY_SEQUENCE.length) {
      const okHold = pose.enterHunt(HOLD_FRAME);
      if (!okHold) {
        finish("enter-hold-failed");
        return;
      }
      logAppliedFrame(HOLD_FRAME);
      beginHold();
      return;
    }
    const key = ENTRY_SEQUENCE[index];
    const ok = pose.enterHunt(key);
    if (!ok) {
      finish("enter-failed");
      return;
    }
    phase = "entry";
    if (index === 0) {
      logForensic("frame", {
        event: "frame-requested",
        requestedFrame: key,
        ...hostVisual(
          doc && typeof doc.getElementById === "function"
            ? doc.getElementById("v6-hunt-f0")
            : null,
        ),
      });
    }
    logAppliedFrame(key);
    if (pose.isReducedMotion && pose.isReducedMotion()) {
      clearFrameTimer();
      const hold =
        (pose.HUNT_REDUCED_MOTION_HOLD_MS != null &&
          pose.HUNT_REDUCED_MOTION_HOLD_MS) ||
        520;
      frameTimer = setTimeout(() => {
        frameTimer = null;
        finish("reduced-motion");
      }, hold + 16);
      return;
    }
    const duration =
      (pose.getHuntFrameDuration && pose.getHuntFrameDuration(key)) ||
      FRAME_DURATIONS_MS[key] ||
      180;
    clearFrameTimer();
    const token = pose.getEpoch ? pose.getEpoch() : 0;
    frameTimer = setTimeout(() => {
      frameTimer = null;
      if (!running) return;
      if (pose.getEpoch && pose.getEpoch() !== token) return;
      // Entry once started must reach f8. Cursor near-zone eligibility is the
      // hold/exit contract, not an every-frame abort during the 14 FPS crouch.
      if (holdInterrupted(pose) && pose.getPose() !== "hunt") {
        finish("interrupted");
        return;
      }
      playEntry(index + 1);
    }, duration);
  }

  function startHunt() {
    const pose = win && win.CatCodeV6VisualPose;
    const before = gateSnapshot(pose);
    let reason = "";
    if (!enabled) reason = "hunt-disabled";
    else if (running) reason = "already-running";
    else if (!pose || !pose.isLatched || !pose.isLatched() || !pose.enterHunt) {
      reason = "not-latched";
    } else {
      const hard = hardBlockedReason(pose, { allowWalk: true });
      if (hard) reason = hard;
      else if (!preemptWalkForHunt(pose)) reason = "walk-preempt-failed";
      else {
        const exclusive = hardBlockedReason(pose, { allowWalk: false });
        if (exclusive) reason = exclusive;
      }
    }

    logForensic("trigger", {
      event: "triggerEntered",
      ok: !reason,
      reason: reason || "accepted",
      before,
      afterPose: pose && pose.getPose ? pose.getPose() : "none",
      afterEpoch: pose && pose.getEpoch ? pose.getEpoch() : -1,
    });

    if (reason) {
      setStatusLabel("reason", reason);
      return false;
    }

    running = true;
    phase = "entry";
    setStatusLabel("accepted");
    logForensic("trigger", {
      event: "hunt-entry-started",
      ok: true,
      reason: "accepted",
      before,
      afterPose: "hunt",
    });
    playEntry(0);
    const afterPose = win && win.CatCodeV6VisualPose;
    logForensic("pose", {
      event: "enter-hunt",
      beforePose: before.pose,
      afterPose: afterPose && afterPose.getPose ? afterPose.getPose() : "none",
      epoch: afterPose && afterPose.getEpoch ? afterPose.getEpoch() : -1,
    });
    return true;
  }

  function updateArming() {
    if (phase === "running" || phase === "entry" || phase === "hold") return;
    if (enabled) phase = "armed";
  }

  let lastRejectLogAt = 0;

  function maybeTriggerFromSample({
    dist,
    prevDist,
    speedPxS,
    pathPx,
    velocity,
    t,
  }) {
    const distanceClass =
      dist <= nearPx ? "near" : dist <= 760 ? "approach" : "far";
    const speedClass = speedPxS >= minSpeed ? "fast" : "slow";
    const pathClass = pathPx > 0 ? "path-moved" : "path-zero";

    function reject(reason) {
      const interesting = distanceClass === "near" || speedClass === "fast";
      if (interesting && t - lastRejectLogAt >= 220) {
        lastRejectLogAt = t;
        logForensic("gesture", {
          event: "gestureRejected",
          accepted: false,
          reason,
          distanceClass,
          speedClass,
          pathClass,
          phase,
          segments: gesture.segments,
          turns: gesture.turns,
          pathBucket:
            gesture.pathPx >= minGesturePathPx ? "path-valid" : "path-below",
          ...gateSnapshot(win && win.CatCodeV6VisualPose),
        });
        setStatusLabel("reason", reason);
      }
      return false;
    }

    if (!enabled || running) {
      return running ? false : reject(enabled ? "already-running" : "hunt-disabled");
    }
    if (phase !== "armed") return reject(`phase-${phase}`);
    const nearNow = dist <= nearPx;
    const nearPrev = prevDist != null && prevDist <= nearPx;
    if (!nearNow && !nearPrev) {
      resetGesture();
      return reject("far");
    }
    if (!(speedPxS >= minSpeed) || !(pathPx > 0)) {
      return reject(speedPxS >= minSpeed ? "path-zero" : "slow");
    }

    const expired =
      t - gesture.startedAt > GESTURE_WINDOW_MS ||
      t - gesture.lastAt > GESTURE_SAMPLE_GAP_MS;
    if (expired || gesture.segments === 0) {
      resetGesture();
      gesture.startedAt = t;
    }

    gesture.pathPx += pathPx;
    gesture.segments += 1;
    if (gesture.velocity && velocity) {
      const focusHelpers = focusApi();
      const reversed = focusHelpers && focusHelpers.isPlayfulDirectionReversal
        ? focusHelpers.isPlayfulDirectionReversal(gesture.velocity, velocity)
        : (() => {
            const px = gesture.velocity.x;
            const py = gesture.velocity.y;
            const nx = velocity.x;
            const ny = velocity.y;
            const prevMag = Math.hypot(px, py);
            const nextMag = Math.hypot(nx, ny);
            if (!(prevMag > 0) || !(nextMag > 0)) return false;
            if ((px * nx < 0 && Math.abs(px) >= 0.05 && Math.abs(nx) >= 0.05) ||
                (py * ny < 0 && Math.abs(py) >= 0.05 && Math.abs(ny) >= 0.05)) {
              return true;
            }
            return (px * nx + py * ny) / (prevMag * nextMag) <= 0;
          })();
      if (reversed) gesture.turns += 1;
    }
    gesture.velocity = velocity || null;
    gesture.lastAt = t;

    if (gesture.segments < MIN_GESTURE_SEGMENTS) {
      return reject("segments-below");
    }
    if (gesture.pathPx < minGesturePathPx) return reject("path-below");
    if (gesture.turns < MIN_GESTURE_TURNS) return reject("turns-below");
    resetGesture();
    logForensic("gesture", {
      event: "gestureAccepted",
      accepted: true,
      reason: "accepted",
      distanceClass,
      speedClass,
      pathClass,
      pathBucket: "path-valid",
      ...gateSnapshot(win && win.CatCodeV6VisualPose),
    });
    return startHunt();
  }

  function handleCursorPos(payload) {
    // Privacy: accept only relative dx/dy numbers; never log them.
    if (!payload || typeof payload !== "object") return;
    const dx = typeof payload.dx === "number" ? payload.dx : null;
    const dy = typeof payload.dy === "number" ? payload.dy : null;
    if (dx == null || dy == null) return;
    if (
      typeof payload.nearRadiusPx === "number" &&
      Number.isFinite(payload.nearRadiusPx) &&
      payload.nearRadiusPx > 0
    ) {
      nearPx = payload.nearRadiusPx;
      holdNearPx = Math.max(payload.nearRadiusPx + 20, payload.nearRadiusPx * 1.05);
    }

    const t = now();
    const dist = hypot(dx, dy);
    let prevDist = null;
    let speedPxS = 0;
    let pathPx = 0;
    let velocity = null;
    if (lastDx != null && lastDy != null && lastSampleAt > 0) {
      prevDist = hypot(lastDx, lastDy);
      const rawDt = t - lastSampleAt;
      pathPx = hypot(dx - lastDx, dy - lastDy);
      // A delayed far-poll is not evidence of a fast play gesture. Never
      // compress a long timestamp gap into the 250 ms ceiling: that used to
      // turn an ordinary return toward the cat into a false "fast" pass.
      if (rawDt >= SAMPLE_DT_FLOOR_MS && rawDt <= SAMPLE_DT_CEIL_MS) {
        speedPxS = (pathPx / rawDt) * 1000;
        velocity = { x: (dx - lastDx) / rawDt, y: (dy - lastDy) / rawDt };
      } else {
        resetGesture();
      }
    }

    lastDx = dx;
    lastDy = dy;
    lastSampleAt = t;
    if (dist <= holdNearPx) lastNearAt = t;

    // Forensic: observe delivery before any hunt eligibility/gesture logic.
    if (!firstCursorPosLogged) {
      firstCursorPosLogged = true;
      logRendererBoot("v6-hunt-cursor-pos-received", {
        huntEnabled: !!enabled,
      });
    }
    if ((forensicEnabled || isForensicQueryEnabled()) && t - lastForensicSampleAt >= 180) {
      lastForensicSampleAt = t;
      const distanceClass =
        dist <= nearPx ? "near" : dist <= 760 ? "approach" : "far";
      const speedClass = speedPxS >= minSpeed ? "fast" : "slow";
      const pathClass =
        pathPx <= 0
          ? "path-zero"
          : gesture.pathPx + pathPx >= minGesturePathPx
            ? "path-valid"
            : "path-below";
      logForensic("cursor-pos", {
        sampleReceived: true,
        distanceClass,
        speedClass,
        pathClass,
        phase: running
          ? phase === "hold"
            ? "awaiting-exit"
            : phase
          : phase,
        huntEnabled: !!enabled,
        gestureSegments: gesture.segments,
        gestureTurns: gesture.turns,
        packageMarker: forensicPackageMarker,
        ...gateSnapshot(win && win.CatCodeV6VisualPose),
      });
    }

    maybeReportVisualFocus(false);

    if (running) {
      const pose = win && win.CatCodeV6VisualPose;
      if (!pose) {
        finish("no-pose");
        return;
      }
      // During f0–f7 crouch entry, only abort when a higher-priority action
      // actually stole the pose. Sticky dataset flags must not cancel the
      // visible sequence; hold/exit still uses the full interrupt contract.
      if (phase === "entry") {
        if (pose.getPose && pose.getPose() !== "hunt") {
          finish("interrupted");
          return;
        }
        return;
      }
      if (holdInterrupted(pose)) {
        finish("interrupted");
        return;
      }
      if (phase === "hold") {
        if (!cursorEligibleForHold()) {
          finish("eligibility-end");
          return;
        }
        applyHeadResponse(dx, dy);
      }
      return;
    }

    updateArming();
    maybeTriggerFromSample({ dist, prevDist, speedPxS, pathPx, velocity, t });
  }

  function setEnabled(next) {
    enabled = !!next;
    if (!enabled) {
      cancel("setting-off");
      phase = "unarmed";
      resetGesture();
      setStatusLabel("reason", "hunt-disabled");
    } else if (!running) {
      // Armed immediately; only movement can trigger (speed/path gates).
      phase = "armed";
      setStatusLabel("waiting");
    }
    logForensic("gate", {
      huntEnabled: enabled,
      phase,
      ...gateSnapshot(win && win.CatCodeV6VisualPose),
    });
    return enabled;
  }

  function cancel(reason) {
    if (
      !running &&
      !(
        win &&
        win.CatCodeV6VisualPose &&
        win.CatCodeV6VisualPose.getPose &&
        win.CatCodeV6VisualPose.getPose() === "hunt"
      )
    ) {
      clearFrameTimer();
      clearHoldTimer();
      stopGazeAndHead();
      clearStatusLabelDom();
      running = false;
      if (phase === "entry" || phase === "hold" || phase === "running") {
        enterArmed();
      }
      return;
    }
    finish(reason || "cancel");
  }

  function activateForensic(info) {
    const already = forensicEnabled;
    forensicEnabled = true;
    forensicPackageMarker =
      (info && info.packageMarker) ||
      forensicPackageMarker ||
      "v6-hunt-renderer-live-boot-and-focus-qa";
    ensureStatusLabel();
    setStatusLabel(enabled ? "waiting" : "reason", enabled ? null : "hunt-disabled");
    if (already) return;
    logForensic("status", {
      event: "renderer-ready",
      packageMarker: forensicPackageMarker,
      huntEnabled: !!enabled,
      cursorListener: !!(api() && typeof api().onCursorPos === "function"),
      ...gateSnapshot(win && win.CatCodeV6VisualPose),
    });
  }

  function maybeReportVisualFocus(force) {
    const helpers = focusApi();
    const bridge = api();
    if (!helpers || !bridge || typeof bridge.reportV6HuntVisualFocus !== "function") {
      return false;
    }
    const t = now();
    if (!force && t - lastFocusReportAt < 400) return false;
    const contract = helpers.measureV6HuntVisualFocusContract(doc, win);
    if (!contract) return false;
    const signature = `${contract.x.toFixed(3)}:${contract.y.toFixed(3)}:${contract.radius.toFixed(3)}`;
    if (!force && signature === lastFocusSignature && t - lastFocusReportAt < 2000) {
      return false;
    }
    lastFocusReportAt = t;
    lastFocusSignature = signature;
    const minSide = Math.min(
      (win && win.innerWidth) || 280,
      (win && win.innerHeight) || 280,
    );
    const radiusPx = Math.round(contract.radius * minSide);
    if (radiusPx > 0) {
      nearPx = radiusPx;
      holdNearPx = Math.max(radiusPx + 20, Math.round(radiusPx * 1.05));
    }
    try {
      bridge.reportV6HuntVisualFocus(contract);
      logForensic("boot", {
        event: "visual-focus-reported",
        ok: true,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function scheduleVisualFocusReports() {
    maybeReportVisualFocus(true);
    if (focusReportTimer) return;
    let ticks = 0;
    focusReportTimer = setInterval(() => {
      ticks += 1;
      maybeReportVisualFocus(ticks <= 8);
      if (ticks >= 40 && focusReportTimer) {
        clearInterval(focusReportTimer);
        focusReportTimer = null;
      }
    }, 500);
  }

  function ensureCursorSubscription() {
    const bridge = api();
    if (!bridge || typeof bridge.onCursorPos !== "function" || cursorSubscribed) {
      return !!cursorSubscribed;
    }
    bridge.onCursorPos(handleCursorPos);
    cursorSubscribed = true;
    logRendererBoot("v6-hunt-cursor-listener-registered", { ok: true });
    return true;
  }

  // Enable forensic before boot chain logs so early events are persisted.
  if (isForensicQueryEnabled()) {
    activateForensic({
      packageMarker: "v6-hunt-renderer-live-boot-and-focus-qa",
    });
  }
  if (api() && typeof api().onHuntOwnerForensicEnabled === "function") {
    api().onHuntOwnerForensicEnabled((info) => {
      if (info && info.enabled) activateForensic(info);
    });
  }
  if (api() && typeof api().huntOwnerForensicEnabled === "function") {
    Promise.resolve(api().huntOwnerForensicEnabled())
      .then((info) => {
        if (info && info.enabled) activateForensic(info);
      })
      .catch(() => {});
  }

  logRendererBoot("v6-hunt-booted", {
    hasElectronApi: !!api(),
    hasNotify:
      !!(api() && typeof api().notifyPetRendererReady === "function"),
    hasOnCursorPos:
      !!(api() && typeof api().onCursorPos === "function"),
    hasRawForensic:
      !!(api() && typeof api().huntOwnerForensicEvent === "function"),
    hasVisualFocus:
      !!(api() && typeof api().reportV6HuntVisualFocus === "function"),
  });

  // Subscribe to hunt-enabled before any ready/onCursorPos path so the
  // ready-ack push (and preload buffer replay) cannot race past us.
  if (api() && typeof api().onHuntCursorEnabled === "function") {
    api().onHuntCursorEnabled((value) => {
      const next = coerceHuntEnabled(value);
      if (next === null) return;
      setEnabled(next);
      logForensic("gate", {
        event: "hunt-setting-received",
        huntEnabled: !!enabled,
        phase,
      });
    });
  }
  if (api() && typeof api().getHuntCursorEnabled === "function") {
    Promise.resolve(api().getHuntCursorEnabled())
      .then((value) => {
        const next = coerceHuntEnabled(value);
        if (next === null) return;
        setEnabled(next);
        logForensic("gate", {
          event: "hunt-setting-received",
          huntEnabled: !!enabled,
          phase,
          via: "get",
        });
      })
      .catch(() => {});
  }

  if (!ensureCursorSubscription()) {
    logRendererBoot("v6-hunt-cursor-listener-registered", { ok: false });
    try {
      setTimeout(() => ensureCursorSubscription(), 0);
    } catch (_) {}
  }

  function notifyReady(via) {
    const bridge = api();
    if (!bridge || typeof bridge.notifyPetRendererReady !== "function") {
      logRendererBoot("ready-notify-result", { ok: false, via, reason: "no-api" });
      return false;
    }
    try {
      const ok = bridge.notifyPetRendererReady({
        model: "v6",
        protocol: 1,
        via,
      });
      logRendererBoot("ready-notify-result", { ok: !!ok, via });
      return !!ok;
    } catch (_) {
      logRendererBoot("ready-notify-result", { ok: false, via, reason: "throw" });
      return false;
    }
  }

  // Handshake after cursor listener install; retry once on next task for late bridge.
  notifyReady("hunt-sync");
  try {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        ensureCursorSubscription();
        notifyReady("hunt-microtask");
        scheduleVisualFocusReports();
      });
    } else {
      setTimeout(() => {
        ensureCursorSubscription();
        notifyReady("hunt-timeout");
        scheduleVisualFocusReports();
      }, 0);
    }
  } catch (_) {
    scheduleVisualFocusReports();
  }

  try {
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("resize", () => maybeReportVisualFocus(true));
    }
  } catch (_) {}

  try {
    const body = bodyEl();
    if (body && typeof MutationObserver === "function") {
      const obs = new MutationObserver((mutations) => {
        let skinOrIdle = false;
        for (const m of mutations) {
          if (!m || m.type !== "attributes") continue;
          if (m.attributeName === "data-v6-skin") skinOrIdle = true;
          if (
            m.attributeName === "data-v6-pose" &&
            body.dataset &&
            body.dataset.v6Pose === "idle"
          ) {
            skinOrIdle = true;
          }
        }
        if (skinOrIdle) clearStatusLabelDom();
        if (isDraggingBody(body)) cancel("drag");
        else if (
          running &&
          body.dataset &&
          body.dataset.v6Pose &&
          body.dataset.v6Pose !== "hunt"
        ) {
          cancel("pose-stolen");
        }
        maybeReportVisualFocus(false);
      });
      obs.observe(body, {
        attributes: true,
        attributeFilter: ["class", "data-v6-pose", "data-v6-skin", "data-catcode-model"],
      });
    }
  } catch (_) {}

  return {
    handleCursorPos,
    setEnabled,
    cancel,
    tryStartHunt: startHunt,
    isRunning: () => running,
    isEnabled: () => enabled,
    getPhase: () => phase,
    getTriggerPhase: () => {
      if (phase === "entry" || phase === "hold") return "running";
      return phase;
    },
    isGazeActive: () => gazeActive,
    getHeadResponse: () => ({ ...head }),
    resetHeadResponse,
    reportVisualFocus: () => maybeReportVisualFocus(true),
    ARM_OUTER_PX: armOuterPx,
    TRIGGER_NEAR_PX: nearPx,
    TRIGGER_INNER_PX: nearPx,
    NEAR_DISTANCE_PX: nearPx,
    HOLD_NEAR_DISTANCE_PX: holdNearPx,
    MIN_GESTURE_SPEED_PX_S: minSpeed,
    MIN_APPROACH_SPEED_PX_S: minSpeed,
    MIN_GESTURE_PATH_PX: minGesturePathPx,
    MIN_GESTURE_SEGMENTS,
    MIN_GESTURE_TURNS,
    GESTURE_WINDOW_MS,
    GESTURE_SAMPLE_GAP_MS,
    REARM_DEBOUNCE_MS: rearmDebounceMs,
    HOLD_MAX_MS: holdMaxMs,
    COOLDOWN_MS: 0,
    FRAME_SEQUENCE,
    ENTRY_SEQUENCE,
    HOLD_FRAME,
    HUNT_ENTRY_FPS: V6_HUNT_TRIGGER_ENTRY_FPS,
    HUNT_ENTRY_FRAME_MS: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
    FRAME_DURATIONS_MS,
    HEAD_MAX_ROTATE_DEG: headMaxRotateDeg,
    HEAD_MAX_TRANSLATE_PX: headMaxTranslatePx,
  };
}

if (typeof window === "object" && window.document) {
  try {
    window.CatCodeV6Hunt = wireV6Hunt();
  } catch (err) {
    try {
      const bridge = window.electronAPI;
      if (bridge && typeof bridge.huntOwnerForensicEvent === "function") {
        bridge.huntOwnerForensicEvent({
          source: "boot",
          process: "renderer",
          event: "v6-hunt-wire-failed",
          reason: String((err && err.message) || err).slice(0, 64),
        });
      }
    } catch (_) {}
    throw err;
  }
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    ARM_OUTER_PX,
    TRIGGER_NEAR_PX,
    TRIGGER_INNER_PX,
    NEAR_DISTANCE_PX,
    HOLD_NEAR_DISTANCE_PX,
    MIN_GESTURE_SPEED_PX_S,
    MIN_APPROACH_SPEED_PX_S,
    MIN_GESTURE_PATH_PX,
    MIN_GESTURE_SEGMENTS,
    MIN_GESTURE_TURNS,
    GESTURE_WINDOW_MS,
    GESTURE_SAMPLE_GAP_MS,
    REARM_DEBOUNCE_MS,
    HOLD_MAX_MS,
    COOLDOWN_MS,
    CURSOR_POLL_NEAR_BAND_PX,
    CURSOR_POLL_NEAR_MS,
    CURSOR_POLL_FAR_MS,
    FRAME_SEQUENCE,
    ENTRY_SEQUENCE,
    HOLD_FRAME,
    HUNT_ENTRY_FPS: V6_HUNT_TRIGGER_ENTRY_FPS,
    HUNT_ENTRY_FRAME_MS: V6_HUNT_TRIGGER_ENTRY_FRAME_MS,
    FRAME_DURATIONS_MS,
    HEAD_MAX_ROTATE_DEG,
    HEAD_MAX_TRANSLATE_PX,
    cursorPollIntervalMs,
    wireV6Hunt,
  };
}
