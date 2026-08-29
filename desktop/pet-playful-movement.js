"use strict";

const WALK_DURATION_MS = 4800;
const ROAM_JUMP_CROUCH_MS = 180;
const ROAM_JUMP_FLIGHT_MS = 1120;
const CURSOR_CHASE_MIN_MS = 720;
const CURSOR_CHASE_TIMEOUT_MS = 2600;
const CURSOR_POUNCE_MS = 480;
const CURSOR_CARRY_MS = 2600;
const CURSOR_RELEASE_MS = 1200;
const CURSOR_CAUGHT_COPY_HOLD_MS = 900;
const CURSOR_RESTORED_COPY_HOLD_MS = 1400;
const V6_TEASE_APPROACH_MIN_MS = 360;
const V6_TEASE_APPROACH_MAX_MS = 900;
const TICK_MS = 50;
const AUTO_WALK_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
// The first opt-in cursor-theft opportunity is scheduled after 60–120 seconds.
// Keep the activity window at least that long so an owner who has just been
// using the desktop can actually receive the first playful event.
const AUTO_CURSOR_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const AUTO_ROAM_MIN_MS = 45_000;
const AUTO_ROAM_MAX_MS = 90_000;
const POST_WALK_REARM_MS = 20_000;

// Stage A: V4 has no approved roam / cursor-theft art. Cursor theft stays off
// unless tests pass allowPlayfulMotion: true. V6-M9 may enable walk-only via
// allowWalkMotion without re-enabling cursor theft.
const STAGE_A_DISABLE_PLAYFUL_MOTION = true;

function getTheftCopyForensic() {
  try {
    return require("./cursor-theft-copy-forensic").getCursorTheftCopyForensic();
  } catch (_) {
    return null;
  }
}

function forensicRecord(source, payload) {
  try {
    const forensic = getTheftCopyForensic();
    if (forensic && forensic.enabled) forensic.record(source, payload);
  } catch (_) {}
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from, to, progress) {
  return Math.round(from + (to - from) * progress);
}

function easeInOutSine(progress) {
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}

function randomBetween(random, min, max) {
  return Math.round(min + random() * (max - min));
}

function createPetPlayfulMovementController({
  getPetWindow,
  getCanMove = () => true,
  constrainBounds = (bounds) => bounds,
  constrainMotionBounds = constrainBounds,
  getMotionWindowSize = (bounds) => ({
    width: bounds.width,
    height: bounds.height,
  }),
  setCurrentPetPosition = () => {},
  saveSettings = () => {},
  updateShareCaptureForPetBounds = () => {},
  getRoamingEnabled = () => false,
  getCursorStealingEnabled = () => false,
  getCursorPoint = () => null,
  cursorWarp,
  now = Date.now,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  setTicker = setInterval,
  clearTicker = clearInterval,
  allowPlayfulMotion = !STAGE_A_DISABLE_PLAYFUL_MOTION,
  // Walk may be enabled for V6 while cursor theft remains Stage-A gated.
  allowWalkMotion = allowPlayfulMotion,
  // V6 teaser approaches the pointer visually but never warps it.
  allowCursorApproach = false,
  // V6 may opt into cursor theft. The user's existing cursor-theft preference
  // still decides whether it happens automatically; the tray command is manual.
  allowCursorTheft = false,
} = {}) {
  let started = false;
  let roamTimer = null;
  let cursorTimer = null;
  let movementTicker = null;
  let phaseTimer = null;
  let activeMode = null;
  let originalCursor = null;
  let restingWindowSize = null;
  let lastActivityAt = now();
  let lastWalkEndedAt = -Infinity;

  function resolveFlag(value) {
    try {
      return typeof value === "function" ? !!value() : !!value;
    } catch (_) {
      return false;
    }
  }

  function walkMotionEnabled() {
    return resolveFlag(allowWalkMotion) && getRoamingEnabled();
  }

  function roamingEnabled() {
    // Jump still shares the walk gate; cursor theft uses a separate flag.
    return walkMotionEnabled();
  }

  function cursorStealingEnabled() {
    return (
      getCursorStealingEnabled() &&
      (resolveFlag(allowPlayfulMotion) || resolveFlag(allowCursorTheft))
    );
  }

  function cursorApproachEnabled() {
    return resolveFlag(allowCursorApproach);
  }

  function cursorTheftEnabled(manual) {
    return cursorStealingEnabled() || (!!manual && resolveFlag(allowCursorTheft));
  }

  function petWindow() {
    const window = typeof getPetWindow === "function" ? getPetWindow() : null;
    return window && !window.isDestroyed() ? window : null;
  }

  function send(payload) {
    const window = petWindow();
    if (window) window.webContents.send("pet-playful-movement", payload);
    forensicRecord("main-send", {
      phase: payload && payload.phase ? String(payload.phase) : payload && payload.active ? "active" : "inactive",
      active: !!(payload && payload.active),
      mode: payload && payload.mode ? String(payload.mode) : "",
      warpedFlag: !!(payload && payload.cursorWarped),
    });
  }

  function clearMotionTimers() {
    if (movementTicker) clearTicker(movementTicker);
    if (phaseTimer) clearTimer(phaseTimer);
    movementTicker = null;
    phaseTimer = null;
  }

  let cursorWasWarped = false;

  function restoreCursor() {
    if (!originalCursor || !cursorWarp || !cursorWarp.isAvailable()) {
      originalCursor = null;
      forensicRecord("main-restore", { restoreOk: false, announce: false });
      return false;
    }
    const restored = cursorWarp.moveTo(originalCursor.x, originalCursor.y);
    const shouldAnnounce = cursorWasWarped && restored;
    originalCursor = null;
    cursorWasWarped = false;
    forensicRecord("main-restore", {
      restoreOk: !!restored,
      announce: !!shouldAnnounce,
    });
    if (shouldAnnounce) {
      send({ active: true, mode: "cursor", phase: "restored" });
    }
    return restored;
  }

  function motionBounds(bounds) {
    const constrained = constrainMotionBounds(bounds);
    return constrained || bounds;
  }

  function prepareMotionWindow(window) {
    const current = window.getBounds();
    if (restingWindowSize) return current;
    const requested = getMotionWindowSize(current) || current;
    const width = Math.max(
      current.width,
      Math.round(Number(requested.width) || current.width),
    );
    const height = Math.max(
      current.height,
      Math.round(Number(requested.height) || current.height),
    );
    restingWindowSize = { width: current.width, height: current.height };
    const expanded = motionBounds({
      ...current,
      x: Math.round(current.x + (current.width - width) / 2),
      y: Math.round(current.y + (current.height - height) / 2),
      width,
      height,
    });
    applyWindowBounds(window, expanded);
    return expanded;
  }

  function restoreMotionWindow(window) {
    if (!restingWindowSize) return window.getBounds();
    const current = window.getBounds();
    const targetSize = restingWindowSize;
    restingWindowSize = null;
    const restored = constrainBounds({
      ...current,
      x: Math.round(current.x + (current.width - targetSize.width) / 2),
      y: Math.round(current.y + (current.height - targetSize.height) / 2),
      width: targetSize.width,
      height: targetSize.height,
    });
    applyWindowBounds(window, restored);
    return restored;
  }

  function finish({ restore = false, persist = true } = {}) {
    clearMotionTimers();
    const cursorRestored = restore && restoreCursor();
    const window = petWindow();
    if (window && persist) {
      const bounds = restoreMotionWindow(window);
      setCurrentPetPosition({ x: bounds.x, y: bounds.y });
      updateShareCaptureForPetBounds(bounds, { forceKeyframe: true });
      saveSettings({ sync: false });
    }
    if (activeMode === "walk" || activeMode === "jump") {
      lastWalkEndedAt = now();
    }
    activeMode = null;
    if (cursorRestored) {
      phaseTimer = setTimer(() => {
        phaseTimer = null;
        send({ active: false });
      }, CURSOR_RESTORED_COPY_HOLD_MS);
      return;
    }
    send({ active: false });
  }

  function cancel(options = {}) {
    if (!activeMode && !originalCursor && !restingWindowSize) {
      // Still broadcast idle so a stale renderer walk pose can clear.
      send({ active: false });
      return false;
    }
    finish({ restore: options.restoreCursor !== false, persist: true });
    return true;
  }

  function canBegin(mode, manual) {
    const window = petWindow();
    if (
      !window ||
      !window.isVisible() ||
      !getCanMove({ active: false, manual: !!manual })
    ) {
      return false;
    }
    // A manual command is an explicit request. Restart a stale or currently
    // running playful action instead of silently ignoring the click.
    if (activeMode) {
      if (!manual) return false;
      cancel({ restoreCursor: true });
    }
    if (manual) return true;
    const activityAge = now() - lastActivityAt;
    return mode === "cursor"
      ? activityAge <= AUTO_CURSOR_ACTIVE_WINDOW_MS
      : activityAge <= AUTO_WALK_ACTIVE_WINDOW_MS;
  }

  function applyWindowBounds(window, next) {
    window.setBounds(next, false);
    setCurrentPetPosition({ x: next.x, y: next.y });
  }

  function animateWindow(
    from,
    to,
    duration,
    onTick,
    onDone,
    { easing = easeInOutSine, arcHeight = 0, manual = false } = {},
  ) {
    const startedAt = now();
    movementTicker = setTicker(() => {
      const window = petWindow();
      if (!window || !getCanMove({ active: true, manual })) {
        finish({ restore: activeMode === "cursor" });
        return;
      }
      const progress = clamp((now() - startedAt) / duration, 0, 1);
      const eased = easing(progress);
      const next = motionBounds({
        ...from,
        x: lerp(from.x, to.x, eased),
        y:
          lerp(from.y, to.y, eased) -
          Math.round(Math.sin(Math.PI * progress) * arcHeight),
      });
      applyWindowBounds(window, next);
      if (typeof onTick === "function") onTick(next, progress);
      if (progress >= 1) {
        clearTicker(movementTicker);
        movementTicker = null;
        onDone(next);
      }
    }, TICK_MS);
  }

  function walkNow({ manual = false } = {}) {
    if (!roamingEnabled() || !canBegin("walk", manual)) return false;
    const window = petWindow();
    const from = prepareMotionWindow(window);
    const distance = randomBetween(random, 170, 420) * (random() < 0.5 ? -1 : 1);
    const target = motionBounds({ ...from, x: from.x + distance });
    if (!target || Math.abs(target.x - from.x) < 24) {
      restoreMotionWindow(window);
      return false;
    }
    activeMode = "walk";
    send({
      active: true,
      mode: "walk",
      phase: "moving",
      direction: target.x < from.x ? "left" : "right",
      pose: "side",
    });
    animateWindow(from, target, WALK_DURATION_MS, null, () => finish());
    return true;
  }

  function jumpNow({ manual = false } = {}) {
    if (!roamingEnabled() || !canBegin("jump", manual)) return false;
    const window = petWindow();
    const from = prepareMotionWindow(window);
    const distance = randomBetween(random, 120, 280) * (random() < 0.5 ? -1 : 1);
    const vertical = randomBetween(random, -45, 35);
    const target = motionBounds({
      ...from,
      x: from.x + distance,
      y: from.y + vertical,
    });
    if (!target || Math.abs(target.x - from.x) < 36) {
      restoreMotionWindow(window);
      return false;
    }
    const direction = target.x < from.x ? "left" : "right";
    activeMode = "jump";
    send({ active: true, mode: "jump", phase: "crouch", direction });
    phaseTimer = setTimer(() => {
      phaseTimer = null;
      send({ active: true, mode: "jump", phase: "flight", direction });
      let landingSent = false;
      animateWindow(
        from,
        target,
        ROAM_JUMP_FLIGHT_MS,
        (_bounds, progress) => {
          if (!landingSent && progress >= 0.76) {
            landingSent = true;
            send({ active: true, mode: "jump", phase: "landing", direction });
          }
        },
        () => finish(),
        {
          arcHeight: Math.max(38, Math.round(from.height * 0.2)),
        },
      );
    }, ROAM_JUMP_CROUCH_MS);
    return true;
  }

  function roamNow() {
    return walkNow();
  }

  function approachCursorNow({ manual = false } = {}) {
    if (!cursorApproachEnabled() || !canBegin("tease-approach", manual)) return false;
    const cursor = getCursorPoint();
    if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return false;
    const window = petWindow();
    const from = prepareMotionWindow(window);
    const target = cursorTargetBounds(from, cursor);
    if (!target) {
      restoreMotionWindow(window);
      return false;
    }
    const distance = Math.hypot(target.x - from.x, target.y - from.y);
    const duration = clamp(
      Math.round(distance * 1.7),
      V6_TEASE_APPROACH_MIN_MS,
      V6_TEASE_APPROACH_MAX_MS,
    );
    activeMode = "tease-approach";
    animateWindow(from, target, duration, null, () => finish(), { manual });
    return true;
  }

  function cursorCarryTarget(bounds, cursor) {
    const distance = randomBetween(random, 520, 760);
    const vertical = randomBetween(random, -130, 110);
    // Pick the direction with the largest usable travel after display bounds
    // are applied. A random direction could previously clamp at the nearest
    // edge and make a "stolen" pointer appear to move only a few pixels.
    const candidates = [-distance, distance].map((horizontal) =>
      motionBounds({
        ...bounds,
        x: bounds.x + horizontal,
        y: bounds.y + vertical,
      }),
    );
    return candidates.reduce((best, candidate) => {
      const bestDistance = Math.hypot(best.x - bounds.x, best.y - bounds.y);
      const candidateDistance = Math.hypot(
        candidate.x - bounds.x,
        candidate.y - bounds.y,
      );
      return candidateDistance > bestDistance ? candidate : best;
    });
  }

  function cursorTargetBounds(bounds, cursor) {
    return motionBounds({
      ...bounds,
      x: Math.round(cursor.x - bounds.width / 2),
      y: Math.round(cursor.y - bounds.height * 0.54),
    });
  }

  function pounceAtCursor(from, fallbackCursor, manual = false) {
    const cursor = getCursorPoint() || fallbackCursor;
    if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
      finish({ restore: false });
      return;
    }
    const target = cursorTargetBounds(from, cursor);
    const direction = target.x < from.x ? "left" : "right";
    send({ active: true, mode: "cursor", phase: "pounce", direction });
    animateWindow(
      from,
      target,
      CURSOR_POUNCE_MS,
      null,
      (caughtBounds) => {
        const caughtCursor = getCursorPoint() || cursor;
        originalCursor = { x: caughtCursor.x, y: caughtCursor.y };
        const warped = cursorWarp.moveTo(
          caughtBounds.x + Math.round(caughtBounds.width / 2),
          caughtBounds.y + Math.round(caughtBounds.height * 0.54),
        );
        forensicRecord("main-warp", { warpOk: !!warped });
        if (!warped) {
          originalCursor = null;
          finish({ restore: false });
          return;
        }
        cursorWasWarped = true;
        send({
          active: true,
          mode: "cursor",
          phase: "caught",
          direction,
          cursorWarped: true,
        });
        // Let the caught frame read before the carried pointer starts moving.
        phaseTimer = setTimer(() => {
          phaseTimer = null;
          const targetBounds = cursorCarryTarget(caughtBounds, caughtCursor);
          const carryDirection = targetBounds.x < caughtBounds.x ? "left" : "right";
          send({
            active: true,
            mode: "cursor",
            phase: "carry",
            direction: carryDirection,
            pose: "side",
          });
          animateWindow(
            caughtBounds,
            targetBounds,
            CURSOR_CARRY_MS,
            (bounds) => {
              cursorWarp.moveTo(
                bounds.x + Math.round(bounds.width / 2),
                bounds.y + Math.round(bounds.height * 0.54),
              );
            },
            () => {
              send({
                active: true,
                mode: "cursor",
                phase: "release",
                direction: carryDirection,
              });
              phaseTimer = setTimer(() => finish({ restore: true }), CURSOR_RELEASE_MS);
            },
            { manual },
          );
        }, CURSOR_CAUGHT_COPY_HOLD_MS);
      },
      { arcHeight: Math.max(24, Math.round(from.height * 0.12)), manual },
    );
  }

  function chaseCursor(from, initialCursor, manual = false) {
    const startedAt = now();
    let lastDirection = initialCursor.x < from.x + from.width / 2 ? "left" : "right";
    movementTicker = setTicker(() => {
      const window = petWindow();
      if (!window || !getCanMove({ active: true, manual })) {
        finish({ restore: false });
        return;
      }
      const cursor = getCursorPoint() || initialCursor;
      if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
        finish({ restore: false });
        return;
      }
      const current = window.getBounds();
      const target = cursorTargetBounds(current, cursor);
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      const direction = dx < 0 ? "left" : "right";
      if (direction !== lastDirection) {
        lastDirection = direction;
        send({
          active: true,
          mode: "cursor",
          phase: "stalk",
          direction,
          pose: "side",
        });
      }
      const elapsed = now() - startedAt;
      const captureDistance = Math.max(36, current.width * 0.16);
      if (
        (elapsed >= CURSOR_CHASE_MIN_MS && distance <= captureDistance) ||
        elapsed >= CURSOR_CHASE_TIMEOUT_MS
      ) {
        clearTicker(movementTicker);
        movementTicker = null;
        pounceAtCursor(current, cursor, manual);
        return;
      }
      const step = clamp(distance * 0.18, 6, 28);
      const ratio = distance > 0 ? Math.min(1, step / distance) : 1;
      const next = motionBounds({
        ...current,
        x: Math.round(current.x + dx * ratio),
        y: Math.round(current.y + dy * ratio),
      });
      applyWindowBounds(window, next);
    }, TICK_MS);
  }

  function stealCursorNow({ manual = false } = {}) {
    if (
      !cursorTheftEnabled(manual) ||
      !cursorWarp ||
      !cursorWarp.isAvailable() ||
      !canBegin("cursor", manual)
    ) {
      return false;
    }
    const cursor = getCursorPoint();
    if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
      return false;
    }
    const window = petWindow();
    const from = prepareMotionWindow(window);
    activeMode = "cursor";
    originalCursor = null;
    cursorWasWarped = false;
    send({
      active: true,
      mode: "cursor",
      phase: "stalk",
      direction: cursor.x < from.x + from.width / 2 ? "left" : "right",
      pose: "side",
    });
    chaseCursor(from, cursor, manual);
    return true;
  }

  function clearScheduleTimers() {
    if (roamTimer) clearTimer(roamTimer);
    if (cursorTimer) clearTimer(cursorTimer);
    roamTimer = null;
    cursorTimer = null;
  }

  function scheduleRoam(initial = false) {
    if (!started || !roamingEnabled()) return;
    const base = randomBetween(random, AUTO_ROAM_MIN_MS, AUTO_ROAM_MAX_MS);
    const sinceWalk = now() - lastWalkEndedAt;
    const rearmWait =
      lastWalkEndedAt > 0 && sinceWalk < POST_WALK_REARM_MS
        ? POST_WALK_REARM_MS - sinceWalk
        : 0;
    // Initial delay stays in the same calm band; never burst after a walk.
    const delay = base + rearmWait + (initial ? 0 : 0);
    roamTimer = setTimer(() => {
      roamTimer = null;
      roamNow();
      scheduleRoam(false);
    }, delay);
  }

  function scheduleCursor(initial = false) {
    if (!started || !cursorStealingEnabled() || !cursorWarp?.isAvailable()) {
      return;
    }
    const delay = initial
      ? randomBetween(random, 60_000, 120_000)
      : randomBetween(random, 8 * 60_000, 18 * 60_000);
    cursorTimer = setTimer(() => {
      cursorTimer = null;
      stealCursorNow();
      scheduleCursor(false);
    }, delay);
  }

  function refresh() {
    clearScheduleTimers();
    if (!roamingEnabled() && ["walk", "jump"].includes(activeMode)) cancel();
    if (!cursorStealingEnabled() && activeMode === "cursor") {
      cancel({ restoreCursor: true });
    }
    scheduleRoam(true);
    scheduleCursor(true);
  }

  function start() {
    if (started) return;
    started = true;
    lastActivityAt = now();
    refresh();
  }

  function stop() {
    started = false;
    clearScheduleTimers();
    cancel({ restoreCursor: true });
    if (cursorWarp) cursorWarp.stop();
  }

  function recordActivity() {
    lastActivityAt = now();
  }

  return {
    cancel,
    approachCursorNow,
    isCursorWarpAvailable: () => !!cursorWarp?.isAvailable(),
    jumpNow,
    recordActivity,
    refresh,
    roamNow,
    start,
    stealCursorNow,
    stop,
    walkNow,
  };
}

module.exports = {
  AUTO_CURSOR_ACTIVE_WINDOW_MS,
  AUTO_WALK_ACTIVE_WINDOW_MS,
  AUTO_ROAM_MIN_MS,
  AUTO_ROAM_MAX_MS,
  POST_WALK_REARM_MS,
  WALK_DURATION_MS,
  CURSOR_CHASE_TIMEOUT_MS,
  V6_TEASE_APPROACH_MIN_MS,
  V6_TEASE_APPROACH_MAX_MS,
  ROAM_JUMP_CROUCH_MS,
  ROAM_JUMP_FLIGHT_MS,
  STAGE_A_DISABLE_PLAYFUL_MOTION,
  createPetPlayfulMovementController,
};
