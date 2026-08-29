"use strict";

// V6 angry wellness reaction: an exclusive, short-lived red idle variant.
const ANGRY_DURATION_MS = 12_000;

function createV6Angry({
  body = typeof document !== "undefined" ? document.body : null,
  document: doc = typeof document !== "undefined" ? document : null,
  durationMs = ANGRY_DURATION_MS,
} = {}) {
  let timer = null;
  let ready = false;

  function isV6() {
    return !!(
      body &&
      body.dataset &&
      (body.dataset.catcodeModel === "v6-idle-preview" || body.dataset.catcodeModelLatched === "1")
    );
  }

  function isIdle() {
    return !!(body && body.dataset && body.dataset.v6Pose === "idle");
  }

  function runtimeWindow() {
    return typeof globalThis !== "undefined" ? globalThis : null;
  }

  function ensureIdleForAngry() {
    if (isIdle()) return true;
    const win = runtimeWindow();
    const reset = win && win.CatCodeV6ExclusivePoseReset;
    if (reset && typeof reset.resetForReturn === "function") {
      reset.resetForReturn("angry");
    }
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && typeof pose.wakeToIdle === "function") {
      pose.wakeToIdle("angry");
    }
    return isIdle();
  }

  function leave() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (body && body.dataset) delete body.dataset.v6Angry;
    return true;
  }

  function enter(nextDurationMs = durationMs) {
    if (!isV6() || !ready || !ensureIdleForAngry()) return false;
    leave();
    body.dataset.v6Angry = "1";
    timer = setTimeout(leave, Math.max(1, Number(nextDurationMs) || durationMs));
    return true;
  }

  function start() {
    const host = doc && doc.getElementById ? doc.getElementById("v6-angry-idle") : null;
    if (!host || !host.dataset || !host.dataset.src) return;
    const markReady = () => { ready = true; };
    const markError = () => { ready = false; leave(); };
    if (typeof host.addEventListener === "function") {
      host.addEventListener("load", markReady, { once: true });
      host.addEventListener("error", markError, { once: true });
    }
    host.src = host.dataset.src;
    host.hidden = false;
    if (host.complete && host.naturalWidth > 0) markReady();
  }

  return { start, enter, leave, isReady: () => ready, isActive: () => !!(body && body.dataset && body.dataset.v6Angry === "1") };
}

if (typeof module === "object" && module.exports) {
  module.exports = { ANGRY_DURATION_MS, createV6Angry };
}

if (typeof window === "object" && window.document) {
  const api = createV6Angry({ body: document.body, document });
  window.CatCodeV6Angry = api;
  api.start();
}
