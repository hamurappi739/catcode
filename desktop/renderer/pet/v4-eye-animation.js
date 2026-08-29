"use strict";

// V4 Stage E1: single idle blink owner. Uses authored #v4-closed-eyes via
// svg.v4-blinking — never overloads data-v4-pose. Does not implement sleep peek.
// Stage BL1: if a scheduled blink fires while temporarily ineligible, do not
// strand the scheduler — defer a single soft re-check, then rely on state
// sync when eligibility returns (no busy loop / no catch-up blink storm).

(() => {
  const BLINK_CLASS = "v4-blinking";
  const BODY_ATTR = "data-v4-blinking";
  // Conservative natural cadence (plan E1).
  const INITIAL_DELAY_MS = 4500;
  const MIN_INTERVAL_MS = 3800;
  const MAX_INTERVAL_MS = 7800;
  const BLINK_DURATION_MS = 320;
  /** Soft re-check after a blocked schedule fire (BL1). Not a poll loop. */
  const RETRY_AFTER_BLOCKED_MS = 1200;

  const BLOCKING_BODY_ATTRS = [
    "data-purring",
    "data-idle-sleep",
    "data-idle-wake",
    "data-v4-sleep-peek",
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
    "data-editing-name",
    "data-editing-user-name",
    "data-editing-fixed-message",
    "data-editing-pomodoro-focus",
    "data-editing-wellness-interval",
    "data-editing-share-duration",
    "data-reminder-form",
  ];

  let scheduleTimer = null;
  let pulseTimer = null;
  let blinking = false;
  let started = false;
  let reducedMotion = false;
  let deferredEligibleCheck = false;
  let svgRootObserver = null;
  let observedSvgRoot = null;

  function prefersReducedMotion() {
    try {
      return (
        typeof matchMedia === "function" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch {
      return false;
    }
  }

  function randomInterval() {
    return (
      MIN_INTERVAL_MS +
      Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1))
    );
  }

  function idleSvgRoot() {
    const cat = document.getElementById("cat");
    const doc = cat && cat.contentDocument;
    const root = doc && doc.documentElement;
    if (
      !root ||
      !root.matches ||
      !root.matches('svg[data-catcode-model="v4"]')
    ) {
      return null;
    }
    return root;
  }

  function ensureSvgRootObserver() {
    const root = idleSvgRoot();
    if (!root) return;
    if (observedSvgRoot === root && svgRootObserver) return;
    if (svgRootObserver) {
      try {
        svgRootObserver.disconnect();
      } catch {
        // ignore
      }
      svgRootObserver = null;
    }
    observedSvgRoot = root;
    svgRootObserver = new MutationObserver(() => {
      syncFromState();
    });
    svgRootObserver.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  function isEligible() {
    if (reducedMotion) return false;
    if (typeof document !== "undefined" && document.hidden) return false;
    const body = document.body;
    if (!body || body.dataset.catcodeModel !== "v4") return false;
    if (body.dataset.v4Pose && body.dataset.v4Pose !== "idle") return false;
    if (body.classList.contains("dragging")) return false;
    if (body.classList.contains("typing") || body.dataset.typing) return false;
    if (body.hidden) return false;
    for (const attr of BLOCKING_BODY_ATTRS) {
      if (body.hasAttribute(attr)) return false;
    }
    // Purr owns lids via svg.purring — never blink on top.
    const root = idleSvgRoot();
    if (root && root.classList.contains("purring")) return false;
    return true;
  }

  function clearSchedule() {
    if (scheduleTimer !== null) {
      clearTimeout(scheduleTimer);
      scheduleTimer = null;
    }
    deferredEligibleCheck = false;
  }

  function clearPulse() {
    if (pulseTimer !== null) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
  }

  function setBlinkingVisual(active) {
    const body = document.body;
    const root = idleSvgRoot();
    blinking = !!active;
    if (body) {
      if (active) body.setAttribute(BODY_ATTR, "1");
      else body.removeAttribute(BODY_ATTR);
    }
    if (root) {
      root.classList.toggle(BLINK_CLASS, !!active);
    }
    if (active) {
      const gaze = window.CatCodeV4CursorAttention;
      if (gaze && typeof gaze.resetVisual === "function") gaze.resetVisual();
    }
  }

  function endBlink() {
    clearPulse();
    setBlinkingVisual(false);
    blinking = false;
    if (isEligible()) scheduleNext(false);
  }

  function cancelBlink({ reschedule = false } = {}) {
    clearSchedule();
    clearPulse();
    setBlinkingVisual(false);
    blinking = false;
    if (reschedule && isEligible()) scheduleNext(false);
  }

  /**
   * BL1: after a schedule fire lands while blocked, arm one soft re-check.
   * If still blocked, stay dormant until syncFromState (body/SVG/visibility).
   * Never stacks duplicates; never immediate catch-up blink storms.
   */
  function scheduleDeferredEligibleCheck() {
    if (scheduleTimer !== null || blinking || pulseTimer !== null) return;
    if (reducedMotion) return;
    deferredEligibleCheck = true;
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      deferredEligibleCheck = false;
      syncFromState();
    }, RETRY_AFTER_BLOCKED_MS);
  }

  function startBlink() {
    if (blinking) return false;
    if (!isEligible()) {
      clearPulse();
      setBlinkingVisual(false);
      blinking = false;
      scheduleDeferredEligibleCheck();
      return false;
    }
    ensureSvgRootObserver();
    if (!idleSvgRoot()) {
      scheduleDeferredEligibleCheck();
      return false;
    }
    clearSchedule();
    setBlinkingVisual(true);
    pulseTimer = setTimeout(() => {
      pulseTimer = null;
      endBlink();
    }, BLINK_DURATION_MS);
    return true;
  }

  function scheduleNext(useInitial) {
    clearSchedule();
    if (!isEligible()) return;
    ensureSvgRootObserver();
    const delay = useInitial ? INITIAL_DELAY_MS : randomInterval();
    scheduleTimer = setTimeout(() => {
      scheduleTimer = null;
      if (!isEligible()) {
        // Temporary block at fire time — do not strand permanently (BL1).
        scheduleDeferredEligibleCheck();
        return;
      }
      startBlink();
    }, delay);
  }

  function syncFromState() {
    reducedMotion = prefersReducedMotion();
    ensureSvgRootObserver();
    if (!isEligible()) {
      cancelBlink({ reschedule: false });
      return;
    }
    if (!blinking && scheduleTimer === null && pulseTimer === null) {
      scheduleNext(started ? false : true);
      started = true;
    }
  }

  function bind() {
    if (window.__catCodeV4EyeAnimationBound) return;
    window.__catCodeV4EyeAnimationBound = true;
    reducedMotion = prefersReducedMotion();

    try {
      if (typeof matchMedia === "function") {
        const mq = matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => syncFromState();
        if (typeof mq.addEventListener === "function") {
          mq.addEventListener("change", onChange);
        } else if (typeof mq.addListener === "function") {
          mq.addListener(onChange);
        }
      }
    } catch {
      // ignore
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelBlink({ reschedule: false });
      else syncFromState();
    });

    const cat = document.getElementById("cat");
    cat?.addEventListener("load", () => {
      cancelBlink({ reschedule: false });
      started = false;
      observedSvgRoot = null;
      if (svgRootObserver) {
        try {
          svgRootObserver.disconnect();
        } catch {
          // ignore
        }
        svgRootObserver = null;
      }
      syncFromState();
    });

    if (document.body) {
      const observer = new MutationObserver(() => syncFromState());
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: [
          "class",
          "hidden",
          "data-catcode-model",
          "data-v4-pose",
          "data-purring",
          "data-idle-sleep",
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
          "data-editing-name",
          "data-editing-user-name",
          "data-editing-fixed-message",
          "data-editing-pomodoro-focus",
          "data-editing-wellness-interval",
          "data-editing-share-duration",
          "data-reminder-form",
        ],
      });
    }

    // Defer first schedule until after load paint — never blink immediately.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => syncFromState());
    });
  }

  window.CatCodeV4EyeAnimation = {
    BLINK_CLASS,
    BODY_ATTR,
    INITIAL_DELAY_MS,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
    BLINK_DURATION_MS,
    RETRY_AFTER_BLOCKED_MS,
    isEligible,
    isBlinking: () => blinking,
    startBlink,
    cancelBlink,
    syncFromState,
    scheduleNext,
    // Test hooks
    _getScheduleTimer: () => scheduleTimer,
    _getPulseTimer: () => pulseTimer,
    _isDeferredEligibleCheck: () => deferredEligibleCheck,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }
})();
