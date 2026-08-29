"use strict";

(function exposeLowPowerAnimations(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root || !root.document) return;

  const start = () => {
    if (root.__catCodeLowPowerAnimations) return;
    const controller = api.createLowPowerAnimationController({
      document: root.document,
      MutationObserver: root.MutationObserver,
    });
    controller.start();
    root.__catCodeLowPowerAnimations = controller;
  };

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof window === "object" ? window : null, function createModule() {
  const DEFAULT_IDLE_EFFECTS = [
    {
      className: "idle-breathe-cycle",
      durationMs: 1900,
      initialDelayMs: 250,
      minDelayMs: 5500,
      maxDelayMs: 8000,
    },
    {
      className: "idle-tail-cycle",
      durationMs: 1700,
      initialDelayMs: 1250,
      minDelayMs: 7000,
      maxDelayMs: 11000,
    },
    {
      className: "idle-blink-cycle",
      durationMs: 320,
      initialDelayMs: 2400,
      minDelayMs: 3500,
      maxDelayMs: 6500,
    },
    {
      className: "idle-whiskers-cycle",
      durationMs: 420,
      initialDelayMs: 5200,
      minDelayMs: 9000,
      maxDelayMs: 15000,
    },
    {
      className: "idle-ear-left-cycle",
      durationMs: 430,
      initialDelayMs: 7600,
      minDelayMs: 11000,
      maxDelayMs: 18000,
    },
    {
      className: "idle-ear-right-cycle",
      durationMs: 430,
      initialDelayMs: 10400,
      minDelayMs: 11000,
      maxDelayMs: 18000,
    },
  ];
  const DEFAULT_SLEEP_EFFECT = {
    className: "sleep-zzz-cycle",
    durationMs: 2500,
    initialDelayMs: 180,
    minDelayMs: 6500,
    maxDelayMs: 8500,
  };
  const DEFAULT_THINKING_EFFECT = {
    className: "thinking-dots-cycle",
    // Full </> → star cycle including in-cycle empty gap (~2140ms).
    durationMs: 2140,
    initialDelayMs: 120,
    // Calm random pause between cycles (audit §F.4).
    minDelayMs: 3200,
    maxDelayMs: 4800,
  };
  const BUSY_ROOT_CLASSES = [
    "purring",
    "hunting",
    "hunting-return",
    "idle-sleep",
    "idle-wake",
    "drinking",
  ];
  /** Body attrs/classes that pause the waiting *visual* (data-thinking may stay). */
  const WAITING_VISUAL_BLOCKERS = [
    "data-idle-sleep",
    "data-purring",
    "data-press",
    "data-scroll",
    "data-jump",
    "data-music-dance",
    "data-v4-dance-active",
    "data-pet-peek",
    "data-pet-roaming",
    "data-hunting",
    "data-hunting-return",
    "data-sharing",
    "data-editing-name",
    "data-stretching",
    "data-drinking",
    "data-reminder-panel",
    "data-reminder-form",
  ];
  /** High-priority transient speech only — fixed/base motto must not suppress. */
  const WAITING_SPEECH_KIND_BLOCKERS = Object.freeze([
    "reminder",
    "agent-notification",
    "complete",
  ]);
  const WAITING_VISUAL_BLOCKER_CLASSES = ["dragging"];
  const WAITING_BODY_OBSERVE_ATTRS = [
    "data-thinking",
    "data-idle-sleep",
    "data-v4-sleep-peek",
    "data-purring",
    "data-press",
    "data-scroll",
    "data-jump",
    "data-speech",
    "data-music-dance",
    "data-v4-dance-active",
    "data-pet-peek",
    "data-pet-roaming",
    "data-hunting",
    "data-hunting-return",
    "data-sharing",
    "data-editing-name",
    "data-stretching",
    "data-drinking",
    "data-reminder-panel",
    "data-reminder-form",
    "class",
  ];

  function waitingSpeechKind(body) {
    if (!body) return "";
    if (body.dataset && typeof body.dataset.speech === "string") {
      return body.dataset.speech;
    }
    if (typeof body.getAttribute === "function") {
      return body.getAttribute("data-speech") || "";
    }
    return "";
  }

  function waitingVisualBlocked(body) {
    if (!body || !body.hasAttribute) return true;
    for (const name of WAITING_VISUAL_BLOCKERS) {
      if (body.hasAttribute(name)) return true;
    }
    if (WAITING_SPEECH_KIND_BLOCKERS.includes(waitingSpeechKind(body))) {
      return true;
    }
    if (body.classList) {
      for (const name of WAITING_VISUAL_BLOCKER_CLASSES) {
        if (body.classList.contains(name)) return true;
      }
    }
    return false;
  }

  function randomDelay(random, min, max) {
    if (max <= min) return min;
    return min + Math.floor(random() * (max - min + 1));
  }

  function createLowPowerAnimationController({
    document,
    MutationObserver,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    random = Math.random,
    idleEffects = DEFAULT_IDLE_EFFECTS,
    sleepEffect = DEFAULT_SLEEP_EFFECT,
    thinkingEffect = DEFAULT_THINKING_EFFECT,
  }) {
    if (!document || !document.body) {
      throw new TypeError("A pet renderer document is required.");
    }

    const scheduled = new Map();
    const pulseTimers = new Map();
    let catObject = null;
    let catRoot = null;
    let rootObserver = null;
    let bodyObserver = null;
    let started = false;
    let stopped = false;

    function clearTimer(map, key) {
      const timer = map.get(key);
      if (timer !== undefined) clearTimeoutFn(timer);
      map.delete(key);
    }

    function removePulse(target, className) {
      if (
        target &&
        target.classList &&
        target.classList.contains(className)
      ) {
        target.classList.remove(className);
      }
      clearTimer(pulseTimers, className);
    }

    function runPulse(target, effect) {
      if (!target || !target.classList || stopped) return;
      removePulse(target, effect.className);
      target.classList.add(effect.className);
      pulseTimers.set(
        effect.className,
        setTimeoutFn(() => {
          pulseTimers.delete(effect.className);
          if (target.classList) target.classList.remove(effect.className);
        }, effect.durationMs),
      );
    }

    function idleAnimationsAllowed() {
      if (document.hidden) return false;
      if (!catRoot || !catRoot.classList) return false;
      if (!catRoot.classList.contains("idle-animated")) return false;
      return !BUSY_ROOT_CLASSES.some((name) => catRoot.classList.contains(name));
    }

    function scheduleIdleEffect(effect, useInitialDelay) {
      clearTimer(scheduled, effect.className);
      if (!idleAnimationsAllowed() || stopped) return;
      const delay = useInitialDelay
        ? effect.initialDelayMs
        : randomDelay(random, effect.minDelayMs, effect.maxDelayMs);
      scheduled.set(
        effect.className,
        setTimeoutFn(() => {
          scheduled.delete(effect.className);
          if (!idleAnimationsAllowed() || stopped) return;
          runPulse(catRoot, effect);
          scheduleIdleEffect(effect, false);
        }, delay),
      );
    }

    function clearIdleAnimations() {
      for (const effect of idleEffects) {
        clearTimer(scheduled, effect.className);
        removePulse(catRoot, effect.className);
      }
    }

    function syncIdleAnimations() {
      if (!idleAnimationsAllowed()) {
        clearIdleAnimations();
        return;
      }
      for (const effect of idleEffects) {
        if (!scheduled.has(effect.className) && !pulseTimers.has(effect.className)) {
          scheduleIdleEffect(effect, true);
        }
      }
    }

    function sleeping() {
      return (
        !document.hidden &&
        document.body.hasAttribute("data-idle-sleep") &&
        !document.body.hasAttribute("data-v4-sleep-peek")
      );
    }

    function scheduleSleepCycle(useInitialDelay) {
      clearTimer(scheduled, sleepEffect.className);
      if (!sleeping() || stopped) return;
      const delay = useInitialDelay
        ? sleepEffect.initialDelayMs
        : randomDelay(random, sleepEffect.minDelayMs, sleepEffect.maxDelayMs);
      scheduled.set(
        sleepEffect.className,
        setTimeoutFn(() => {
          scheduled.delete(sleepEffect.className);
          if (!sleeping() || stopped) return;
          runPulse(document.body, sleepEffect);
          scheduleSleepCycle(false);
        }, delay),
      );
    }

    function syncSleepAnimation() {
      if (!sleeping()) {
        clearTimer(scheduled, sleepEffect.className);
        removePulse(document.body, sleepEffect.className);
        return;
      }
      if (
        !scheduled.has(sleepEffect.className) &&
        !pulseTimers.has(sleepEffect.className)
      ) {
        scheduleSleepCycle(true);
      }
    }

    function thinkingAttrActive() {
      return !document.hidden && document.body.hasAttribute("data-thinking");
    }

    function thinkingVisualEligible() {
      return thinkingAttrActive() && !waitingVisualBlocked(document.body);
    }

    function prefersReducedMotion() {
      try {
        if (
          typeof matchMedia === "function" &&
          matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          return true;
        }
      } catch (_) {
        /* ignore */
      }
      return false;
    }

    function scheduleThinkingCycle(useInitialDelay) {
      clearTimer(scheduled, thinkingEffect.className);
      if (!thinkingVisualEligible() || stopped) return;
      // Reduced motion: keep static </> via CSS; do not pulse the loop class.
      if (prefersReducedMotion()) return;
      const delay = useInitialDelay
        ? thinkingEffect.initialDelayMs
        : randomDelay(
            random,
            thinkingEffect.minDelayMs,
            thinkingEffect.maxDelayMs,
          );
      scheduled.set(
        thinkingEffect.className,
        setTimeoutFn(() => {
          scheduled.delete(thinkingEffect.className);
          if (!thinkingVisualEligible() || stopped || prefersReducedMotion()) {
            return;
          }
          runPulse(document.body, thinkingEffect);
          scheduleThinkingCycle(false);
        }, delay),
      );
    }

    function syncThinkingAnimation() {
      if (!thinkingVisualEligible() || prefersReducedMotion()) {
        clearTimer(scheduled, thinkingEffect.className);
        removePulse(document.body, thinkingEffect.className);
        return;
      }
      if (
        !scheduled.has(thinkingEffect.className) &&
        !pulseTimers.has(thinkingEffect.className)
      ) {
        scheduleThinkingCycle(true);
      }
    }

    function syncBodyAnimations() {
      syncSleepAnimation();
      syncThinkingAnimation();
    }

    function syncAllAnimations() {
      syncIdleAnimations();
      syncBodyAnimations();
    }

    function attachCatRoot() {
      if (rootObserver) rootObserver.disconnect();
      rootObserver = null;
      clearIdleAnimations();
      catRoot =
        catObject &&
        catObject.contentDocument &&
        catObject.contentDocument.documentElement;
      if (!catRoot) return;
      if (MutationObserver) {
        rootObserver = new MutationObserver(syncIdleAnimations);
        rootObserver.observe(catRoot, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
      syncIdleAnimations();
    }

    function start() {
      if (started || stopped) return;
      started = true;
      catObject = document.getElementById("cat");
      if (catObject) catObject.addEventListener("load", attachCatRoot);
      if (MutationObserver) {
        bodyObserver = new MutationObserver(syncBodyAnimations);
        bodyObserver.observe(document.body, {
          attributes: true,
          attributeFilter: WAITING_BODY_OBSERVE_ATTRS,
        });
      }
      document.addEventListener("visibilitychange", syncAllAnimations);
      attachCatRoot();
      syncBodyAnimations();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (rootObserver) rootObserver.disconnect();
      if (bodyObserver) bodyObserver.disconnect();
      if (catObject) catObject.removeEventListener("load", attachCatRoot);
      document.removeEventListener("visibilitychange", syncAllAnimations);
      clearIdleAnimations();
      clearTimer(scheduled, sleepEffect.className);
      removePulse(document.body, sleepEffect.className);
      clearTimer(scheduled, thinkingEffect.className);
      removePulse(document.body, thinkingEffect.className);
    }

    return {
      start,
      stop,
      sync: syncAllAnimations,
    };
  }

  return {
    DEFAULT_IDLE_EFFECTS,
    DEFAULT_SLEEP_EFFECT,
    DEFAULT_THINKING_EFFECT,
    WAITING_VISUAL_BLOCKERS,
    WAITING_SPEECH_KIND_BLOCKERS,
    WAITING_VISUAL_BLOCKER_CLASSES,
    createLowPowerAnimationController,
    randomDelay,
    waitingSpeechKind,
    waitingVisualBlocked,
  };
});
