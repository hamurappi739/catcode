"use strict";

// Idle inactivity sleep state and wake transition.

const IDLE_SLEEP_TIMEOUT_MS = 15_000;
const IDLE_SLEEP_RETRY_MS = 1000;
const IDLE_WAKE_RETURN_MS = 620;
const SLEEP_POSE_READY_TIMEOUT_MS = 8_000;

function isV4Body(body) {
  return !!(body && body.dataset && body.dataset.catcodeModel === "v4");
}

function syncV4Pose(body) {
  const owner =
    typeof window !== "undefined" ? window.CatCodeV4VisualState : null;
  if (owner && typeof owner.syncV4VisualState === "function") {
    owner.syncV4VisualState(body);
  }
}

/**
 * Prove the sleep <object> has a usable SVG document — not merely a pending
 * lazy data= assignment with an empty contentDocument.
 */
function isSleepPoseDocumentReady(doc) {
  if (!doc || !doc.documentElement) return false;
  const root = doc.documentElement;
  if (
    typeof root.getAttribute === "function" &&
    root.getAttribute("data-v4-sleep-pose") === "1"
  ) {
    return true;
  }
  if (typeof doc.querySelector === "function") {
    return !!doc.querySelector(
      'rect.v4-pixel, #cat-content, [data-v4-sleep-pose="1"]',
    );
  }
  return false;
}

function createIdleSleepMotion({
  body = document.body,
  ensureSvgObjectReady,
  getSvgObjectElement,
  shouldBlockSleep,
  setIdleSvgClass,
  stopHuntingPose,
  stopPurring,
  sleepPoseReadyTimeoutMs = SLEEP_POSE_READY_TIMEOUT_MS,
} = {}) {
  let idleTimer = null;
  let wakeTimer = null;
  let sleeping = false;
  let waitEpoch = 0;
  let pendingCleanup = null;
  let pendingTimeout = null;

  function clearIdleTimer() {
    if (!idleTimer) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function hasPendingSleepWait() {
    return pendingCleanup !== null || pendingTimeout !== null;
  }

  function cancelPendingSleepWait() {
    waitEpoch += 1;
    if (pendingCleanup) {
      pendingCleanup();
      pendingCleanup = null;
    }
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
  }

  function settlePendingSleepWait() {
    if (pendingCleanup) {
      pendingCleanup();
      pendingCleanup = null;
    }
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    waitEpoch += 1;
  }

  function resolveSleepPoseElement() {
    if (typeof getSvgObjectElement === "function") {
      return getSvgObjectElement("sleep-pose");
    }
    if (typeof document !== "undefined" && document.getElementById) {
      return document.getElementById("sleep-pose");
    }
    return null;
  }

  function readSleepPoseDocument() {
    if (typeof ensureSvgObjectReady === "function") {
      return ensureSvgObjectReady("sleep-pose");
    }
    const el = resolveSleepPoseElement();
    return el && el.contentDocument ? el.contentDocument : null;
  }

  function schedule(delayMs = IDLE_SLEEP_TIMEOUT_MS) {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      sleep();
    }, delayMs);
  }

  function commitV4Sleep() {
    clearTimeout(wakeTimer);
    wakeTimer = null;
    delete body.dataset.idleWake;
    body.dataset.idleSleep = "1";
    if (typeof setIdleSvgClass === "function") {
      setIdleSvgClass("idle-sleep-return", false);
      setIdleSvgClass("idle-sleep", false);
    }
    syncV4Pose(body);
    sleeping = true;
  }

  function attachSleepPoseReadyWait(epoch) {
    const el = resolveSleepPoseElement();
    let settled = false;
    let rafId = null;

    function cleanup() {
      if (settled) return;
      settled = true;
      if (el && typeof el.removeEventListener === "function") {
        el.removeEventListener("load", onLoad);
      }
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
      }
      rafId = null;
    }

    function tryCommitFromReady() {
      if (epoch !== waitEpoch) return;
      if (sleeping) return;
      if (typeof shouldBlockSleep === "function" && shouldBlockSleep()) {
        cancelPendingSleepWait();
        schedule(IDLE_SLEEP_RETRY_MS);
        return;
      }
      const doc = readSleepPoseDocument();
      if (!isSleepPoseDocumentReady(doc)) return;
      settlePendingSleepWait();
      commitV4Sleep();
    }

    function onLoad() {
      tryCommitFromReady();
    }

    if (el && typeof el.addEventListener === "function") {
      el.addEventListener("load", onLoad);
    }
    if (typeof requestAnimationFrame === "function") {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        tryCommitFromReady();
      });
    } else {
      tryCommitFromReady();
    }

    pendingTimeout = setTimeout(() => {
      if (epoch !== waitEpoch) return;
      cancelPendingSleepWait();
      // Stay awake/idle; retry only through the normal sleep schedule.
      schedule(IDLE_SLEEP_RETRY_MS);
    }, sleepPoseReadyTimeoutMs);

    pendingCleanup = cleanup;
  }

  function sleep() {
    if (sleeping) return false;
    cancelPendingSleepWait();
    if (typeof shouldBlockSleep === "function" && shouldBlockSleep()) {
      schedule(IDLE_SLEEP_RETRY_MS);
      return false;
    }
    if (typeof stopHuntingPose === "function") stopHuntingPose();
    if (typeof stopPurring === "function") stopPurring();
    const v4 = isV4Body(body);
    if (v4) {
      // Stage S-base: never hide #cat until #sleep-pose has a usable SVG.
      if (typeof ensureSvgObjectReady === "function") {
        ensureSvgObjectReady("sleep-pose");
        ensureSvgObjectReady("cat");
      }
      const readyDoc = readSleepPoseDocument();
      if (isSleepPoseDocumentReady(readyDoc)) {
        commitV4Sleep();
        return true;
      }
      const epoch = waitEpoch;
      attachSleepPoseReadyWait(epoch);
      return false;
    }
    if (typeof ensureSvgObjectReady === "function") ensureSvgObjectReady("cat");
    clearTimeout(wakeTimer);
    wakeTimer = null;
    delete body.dataset.idleWake;
    body.dataset.idleSleep = "1";
    if (typeof setIdleSvgClass === "function") {
      setIdleSvgClass("idle-sleep-return", false);
      setIdleSvgClass("idle-sleep", true);
    }
    sleeping = true;
    return true;
  }

  function wake() {
    cancelPendingSleepWait();
    clearIdleTimer();
    if (!sleeping) {
      schedule();
      return false;
    }
    sleeping = false;
    delete body.dataset.idleSleep;
    const v4 = isV4Body(body);
    if (v4) {
      // Wake restores normal V4 idle. Do not wire the staged wake SVG yet.
      if (typeof ensureSvgObjectReady === "function") ensureSvgObjectReady("cat");
      delete body.dataset.idleWake;
      if (typeof setIdleSvgClass === "function") {
        setIdleSvgClass("idle-sleep", false);
        setIdleSvgClass("idle-sleep-return", false);
      }
      syncV4Pose(body);
      schedule();
      return true;
    }
    body.dataset.idleWake = "1";
    if (typeof setIdleSvgClass === "function") {
      setIdleSvgClass("idle-sleep", false);
      setIdleSvgClass("idle-sleep-return", true);
    }
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      delete body.dataset.idleWake;
      if (typeof setIdleSvgClass === "function")
        setIdleSvgClass("idle-sleep-return", false);
    }, IDLE_WAKE_RETURN_MS);
    schedule();
    return true;
  }

  function recordActivity({ wakeSleeping = true } = {}) {
    cancelPendingSleepWait();
    if (sleeping) return wakeSleeping ? wake() : false;
    schedule();
    return false;
  }

  function stop() {
    cancelPendingSleepWait();
    clearIdleTimer();
    clearTimeout(wakeTimer);
    wakeTimer = null;
    sleeping = false;
    delete body.dataset.idleSleep;
    delete body.dataset.idleWake;
    if (typeof setIdleSvgClass === "function") {
      setIdleSvgClass("idle-sleep", false);
      setIdleSvgClass("idle-sleep-return", false);
    }
    syncV4Pose(body);
  }

  return {
    isSleeping: () => sleeping,
    isSleepPending: () => hasPendingSleepWait(),
    recordPassiveActivity: () => recordActivity(),
    recordActivity,
    schedule,
    sleep,
    stop,
    wake,
  };
}

module.exports = {
  createIdleSleepMotion,
  isSleepPoseDocumentReady,
  IDLE_SLEEP_TIMEOUT_MS,
  IDLE_SLEEP_RETRY_MS,
  SLEEP_POSE_READY_TIMEOUT_MS,
};
