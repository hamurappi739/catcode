"use strict";

// V4 Stage S-eye.1: rare one-eye sleep check (single face-side socket).
// Does not wake, does not enable gaze/blink, does not switch pose art.
// Executable side script (loaded from index.html). Timer ownership lives here.

(() => {
  const BODY_PEEK_ATTR = "data-v4-sleep-peek";
  const SVG_PEEK_ATTR = "data-v4-sleep-peek";
  const PEEK_VALUE = "face";
  const OPEN_MS = 2000;
  // Calm delay after sleep is stable before the first check.
  const FIRST_MIN_MS = 18_000;
  const FIRST_MAX_MS = 32_000;
  // Infrequent subsequent checks.
  const NEXT_MIN_MS = 48_000;
  const NEXT_MAX_MS = 96_000;

  const BLOCKING_BODY_ATTRS = [
    "data-purring",
    "data-idle-wake",
    "data-hunting",
    "data-hunting-return",
    "data-pet-roaming",
    "data-cursor-stolen",
    "data-music-dance",
    "data-v4-dance-active",
    "data-pet-peek",
    "data-typing",
    "data-press",
    "data-scroll",
    "data-jump",
    "data-stretching",
    "data-drinking",
    "data-speech",
    "data-reminder-form",
    "data-reminder-jump",
    "data-editing-name",
    "data-editing-user-name",
    "data-editing-fixed-message",
    "data-editing-pomodoro-focus",
    "data-editing-wellness-interval",
    "data-editing-share-duration",
  ];

  let scheduleTimer = null;
  let openTimer = null;
  let started = false;
  let peeking = false;
  let reducedMotion = false;
  let bodyObserver = null;
  let epoch = 0;

  function body() {
    return document.body;
  }

  function prefersReducedMotion() {
    try {
      return (
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (_) {
      return false;
    }
  }

  function randomBetween(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function isSleeping() {
    const b = body();
    return !!(b && b.dataset && b.dataset.idleSleep);
  }

  function isV6Latched() {
    const b = body();
    return !!(
      b &&
      b.dataset &&
      (b.dataset.catcodeModelLatched === "1" ||
        b.dataset.catcodeModel === "v6-idle-preview")
    );
  }

  function isBlocked() {
    const b = body();
    if (!b) return true;
    if (b.classList && b.classList.contains("dragging")) return true;
    if (b.hidden || b.getAttribute("aria-hidden") === "true") return true;
    for (const attr of BLOCKING_BODY_ATTRS) {
      if (b.hasAttribute(attr)) return true;
    }
    if (b.dataset.speech && b.dataset.speech !== "fixed") return true;
    return false;
  }

  function sleepSvgRoot() {
    const obj = document.getElementById("sleep-pose");
    if (!obj) return null;
    try {
      const doc = obj.contentDocument || (obj.getSVGDocument && obj.getSVGDocument());
      return doc && doc.documentElement ? doc.documentElement : null;
    } catch (_) {
      return null;
    }
  }

  function clearTimers() {
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  }

  function clearPeekVisual() {
    const b = body();
    if (b) delete b.dataset.v4SleepPeek;
    const root = sleepSvgRoot();
    if (root && root.removeAttribute) root.removeAttribute(SVG_PEEK_ATTR);
    peeking = false;
  }

  function cancel(reason) {
    epoch += 1;
    clearTimers();
    clearPeekVisual();
    return reason || "cancel";
  }

  function scheduleNext(delayMs) {
    clearTimers();
    if (isV6Latched() || reducedMotion || !isSleeping() || isBlocked()) return;
    const wait = delayMs != null ? delayMs : randomBetween(NEXT_MIN_MS, NEXT_MAX_MS);
    const token = epoch;
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      if (token !== epoch) return;
      tryOpenPeek();
    }, wait);
  }

  function finishPeek(token) {
    if (token !== epoch) return;
    clearPeekVisual();
    openTimer = null;
    if (!isSleeping() || isBlocked() || reducedMotion) return;
    scheduleNext();
  }

  function tryOpenPeek() {
    if (isV6Latched()) return cancel("v6-latched");
    if (reducedMotion) return cancel("reduced-motion");
    if (!isSleeping() || isBlocked()) {
      cancel("ineligible");
      if (isSleeping() && !reducedMotion) scheduleNext(randomBetween(8000, 14000));
      return;
    }
    const root = sleepSvgRoot();
    if (!root) {
      scheduleNext(randomBetween(4000, 8000));
      return;
    }
    const token = epoch;
    peeking = true;
    body().dataset.v4SleepPeek = PEEK_VALUE;
    root.setAttribute(SVG_PEEK_ATTR, PEEK_VALUE);
    openTimer = setTimeout(() => finishPeek(token), OPEN_MS);
  }

  function onSleepStateChanged() {
    // V6-M1 owns sleep peek visually while the white model is latched.
    if (isV6Latched()) {
      cancel("v6-latched");
      return;
    }
    if (!isSleeping()) {
      cancel("wake");
      return;
    }
    if (reducedMotion) {
      cancel("reduced-motion");
      return;
    }
    if (isBlocked()) {
      cancel("blocked");
      scheduleNext(randomBetween(10000, 18000));
      return;
    }
    if (!peeking && !scheduleTimer && !openTimer) {
      scheduleNext(randomBetween(FIRST_MIN_MS, FIRST_MAX_MS));
    }
  }

  function syncReducedMotion() {
    const next = prefersReducedMotion();
    if (next === reducedMotion) return;
    reducedMotion = next;
    if (reducedMotion) cancel("reduced-motion");
    else onSleepStateChanged();
  }

  function start() {
    if (started) return;
    started = true;
    reducedMotion = prefersReducedMotion();
    if (typeof matchMedia === "function") {
      try {
        const mq = matchMedia("(prefers-reduced-motion: reduce)");
        if (mq && mq.addEventListener) mq.addEventListener("change", syncReducedMotion);
        else if (mq && mq.addListener) mq.addListener(syncReducedMotion);
      } catch (_) {}
    }
    if (typeof MutationObserver === "function") {
      bodyObserver = new MutationObserver(() => onSleepStateChanged());
      bodyObserver.observe(body(), {
        attributes: true,
        attributeFilter: [
          "class",
          "hidden",
          "aria-hidden",
          "data-idle-sleep",
          "data-v4-pose",
          "data-catcode-model",
          "data-catcode-model-latched",
          ...BLOCKING_BODY_ATTRS,
          "data-speech",
        ],
      });
    }
    const obj = document.getElementById("sleep-pose");
    if (obj && obj.addEventListener) {
      obj.addEventListener("load", () => {
        if (!peeking) {
          const root = sleepSvgRoot();
          if (root) root.removeAttribute(SVG_PEEK_ATTR);
        }
      });
    }
    onSleepStateChanged();
  }

  const api = {
    start,
    cancel,
    isPeeking: () => peeking,
    PEEK_VALUE,
    OPEN_MS,
    FIRST_MIN_MS,
    FIRST_MAX_MS,
    NEXT_MIN_MS,
    NEXT_MAX_MS,
    _tryOpenPeek: tryOpenPeek,
    _scheduleNext: scheduleNext,
    _setReducedMotion(value) {
      reducedMotion = !!value;
    },
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window === "object") {
    window.CatCodeV4SleepPeek = api;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => api.start(), { once: true });
    } else {
      api.start();
    }
  }
})();
