"use strict";

// V6-M2/M7/M8/M16: visual pose owner for the latched V6 art families. Whole-art frames
// switch exclusively: idle | sleep-settle | sleep | sleep-peek | purr | celebrate | typing | scroll | hunt | tease | dance.

const MODEL_V6 = "v6-idle-preview";
const POSES = Object.freeze({
  IDLE: "idle",
  SLEEP_SETTLE: "sleep-settle",
  SLEEP: "sleep",
  SLEEP_PEEK: "sleep-peek",
  PURR: "purr",
  CELEBRATE: "celebrate",
  TYPING: "typing",
  SCROLL: "scroll",
  HUNT: "hunt",
  TEASE: "tease",
  EDGE_PEEK: "edge-peek",
  WALK: "walk",
  DANCE: "dance",
});

const SETTLE_MS = 320;
const PEEK_OPEN_MS = 1000;
const FIRST_PEEK_MIN_MS = 20_000;
const FIRST_PEEK_MAX_MS = 35_000;
const NEXT_PEEK_MIN_MS = 50_000;
const NEXT_PEEK_MAX_MS = 100_000;

const HOST_IDS = Object.freeze({
  idle: "v6-idle-preview",
  "sleep-settle": "v6-sleep-settle",
  sleep: "v6-sleep",
  "sleep-peek": "v6-sleep-peek",
});

const SLEEP_HOST_IDS = ["v6-sleep-settle", "v6-sleep", "v6-sleep-peek"];
const PURR_FRAMES = Object.freeze([
  { key: "f0", hostId: "v6-purr-f0", fileName: "purr-f0-rest.png", durationMs: 200 },
  { key: "f1", hostId: "v6-purr-f1", fileName: "purr-f1-gentle-left.png", durationMs: 180 },
  { key: "f2", hostId: "v6-purr-f2", fileName: "purr-f2-gentle-rise.png", durationMs: 180 },
  { key: "f3", hostId: "v6-purr-f3", fileName: "purr-f3-gentle-peak.png", durationMs: 180 },
  { key: "f4", hostId: "v6-purr-f4", fileName: "purr-f4-centered.png", durationMs: 180 },
  { key: "f5", hostId: "v6-purr-f5", fileName: "purr-f5-gentle-right.png", durationMs: 180 },
  { key: "f6", hostId: "v6-purr-f6", fileName: "purr-f6-gentle-return.png", durationMs: 180 },
  { key: "f7", hostId: "v6-purr-f7", fileName: "purr-f7-loop-settle.png", durationMs: 200 },
  { key: "f8", hostId: "v6-purr-f8", fileName: "purr-f8-rest.png", durationMs: 240 },
]);
const PURR_HOST_IDS = PURR_FRAMES.map((frame) => frame.hostId);
const CELEBRATE_FRAMES = Object.freeze([
  { key: "f0", hostId: "v6-celebrate-f0", fileName: "celebrate-f0-ready.png", durationMs: 220 },
  { key: "f1", hostId: "v6-celebrate-f1", fileName: "celebrate-f1-jump.png", durationMs: 520 },
  { key: "f2", hostId: "v6-celebrate-f2", fileName: "celebrate-f2-return.png", durationMs: 420 },
]);
const CELEBRATE_HOST_IDS = CELEBRATE_FRAMES.map((frame) => frame.hostId);
const TYPING_FRAMES = Object.freeze([
  { key: "f0", hostId: "v6-typing-f0", fileName: "typing-f0-ready.png" },
  { key: "f1", hostId: "v6-typing-f1", fileName: "typing-f1-left.png" },
  { key: "f2", hostId: "v6-typing-f2", fileName: "typing-f2-right.png" },
  { key: "f3", hostId: "v6-typing-f3", fileName: "typing-f3-fast.png" },
  { key: "f4", hostId: "v6-typing-f4", fileName: "typing-f4-tense.png" },
]);
const TYPING_HOST_IDS = TYPING_FRAMES.map((frame) => frame.hostId);
const SCROLL_FRAMES = Object.freeze([
  { key: "f0", hostId: "v6-scroll-f0", fileName: "scroll-f0-ready.png", durationMs: 140, role: "enter" },
  { key: "f1", hostId: "v6-scroll-f1", fileName: "scroll-f1-reach.png", durationMs: 180, role: "action" },
  { key: "f2", hostId: "v6-scroll-f2", fileName: "scroll-f2-unroll.png", durationMs: 180, role: "action" },
  { key: "f3", hostId: "v6-scroll-f3", fileName: "scroll-f3-pull.png", durationMs: 180, role: "action" },
  { key: "f4", hostId: "v6-scroll-f4", fileName: "scroll-f4-recover.png", durationMs: 240, role: "recovery" },
]);
const SCROLL_HOST_IDS = SCROLL_FRAMES.map((frame) => frame.hostId);
const SCROLL_RECOVERY_MS = SCROLL_FRAMES[4].durationMs;
const SCROLL_REDUCED_MOTION_HOLD_MS = 520;
// Crouch entry advances at a constant 14 FPS. f8 is the hold frame and is not
// auto-advanced on this cadence.
const HUNT_ENTRY_FPS = 14;
const HUNT_ENTRY_FRAME_MS = 1000 / HUNT_ENTRY_FPS;
const HUNT_FRAMES = Object.freeze([
  {
    key: "f0",
    hostId: "v6-hunt-f0",
    fileName: "hunt-f0-alert.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "alert",
  },
  {
    key: "f1",
    hostId: "v6-hunt-f1",
    fileName: "hunt-f1-shoulder-drop.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "micro-lower",
  },
  {
    key: "f2",
    hostId: "v6-hunt-f2",
    fileName: "hunt-f2-forelegs-lower.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "lower",
  },
  {
    key: "f3",
    hostId: "v6-hunt-f3",
    fileName: "hunt-f3-half-crouch.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "half-crouch",
  },
  {
    key: "f4",
    hostId: "v6-hunt-f4",
    fileName: "hunt-f4-low-crouch.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "deep",
  },
  {
    key: "f5",
    hostId: "v6-hunt-f5",
    fileName: "hunt-f5-deep-stalk.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "low-settle",
  },
  {
    key: "f6",
    hostId: "v6-hunt-f6",
    fileName: "hunt-f6-near-hold.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "watch-arrive",
  },
  {
    key: "f7",
    hostId: "v6-hunt-f7",
    fileName: "hunt-f7-watch-hold.png",
    assetDir: "hunt-smooth",
    durationMs: HUNT_ENTRY_FRAME_MS,
    role: "watch-settle",
  },
  {
    key: "f8",
    hostId: "v6-hunt-f8",
    // Must match index.html data-src / skin static maps (gaze-ready hold base).
    fileName: "hunt-f8-gaze-ready.png",
    assetDir: "hunt-smooth",
    durationMs: null,
    holdMaxMs: 0,
    role: "watch-hold",
  },
]);
const HUNT_HOST_IDS = HUNT_FRAMES.map((frame) => frame.hostId);
const HUNT_REDUCED_MOTION_HOLD_MS = 520;
// The crouch remains active while the cursor stays nearby. The hunt controller
// owns the clean exit/re-arm gesture rather than a fixed-duration cutoff.
const HUNT_HOLD_MAX_MS = 0;
const TEASE_FRAMES = Object.freeze([
  { key: "f0", hostId: "v6-tease-f0", fileName: "tease-f0-stalk.png", durationMs: 220 },
  { key: "f1", hostId: "v6-tease-f1", fileName: "tease-f1-reach.png", durationMs: 220 },
  { key: "f2", hostId: "v6-tease-f2", fileName: "tease-f2-catch.png", durationMs: 260 },
  { key: "f3", hostId: "v6-tease-f3", fileName: "tease-f3-hold.png", durationMs: 620 },
  { key: "f4", hostId: "v6-tease-f4", fileName: "tease-f4-release.png", durationMs: 300 },
]);
const TEASE_HOST_IDS = TEASE_FRAMES.map((frame) => frame.hostId);
const TEASE_REDUCED_MOTION_HOLD_MS = 520;
const EDGE_PEEK_FRAMES = Object.freeze([
  {
    edge: "left",
    hostId: "v6-edge-peek-left",
    fileName: "peek-from-left-looking-right.png",
  },
  {
    edge: "right",
    hostId: "v6-edge-peek-right",
    fileName: "peek-from-right-looking-left.png",
  },
]);
const EDGE_PEEK_HOST_IDS = EDGE_PEEK_FRAMES.map((frame) => frame.hostId);
const WALK_FRAMES = Object.freeze([
  { key: "f0", direction: "left", hostId: "v6-walk-left-f0", fileName: "walk-left-f0.png", durationMs: 200 },
  { key: "f1", direction: "left", hostId: "v6-walk-left-f1", fileName: "walk-left-f1.png", durationMs: 200 },
  { key: "f2", direction: "left", hostId: "v6-walk-left-f2", fileName: "walk-left-f2.png", durationMs: 200 },
  { key: "f3", direction: "left", hostId: "v6-walk-left-f3", fileName: "walk-left-f3.png", durationMs: 200 },
  { key: "f4", direction: "left", hostId: "v6-walk-left-f4", fileName: "walk-left-f4.png", durationMs: 200 },
  { key: "f0", direction: "right", hostId: "v6-walk-right-f0", fileName: "walk-right-f0.png", durationMs: 200 },
  { key: "f1", direction: "right", hostId: "v6-walk-right-f1", fileName: "walk-right-f1.png", durationMs: 200 },
  { key: "f2", direction: "right", hostId: "v6-walk-right-f2", fileName: "walk-right-f2.png", durationMs: 200 },
  { key: "f3", direction: "right", hostId: "v6-walk-right-f3", fileName: "walk-right-f3.png", durationMs: 200 },
  { key: "f4", direction: "right", hostId: "v6-walk-right-f4", fileName: "walk-right-f4.png", durationMs: 200 }
]);
const WALK_HOST_IDS = WALK_FRAMES.map((frame) => frame.hostId);
const WALK_FRAME_DURATION_MS = 200;
const WALK_REDUCED_MOTION_HOLD_MS = 400;
const DANCE_VARIANTS = Object.freeze([
  {
    key: "drill",
    frames: Object.freeze([
      { key: "f00", hostId: "v6-dance-drill-f00", fileName: "drill-f00-ready.png" },
      { key: "f01", hostId: "v6-dance-drill-f01", fileName: "drill-f01-left-bounce.png" },
      { key: "f02", hostId: "v6-dance-drill-f02", fileName: "drill-f02-left-punch.png" },
      { key: "f03", hostId: "v6-dance-drill-f03", fileName: "drill-f03-center-bounce.png" },
      { key: "f04", hostId: "v6-dance-drill-f04", fileName: "drill-f04-right-bounce.png" },
      { key: "f05", hostId: "v6-dance-drill-f05", fileName: "drill-f05-right-punch.png" },
      { key: "f06", hostId: "v6-dance-drill-f06", fileName: "drill-f06-bounce-up.png" },
      { key: "f07", hostId: "v6-dance-drill-f07", fileName: "drill-f07-shoulder-pop.png" },
      { key: "f08", hostId: "v6-dance-drill-f08", fileName: "drill-f08-settle.png" },
      { key: "f09", hostId: "v6-dance-drill-f09", fileName: "drill-f09-loop-return.png" },
    ]),
  },
  {
    key: "hip-hop",
    frames: Object.freeze([
      { key: "f00", hostId: "v6-dance-hip-hop-f00", fileName: "hiphop-f00-ready.png" },
      { key: "f01", hostId: "v6-dance-hip-hop-f01", fileName: "hiphop-f01-left-forward.png" },
      { key: "f02", hostId: "v6-dance-hip-hop-f02", fileName: "hiphop-f02-left-knee.png" },
      { key: "f03", hostId: "v6-dance-hip-hop-f03", fileName: "hiphop-f03-center-downbeat.png" },
      { key: "f04", hostId: "v6-dance-hip-hop-f04", fileName: "hiphop-f04-right-forward.png" },
      { key: "f05", hostId: "v6-dance-hip-hop-f05", fileName: "hiphop-f05-right-knee.png" },
      { key: "f06", hostId: "v6-dance-hip-hop-f06", fileName: "hiphop-f06-center-rise.png" },
      { key: "f07", hostId: "v6-dance-hip-hop-f07", fileName: "hiphop-f07-left-recover.png" },
      { key: "f08", hostId: "v6-dance-hip-hop-f08", fileName: "hiphop-f08-settle.png" },
      { key: "f09", hostId: "v6-dance-hip-hop-f09", fileName: "hiphop-f09-loop-return.png" },
    ]),
  },
  {
    key: "paw-groove",
    frames: Object.freeze([
      { key: "f0", hostId: "v6-dance-paw-groove-f0", fileName: "paw-groove-f0-ready.png" },
      { key: "f1", hostId: "v6-dance-paw-groove-f1", fileName: "paw-groove-f1-left-lean.png" },
      { key: "f2", hostId: "v6-dance-paw-groove-f2", fileName: "paw-groove-f2-right-lean.png" },
    ]),
  },
]);
const DANCE_HOST_IDS = DANCE_VARIANTS.flatMap((variant) =>
  variant.frames.map((frame) => frame.hostId),
);
const DANCE_REDUCED_MOTION_HOLD_MS = 480;

function createV6VisualPose({
  body = typeof document !== "undefined" ? document.body : null,
  document: doc = typeof document !== "undefined" ? document : null,
  window: win = typeof window !== "undefined" ? window : null,
  settleMs = SETTLE_MS,
  peekOpenMs = PEEK_OPEN_MS,
  firstPeekMinMs = FIRST_PEEK_MIN_MS,
  firstPeekMaxMs = FIRST_PEEK_MAX_MS,
  nextPeekMinMs = NEXT_PEEK_MIN_MS,
  nextPeekMaxMs = NEXT_PEEK_MAX_MS,
  celebrateFrames = CELEBRATE_FRAMES,
  typingFrames = TYPING_FRAMES,
  scrollFrames = SCROLL_FRAMES,
  huntFrames = HUNT_FRAMES,
  walkFrames = WALK_FRAMES,
  random = Math.random,
} = {}) {
  let epoch = 0;
  let started = false;
  let pose = POSES.IDLE;
  let sleepReady = false;
  let sleepError = false;
  let purrReady = false;
  let purrError = false;
  let purrFrameIndex = 0;
  let settleTimer = null;
  let peekScheduleTimer = null;
  let peekOpenTimer = null;
  let purrFrameTimer = null;
  let celebrateReady = false;
  let celebrateError = false;
  let celebrateFrameIndex = 0;
  let celebrateFrameTimer = null;
  let typingReady = false;
  let typingError = false;
  let typingFrameIndex = 0;
  let scrollReady = false;
  let scrollError = false;
  let scrollFrameIndex = 0;
  let scrollFrameTimer = null;
  let huntReady = false;
  let huntError = false;
  let huntFrameIndex = 0;
  let huntFrameTimer = null;
  let teaseReady = false;
  let teaseError = false;
  let teaseFrameIndex = 0;
  let edgePeekReady = false;
  let edgePeekError = false;
  let edgePeekDirection = "left";
  let walkReady = false;
  let walkError = false;
  let walkFrameIndex = 0;
  let walkDirection = "right";
  let walkFrameTimer = null;
  let danceReady = false;
  let danceError = false;
  let danceVariantIndex = 0;
  let danceFrameIndex = 0;
  let reducedMotion = false;
  const alphaByHost = new Map();
  let visibilityHandler = null;
  let purrObserver = null;
  let reducedMotionMq = null;

  function isLatched() {
    return !!(
      body &&
      body.dataset &&
      (body.dataset.catcodeModelLatched === "1" ||
        body.dataset.catcodeModel === MODEL_V6)
    );
  }

  function setSleepStatus(status) {
    if (!body || !body.dataset) return;
    body.dataset.v6SleepStatus = status;
  }

  function setPose(next) {
    pose = next;
    if (!body || !body.dataset) return;
    body.dataset.v6Pose = next;
    if (next !== POSES.PURR) delete body.dataset.v6PurrFrame;
    if (next !== POSES.CELEBRATE) delete body.dataset.v6CelebrateFrame;
    if (next !== POSES.TYPING) delete body.dataset.v6TypingFrame;
    if (next !== POSES.SCROLL) delete body.dataset.v6ScrollFrame;
    if (next !== POSES.HUNT) {
      delete body.dataset.v6HuntFrame;
      delete body.dataset.v6HuntGaze;
    }
    if (next !== POSES.TEASE) {
      delete body.dataset.v6TeaseFrame;
      delete body.dataset.v6CursorTease;
    }
    if (next !== POSES.EDGE_PEEK) {
      delete body.dataset.v6EdgePeek;
    }
    if (next !== POSES.WALK) {
      delete body.dataset.v6WalkFrame;
      delete body.dataset.v6WalkDir;
    }
    if (next !== POSES.DANCE) {
      delete body.dataset.v6DanceVariant;
      delete body.dataset.v6DanceFrame;
      delete body.dataset.v6DanceActive;
    }
  }

  // Main clips the pet window during edge peek. A full V6 pose would be
  // visually cut apart there, so edge peek holds exclusive visual ownership.
  function isEdgePeekExclusive() {
    return pose === POSES.EDGE_PEEK;
  }

  function getHost(id) {
    return doc && doc.getElementById ? doc.getElementById(id) : null;
  }

  function loadHostSource(host) {
    const skin = win && win.CatCodeV6Skin;
    if (skin && typeof skin.setHostSource === "function") {
      skin.setHostSource(host);
      return;
    }
    host.src = host.dataset.src;
  }

  function getActiveHost() {
    if (pose === POSES.PURR) {
      return getHost(PURR_FRAMES[purrFrameIndex].hostId);
    }
    if (pose === POSES.CELEBRATE) {
      return getHost(celebrateFrames[celebrateFrameIndex].hostId);
    }
    if (pose === POSES.TYPING) {
      return getHost(typingFrames[typingFrameIndex].hostId);
    }
    if (pose === POSES.SCROLL) {
      return getHost(scrollFrames[scrollFrameIndex].hostId);
    }
    if (pose === POSES.HUNT) {
      return getHost(huntFrames[huntFrameIndex].hostId);
    }
    if (pose === POSES.TEASE) {
      return getHost(TEASE_FRAMES[teaseFrameIndex].hostId);
    }
    if (pose === POSES.EDGE_PEEK) {
      const frame = EDGE_PEEK_FRAMES.find((item) => item.edge === edgePeekDirection);
      return getHost(frame && frame.hostId);
    }
    if (pose === POSES.WALK) {
      const frame = walkFrames[walkFrameIndex];
      return getHost(frame && frame.hostId);
    }
    if (pose === POSES.DANCE) {
      const variant = DANCE_VARIANTS[danceVariantIndex];
      return getHost(variant && variant.frames[danceFrameIndex] && variant.frames[danceFrameIndex].hostId);
    }
    return getHost(HOST_IDS[pose] || HOST_IDS.idle);
  }

  function clearTimers() {
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (peekScheduleTimer) {
      clearTimeout(peekScheduleTimer);
      peekScheduleTimer = null;
    }
    if (peekOpenTimer) {
      clearTimeout(peekOpenTimer);
      peekOpenTimer = null;
    }
    if (purrFrameTimer) {
      clearTimeout(purrFrameTimer);
      purrFrameTimer = null;
    }
    if (celebrateFrameTimer) {
      clearTimeout(celebrateFrameTimer);
      celebrateFrameTimer = null;
    }
    if (scrollFrameTimer) {
      clearTimeout(scrollFrameTimer);
      scrollFrameTimer = null;
    }
    if (huntFrameTimer) {
      clearTimeout(huntFrameTimer);
      huntFrameTimer = null;
    }
    if (walkFrameTimer) {
      clearTimeout(walkFrameTimer);
      walkFrameTimer = null;
    }
  }

  function bumpEpoch(reason) {
    epoch += 1;
    clearTimers();
    return { token: epoch, reason: reason || "cancel" };
  }

  function prefersReducedMotion() {
    try {
      return !!(
        win &&
        typeof win.matchMedia === "function" &&
        win.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (_) {
      return false;
    }
  }

  function randomBetween(min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function cacheHostAlpha(host) {
    if (!host || !host.naturalWidth || !host.naturalHeight) return false;
    if (!doc || typeof doc.createElement !== "function") return false;
    try {
      const canvas = doc.createElement("canvas");
      canvas.width = host.naturalWidth;
      canvas.height = host.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return false;
      context.drawImage(host, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const alpha = new Uint8Array(canvas.width * canvas.height);
      for (
        let sourceIndex = 3, targetIndex = 0;
        sourceIndex < rgba.length;
        sourceIndex += 4
      ) {
        alpha[targetIndex] = rgba[sourceIndex];
        targetIndex += 1;
      }
      alphaByHost.set(host.id, {
        alpha,
        width: canvas.width,
        height: canvas.height,
      });
      if (host.dataset) host.dataset.v6HitReady = "1";
      return true;
    } catch (_) {
      return false;
    }
  }

  function isOpaqueHitPoint(clientX, clientY) {
    const host = getActiveHost();
    if (!host) return false;
    const cached = alphaByHost.get(host.id);
    if (!cached || typeof host.getBoundingClientRect !== "function") return false;
    const rect = host.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      clientX < rect.left ||
      clientX >= rect.right ||
      clientY < rect.top ||
      clientY >= rect.bottom
    ) {
      return false;
    }
    const x = Math.min(
      cached.width - 1,
      Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * cached.width)),
    );
    const y = Math.min(
      cached.height - 1,
      Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * cached.height)),
    );
    return cached.alpha[y * cached.width + x] >= 128;
  }

  function markHostVisibleAttrs() {
    for (const id of [
      ...Object.values(HOST_IDS),
      ...PURR_HOST_IDS,
      ...CELEBRATE_HOST_IDS,
      ...TYPING_HOST_IDS,
      ...SCROLL_HOST_IDS,
      ...HUNT_HOST_IDS,
      ...TEASE_HOST_IDS,
      ...EDGE_PEEK_HOST_IDS,
      ...WALK_HOST_IDS,
      ...DANCE_HOST_IDS,
    ]) {
      const el = getHost(id);
      if (!el) continue;
      el.hidden = false;
    }
  }

  function areSleepAssetsReady() {
    return sleepReady && !sleepError;
  }

  function arePurrAssetsReady() {
    return purrReady && !purrError;
  }

  function areCelebrateAssetsReady() {
    return celebrateReady && !celebrateError;
  }

  function areTypingAssetsReady() {
    return typingReady && !typingError;
  }

  function areScrollAssetsReady() {
    return scrollReady && !scrollError;
  }

  function areHuntAssetsReady() {
    return huntReady && !huntError;
  }

  function areTeaseAssetsReady() {
    return teaseReady && !teaseError;
  }

  function areEdgePeekAssetsReady() {
    return edgePeekReady && !edgePeekError;
  }

  function loadSleepHosts() {
    if (!doc) return;
    setSleepStatus("loading");
    sleepReady = false;
    sleepError = false;
    let pending = SLEEP_HOST_IDS.length;
    let failed = false;

    function settle() {
      if (failed) {
        sleepError = true;
        sleepReady = false;
        setSleepStatus("error");
        setPose(POSES.IDLE);
        return;
      }
      sleepReady = true;
      setSleepStatus("ready");
    }

    for (const id of SLEEP_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function loadPurrHosts() {
    if (!doc) return;
    purrReady = false;
    purrError = false;
    let pending = PURR_HOST_IDS.length;
    let failed = false;

    function settle() {
      purrError = failed;
      purrReady = !failed;
      if (body && body.dataset) body.dataset.v6PurrStatus = failed ? "error" : "ready";
      if (!failed && body && body.dataset && body.dataset.purring === "1") {
        enterPurr();
      }
    }

    for (const id of PURR_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function loadCelebrateHosts() {
    if (!doc) return;
    celebrateReady = false;
    celebrateError = false;
    let pending = CELEBRATE_HOST_IDS.length;
    let failed = false;

    function settle() {
      celebrateError = failed;
      celebrateReady = !failed;
      if (body && body.dataset) {
        body.dataset.v6CelebrateStatus = failed ? "error" : "ready";
      }
    }

    for (const id of CELEBRATE_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function loadTypingHosts() {
    if (!doc) return;
    typingReady = false;
    typingError = false;
    let pending = TYPING_HOST_IDS.length;
    let failed = false;

    function settle() {
      typingError = failed;
      typingReady = !failed;
      if (body && body.dataset) body.dataset.v6TypingStatus = failed ? "error" : "ready";
    }

    for (const id of TYPING_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function loadScrollHosts() {
    if (!doc) return;
    scrollReady = false;
    scrollError = false;
    let pending = SCROLL_HOST_IDS.length;
    let failed = false;

    function settle() {
      scrollError = failed;
      scrollReady = !failed;
      if (body && body.dataset) {
        body.dataset.v6ScrollStatus = failed ? "error" : "ready";
      }
    }

    for (const id of SCROLL_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function loadHuntHosts() {
    if (!doc) return;
    huntReady = false;
    huntError = false;
    let pending = HUNT_HOST_IDS.length;
    let failed = false;

    function settle() {
      huntError = failed;
      huntReady = !failed;
      if (body && body.dataset) {
        body.dataset.v6HuntStatus = failed ? "error" : "ready";
      }
    }

    for (const id of HUNT_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function loadTeaseHosts() {
    if (!doc) return;
    teaseReady = false;
    teaseError = false;
    let pending = TEASE_HOST_IDS.length;
    let failed = false;

    function settle() {
      teaseError = failed;
      teaseReady = !failed;
      if (body && body.dataset) {
        body.dataset.v6TeaseStatus = failed ? "error" : "ready";
      }
    }

    for (const id of TEASE_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function loadEdgePeekHosts() {
    if (!doc) return;
    edgePeekReady = false;
    edgePeekError = false;
    let pending = EDGE_PEEK_HOST_IDS.length;
    let failed = false;

    function settle() {
      edgePeekError = failed;
      edgePeekReady = !failed;
      if (body && body.dataset) {
        body.dataset.v6EdgePeekStatus = failed ? "error" : "ready";
      }
    }

    for (const id of EDGE_PEEK_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function setPurrFrame(index) {
    purrFrameIndex = index % PURR_FRAMES.length;
    if (body && body.dataset) {
      body.dataset.v6PurrFrame = PURR_FRAMES[purrFrameIndex].key;
    }
  }

  function schedulePurrFrame(token) {
    if (pose !== POSES.PURR || reducedMotion) return;
    const frame = PURR_FRAMES[purrFrameIndex];
    purrFrameTimer = setTimeout(() => {
      purrFrameTimer = null;
      if (token !== epoch || pose !== POSES.PURR) return;
      setPurrFrame(purrFrameIndex + 1);
      schedulePurrFrame(token);
    }, frame.durationMs);
  }

  function enterPurr() {
    if (!isLatched() || isEdgePeekExclusive() || !arePurrAssetsReady()) return false;
    bumpEpoch("enter-purr");
    markHostVisibleAttrs();
    setPose(POSES.PURR);
    setPurrFrame(0);
    if (!reducedMotion) schedulePurrFrame(epoch);
    return true;
  }

  function leavePurr(reason) {
    if (pose !== POSES.PURR) return false;
    bumpEpoch(reason || "leave-purr");
    setPose(POSES.IDLE);
    return true;
  }

  function setCelebrateFrame(index) {
    celebrateFrameIndex = index;
    if (body && body.dataset) {
      body.dataset.v6CelebrateFrame = celebrateFrames[index].key;
    }
  }

  function scheduleCelebrateFrame(token) {
    if (pose !== POSES.CELEBRATE || reducedMotion) return;
    const frame = celebrateFrames[celebrateFrameIndex];
    celebrateFrameTimer = setTimeout(() => {
      celebrateFrameTimer = null;
      if (token !== epoch || pose !== POSES.CELEBRATE) return;
      const nextIndex = celebrateFrameIndex + 1;
      if (nextIndex >= celebrateFrames.length) {
        setPose(POSES.IDLE);
        return;
      }
      setCelebrateFrame(nextIndex);
      scheduleCelebrateFrame(token);
    }, frame.durationMs);
  }

  function enterCelebrate() {
    if (!isLatched() || isEdgePeekExclusive() || !areCelebrateAssetsReady()) return false;
    bumpEpoch("enter-celebrate");
    markHostVisibleAttrs();
    setPose(POSES.CELEBRATE);
    setCelebrateFrame(0);
    if (reducedMotion) {
      setPose(POSES.IDLE);
      return true;
    }
    scheduleCelebrateFrame(epoch);
    return true;
  }

  function enterTyping(frameKey = "f0") {
    if (!isLatched() || isEdgePeekExclusive() || !areTypingAssetsReady()) return false;
    const desiredKey = reducedMotion ? "f0" : frameKey;
    const index = typingFrames.findIndex((frame) => frame.key === desiredKey);
    if (index < 0) return false;
    bumpEpoch("enter-typing");
    markHostVisibleAttrs();
    setPose(POSES.TYPING);
    typingFrameIndex = index;
    if (body && body.dataset) body.dataset.v6TypingFrame = typingFrames[index].key;
    return true;
  }

  function leaveTyping(reason) {
    if (pose !== POSES.TYPING) return false;
    bumpEpoch(reason || "leave-typing");
    setPose(POSES.IDLE);
    return true;
  }

  function setScrollFrame(index) {
    scrollFrameIndex = index;
    if (body && body.dataset) {
      body.dataset.v6ScrollFrame = scrollFrames[index].key;
    }
  }

  function enterScroll(frameKey = "f0", { phase = "action" } = {}) {
    if (!isLatched() || isEdgePeekExclusive() || !areScrollAssetsReady()) return false;
    const desiredKey = reducedMotion ? "f0" : frameKey;
    const index = scrollFrames.findIndex((frame) => frame.key === desiredKey);
    if (index < 0) return false;
    bumpEpoch("enter-scroll");
    markHostVisibleAttrs();
    setPose(POSES.SCROLL);
    setScrollFrame(index);

    if (reducedMotion) {
      const token = epoch;
      scrollFrameTimer = setTimeout(() => {
        scrollFrameTimer = null;
        if (token !== epoch || pose !== POSES.SCROLL) return;
        setPose(POSES.IDLE);
      }, SCROLL_REDUCED_MOTION_HOLD_MS);
      return true;
    }

    // Recovery phase: hold f4 for authored duration then idle (controller also
    // leaves; epoch invalidates whichever fires second).
    if (phase === "recovery" || desiredKey === "f4") {
      const token = epoch;
      const frame = scrollFrames[index];
      scrollFrameTimer = setTimeout(() => {
        scrollFrameTimer = null;
        if (token !== epoch || pose !== POSES.SCROLL) return;
        setPose(POSES.IDLE);
      }, frame.durationMs || SCROLL_RECOVERY_MS);
    }
    return true;
  }

  function leaveScroll(reason) {
    if (pose !== POSES.SCROLL) return false;
    bumpEpoch(reason || "leave-scroll");
    setPose(POSES.IDLE);
    return true;
  }

  function revealHuntHost(host) {
    if (!host) return;
    host.hidden = false;
    if (typeof host.removeAttribute === "function") {
      host.removeAttribute("hidden");
    }
  }

  function setHuntFrame(index) {
    huntFrameIndex = index;
    if (body && body.dataset) {
      body.dataset.v6HuntFrame = huntFrames[index].key;
    }
    // Re-clear `hidden` on every frame. The epoch-only-on-enter change stopped
    // calling markHostVisibleAttrs per step; without that, UA [hidden] can keep
    // the crouch hosts invisible while idle is already forced off.
    revealHuntHost(getHost(huntFrames[index].hostId));
  }

  function getHuntFrameDuration(frameKey) {
    const frame = huntFrames.find((item) => item.key === frameKey);
    if (!frame || frame.durationMs == null) return 0;
    return frame.durationMs;
  }

  function getHuntVisualState() {
    const frame = huntFrames[huntFrameIndex] || null;
    const host = frame ? getHost(frame.hostId) : null;
    const source =
      (host && host.getAttribute && host.getAttribute("src")) ||
      (host && host.src) ||
      (host && host.dataset && host.dataset.src) ||
      null;
    return {
      pose,
      frameKey: frame ? frame.key : null,
      hostId: frame ? frame.hostId : null,
      fileName: frame ? frame.fileName : null,
      hostHidden: host ? !!host.hidden : true,
      hostSrc: source,
      skinId: (body && body.dataset && body.dataset.v6Skin) || null,
    };
  }

  function enterHunt(frameKey = "f0") {
    if (!isLatched() || isEdgePeekExclusive() || !areHuntAssetsReady()) return false;
    const desiredKey = reducedMotion ? "f0" : frameKey;
    const index = huntFrames.findIndex((frame) => frame.key === desiredKey);
    if (index < 0) return false;
    // Only bump the exclusive epoch when *entering* hunt. Frame steps inside an
    // active hunt must not invalidate the hunt controller's entry timers.
    if (pose !== POSES.HUNT) {
      bumpEpoch("enter-hunt");
      markHostVisibleAttrs();
      setPose(POSES.HUNT);
    } else {
      // Frame steps still need host `hidden` cleared for visible crouch CSS.
      markHostVisibleAttrs();
    }
    setHuntFrame(index);

    if (reducedMotion) {
      const token = epoch;
      if (huntFrameTimer) {
        clearTimeout(huntFrameTimer);
        huntFrameTimer = null;
      }
      huntFrameTimer = setTimeout(() => {
        huntFrameTimer = null;
        if (token !== epoch || pose !== POSES.HUNT) return;
        setPose(POSES.IDLE);
      }, HUNT_REDUCED_MOTION_HOLD_MS);
    }
    return true;
  }

  function leaveHunt(reason) {
    if (pose !== POSES.HUNT) return false;
    bumpEpoch(reason || "leave-hunt");
    if (body && body.dataset) delete body.dataset.v6HuntGaze;
    setPose(POSES.IDLE);
    return true;
  }

  function setTeaseFrame(index) {
    teaseFrameIndex = index;
    if (body && body.dataset) {
      body.dataset.v6TeaseFrame = TEASE_FRAMES[index].key;
      body.dataset.v6CursorTease = "1";
    }
  }

  function getTeaseFrameDuration(frameKey) {
    const frame = TEASE_FRAMES.find((item) => item.key === frameKey);
    return frame ? frame.durationMs : 0;
  }

  // A tease is visual-only. The renderer controls its frame order; this pose
  // owner merely guarantees an exclusive, ready, cancellable V6 frame.
  function enterTease(frameKey = "f0") {
    if (!isLatched() || isEdgePeekExclusive() || !areTeaseAssetsReady()) return false;
    const desiredKey = reducedMotion ? "f0" : frameKey;
    const index = TEASE_FRAMES.findIndex((frame) => frame.key === desiredKey);
    if (index < 0) return false;
    bumpEpoch("enter-tease");
    markHostVisibleAttrs();
    setPose(POSES.TEASE);
    setTeaseFrame(index);
    return true;
  }

  function leaveTease(reason) {
    if (pose !== POSES.TEASE) return false;
    bumpEpoch(reason || "leave-tease");
    setPose(POSES.IDLE);
    return true;
  }

  // Main owns the clipped window bounds. This owner only swaps in the
  // artist-authored half-cat that matches the chosen screen edge.
  function enterEdgePeek(edge = "left") {
    if (!isLatched() || !areEdgePeekAssetsReady()) return false;
    bumpEpoch("enter-edge-peek");
    markHostVisibleAttrs();
    edgePeekDirection = edge === "right" ? "right" : "left";
    setPose(POSES.EDGE_PEEK);
    if (body && body.dataset) body.dataset.v6EdgePeek = edgePeekDirection;
    return true;
  }

  function leaveEdgePeek(reason) {
    if (pose !== POSES.EDGE_PEEK) return false;
    bumpEpoch(reason || "leave-edge-peek");
    setPose(POSES.IDLE);
    return true;
  }

  function areWalkAssetsReady() {
    return walkReady && !walkError;
  }

  function areDanceAssetsReady() {
    return danceReady && !danceError;
  }

  function loadDanceHosts() {
    if (!doc) return;
    danceReady = false;
    danceError = false;
    let pending = DANCE_HOST_IDS.length;
    let failed = false;

    function settle() {
      danceError = failed;
      danceReady = !failed;
      if (body && body.dataset) body.dataset.v6DanceStatus = failed ? "error" : "ready";
    }

    for (const id of DANCE_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function enterDance(variantKey = "drill", frameKey = "f00") {
    if (!isLatched() || isEdgePeekExclusive() || !areDanceAssetsReady()) return false;
    const requestedVariant = DANCE_VARIANTS.findIndex((item) => item.key === variantKey);
    const nextVariantIndex = requestedVariant < 0 ? 0 : requestedVariant;
    const frames = DANCE_VARIANTS[nextVariantIndex].frames;
    const requestedFrame = reducedMotion ? "f0" : frameKey;
    const nextFrameIndex = frames.findIndex((frame) => frame.key === requestedFrame);
    if (nextFrameIndex < 0) return false;
    bumpEpoch("enter-dance");
    markHostVisibleAttrs();
    danceVariantIndex = nextVariantIndex;
    danceFrameIndex = nextFrameIndex;
    setPose(POSES.DANCE);
    if (body && body.dataset) {
      body.dataset.v6DanceVariant = DANCE_VARIANTS[danceVariantIndex].key;
      body.dataset.v6DanceFrame = frames[danceFrameIndex].key;
      body.dataset.v6DanceActive = "1";
    }
    if (reducedMotion) {
      const token = epoch;
      setTimeout(() => {
        if (token === epoch && pose === POSES.DANCE) leaveDance("reduced-motion");
      }, DANCE_REDUCED_MOTION_HOLD_MS);
    }
    return true;
  }

  function leaveDance(reason) {
    if (pose !== POSES.DANCE) return false;
    bumpEpoch(reason || "leave-dance");
    setPose(POSES.IDLE);
    return true;
  }

  function loadWalkHosts() {
    if (!doc) return;
    walkReady = false;
    walkError = false;
    let pending = WALK_HOST_IDS.length;
    let failed = false;

    function settle() {
      walkError = failed;
      walkReady = !failed;
      if (body && body.dataset) {
        body.dataset.v6WalkStatus = failed ? "error" : "ready";
      }
    }

    for (const id of WALK_HOST_IDS) {
      const el = getHost(id);
      if (!el || !el.dataset || !el.dataset.src) {
        failed = true;
        pending -= 1;
        if (pending === 0) settle();
        continue;
      }
      let settledHost = false;
      const onDone = (ok) => {
        if (settledHost) return;
        settledHost = true;
        if (!ok) failed = true;
        else cacheHostAlpha(el);
        pending -= 1;
        if (pending === 0) settle();
      };
      if (typeof el.addEventListener === "function") {
        el.addEventListener("load", () => onDone(true), { once: true });
        el.addEventListener("error", () => onDone(false), { once: true });
      }
      loadHostSource(el);
      el.hidden = false;
      if (el.complete && el.naturalWidth > 0) onDone(true);
    }
  }

  function setWalkFrame(direction, frameKey) {
    const dir = direction === "left" ? "left" : "right";
    const index = walkFrames.findIndex(
      (frame) => frame.direction === dir && frame.key === frameKey,
    );
    if (index < 0) return false;
    walkDirection = dir;
    walkFrameIndex = index;
    if (body && body.dataset) {
      body.dataset.v6WalkDir = dir;
      body.dataset.v6WalkFrame = frameKey;
    }
    return true;
  }

  function enterWalk(direction = "right", frameKey = "f0") {
    if (!isLatched() || isEdgePeekExclusive() || !areWalkAssetsReady()) return false;
    if (reducedMotion) {
      bumpEpoch("enter-walk-rm");
      markHostVisibleAttrs();
      setPose(POSES.WALK);
      setWalkFrame(direction === "left" ? "left" : "right", "f0");
      const token = epoch;
      walkFrameTimer = setTimeout(() => {
        walkFrameTimer = null;
        if (token !== epoch || pose !== POSES.WALK) return;
        setPose(POSES.IDLE);
      }, WALK_REDUCED_MOTION_HOLD_MS);
      return true;
    }
    if (!setWalkFrame(direction, frameKey)) return false;
    bumpEpoch("enter-walk");
    markHostVisibleAttrs();
    setPose(POSES.WALK);
    setWalkFrame(direction, frameKey);
    return true;
  }

  function leaveWalk(reason) {
    if (pose !== POSES.WALK) return false;
    bumpEpoch(reason || "leave-walk");
    setPose(POSES.IDLE);
    return true;
  }

  function syncPurrFromState() {
    if (!isLatched() || !body || !body.dataset) return;
    if (body.dataset.purring === "1") enterPurr();
    else leavePurr("purr-cleared");
  }

  function schedulePeek(delayMs) {
    if (reducedMotion) return;
    if (pose !== POSES.SLEEP) return;
    const token = epoch;
    const wait =
      delayMs != null ? delayMs : randomBetween(nextPeekMinMs, nextPeekMaxMs);
    peekScheduleTimer = setTimeout(() => {
      peekScheduleTimer = null;
      if (token !== epoch) return;
      openPeek();
    }, wait);
  }

  function openPeek() {
    if (reducedMotion) return;
    if (pose !== POSES.SLEEP) return;
    if (!areSleepAssetsReady()) return;
    const token = epoch;
    setPose(POSES.SLEEP_PEEK);
    peekOpenTimer = setTimeout(() => {
      peekOpenTimer = null;
      if (token !== epoch) return;
      if (pose !== POSES.SLEEP_PEEK) return;
      setPose(POSES.SLEEP);
      schedulePeek();
    }, peekOpenMs);
  }

  function enterSleep() {
    // Sleep is an idle transition. It must never steal an exclusive V6 pose
    // whose controller is still running (notably the long hunt hold).
    if (!isLatched() || isEdgePeekExclusive() || pose !== POSES.IDLE) return false;
    if (!areSleepAssetsReady()) {
      setSleepStatus(sleepError ? "error" : "loading");
      setPose(POSES.IDLE);
      return false;
    }
    bumpEpoch("enter-sleep");
    const token = epoch;
    markHostVisibleAttrs();
    if (reducedMotion) {
      setPose(POSES.SLEEP);
      return true;
    }
    setPose(POSES.SLEEP_SETTLE);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (token !== epoch) return;
      if (pose !== POSES.SLEEP_SETTLE) return;
      setPose(POSES.SLEEP);
      schedulePeek(randomBetween(firstPeekMinMs, firstPeekMaxMs));
    }, settleMs);
    return true;
  }

  function wakeToIdle(reason) {
    bumpEpoch(reason || "wake");
    setPose(POSES.IDLE);
    return true;
  }

  function onVisibilityChange() {
    if (!doc) return;
    if (doc.visibilityState === "hidden") {
      wakeToIdle("visibility-hidden");
    }
  }

  function syncReducedMotion() {
    const next = prefersReducedMotion();
    if (next === reducedMotion) return;
    reducedMotion = next;
    if (
      reducedMotion &&
      (pose === POSES.SLEEP_SETTLE || pose === POSES.SLEEP_PEEK)
    ) {
      if (body && body.dataset && body.dataset.idleSleep === "1") {
        bumpEpoch("reduced-motion");
        setPose(POSES.SLEEP);
      } else {
        wakeToIdle("reduced-motion");
      }
    } else if (reducedMotion) {
      clearTimers();
    }
  }

  function start() {
    if (started) return;
    started = true;
    reducedMotion = prefersReducedMotion();
    setPose(POSES.IDLE);
    setSleepStatus("loading");
    if (body && body.dataset) body.dataset.v6PurrStatus = "loading";
    if (body && body.dataset) body.dataset.v6CelebrateStatus = "loading";
    if (body && body.dataset) body.dataset.v6TypingStatus = "loading";
    if (body && body.dataset) body.dataset.v6ScrollStatus = "loading";
    if (body && body.dataset) body.dataset.v6HuntStatus = "loading";
    if (body && body.dataset) body.dataset.v6TeaseStatus = "loading";
    if (body && body.dataset) body.dataset.v6EdgePeekStatus = "loading";
    if (body && body.dataset) body.dataset.v6WalkStatus = "loading";
    if (body && body.dataset) body.dataset.v6DanceStatus = "loading";
    markHostVisibleAttrs();
    loadSleepHosts();
    loadPurrHosts();
    loadCelebrateHosts();
    loadTypingHosts();
    loadScrollHosts();
    loadHuntHosts();
    loadTeaseHosts();
    loadEdgePeekHosts();
    loadWalkHosts();
    loadDanceHosts();

    if (doc && typeof doc.addEventListener === "function") {
      visibilityHandler = onVisibilityChange;
      doc.addEventListener("visibilitychange", visibilityHandler);
    }
    if (typeof MutationObserver === "function" && body) {
      purrObserver = new MutationObserver(syncPurrFromState);
      purrObserver.observe(body, {
        attributes: true,
        attributeFilter: ["data-purring"],
      });
    }
    syncPurrFromState();
    if (win && typeof win.matchMedia === "function") {
      try {
        reducedMotionMq = win.matchMedia("(prefers-reduced-motion: reduce)");
        if (reducedMotionMq && reducedMotionMq.addEventListener) {
          reducedMotionMq.addEventListener("change", syncReducedMotion);
        } else if (reducedMotionMq && reducedMotionMq.addListener) {
          reducedMotionMq.addListener(syncReducedMotion);
        }
      } catch (_) {}
    }

    const idle = getHost(HOST_IDS.idle);
    if (idle) {
      const warm = () => cacheHostAlpha(idle);
      if (idle.complete && idle.naturalWidth > 0) warm();
      else if (typeof idle.addEventListener === "function") {
        idle.addEventListener("load", warm, { once: true });
      }
    }
  }

  function stop() {
    bumpEpoch("stop");
    setPose(POSES.IDLE);
    if (doc && visibilityHandler) {
      doc.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
    if (purrObserver) {
      purrObserver.disconnect();
      purrObserver = null;
    }
    started = false;
  }

  return {
    POSES,
    start,
    stop,
    enterSleep,
    wakeToIdle,
    enterPurr,
    leavePurr,
    enterCelebrate,
    enterTyping,
    leaveTyping,
    enterScroll,
    leaveScroll,
    enterHunt,
    leaveHunt,
    getHuntFrameDuration,
    getHuntVisualState,
    enterTease,
    leaveTease,
    getTeaseFrameDuration,
    enterEdgePeek,
    leaveEdgePeek,
    enterWalk,
    leaveWalk,
    setWalkFrame,
    enterDance,
    leaveDance,
    areSleepAssetsReady,
    arePurrAssetsReady,
    areCelebrateAssetsReady,
    areTypingAssetsReady,
    areScrollAssetsReady,
    areHuntAssetsReady,
    areTeaseAssetsReady,
    areEdgePeekAssetsReady,
    areWalkAssetsReady,
    areDanceAssetsReady,
    getPose: () => pose,
    getActiveHost,
    getEpoch: () => epoch,
    isOpaqueHitPoint,
    isLatched,
    isReducedMotion: () => !!reducedMotion,
    getSleepStatus: () =>
      (body && body.dataset && body.dataset.v6SleepStatus) || "",
    getPurrStatus: () =>
      (body && body.dataset && body.dataset.v6PurrStatus) || "",
    SCROLL_RECOVERY_MS,
    SCROLL_REDUCED_MOTION_HOLD_MS,
    HUNT_REDUCED_MOTION_HOLD_MS,
    HUNT_HOLD_MAX_MS,
    TEASE_FRAMES,
    TEASE_HOST_IDS,
    TEASE_REDUCED_MOTION_HOLD_MS,
    WALK_FRAME_DURATION_MS,
    WALK_REDUCED_MOTION_HOLD_MS,
    DANCE_REDUCED_MOTION_HOLD_MS,
    _openPeek: openPeek,
    _schedulePeek: schedulePeek,
    _setReducedMotion(value) {
      reducedMotion = !!value;
    },
    _setSleepReady(value) {
      sleepReady = !!value;
      if (value) sleepError = false;
      setSleepStatus(value ? "ready" : sleepError ? "error" : "loading");
    },
    _forceSleepError() {
      sleepError = true;
      sleepReady = false;
      setSleepStatus("error");
      setPose(POSES.IDLE);
    },
    _setPurrReady(value) {
      purrReady = !!value;
      if (value) purrError = false;
      if (body && body.dataset) body.dataset.v6PurrStatus = value ? "ready" : purrError ? "error" : "loading";
    },
    _setCelebrateReady(value) {
      celebrateReady = !!value;
      if (value) celebrateError = false;
      if (body && body.dataset) {
        body.dataset.v6CelebrateStatus = value
          ? "ready"
          : celebrateError
            ? "error"
            : "loading";
      }
    },
    _setTypingReady(value) {
      typingReady = !!value;
      if (value) typingError = false;
      if (body && body.dataset) {
        body.dataset.v6TypingStatus = value
          ? "ready"
          : typingError
            ? "error"
            : "loading";
      }
    },
    _setScrollReady(value) {
      scrollReady = !!value;
      if (value) scrollError = false;
      if (body && body.dataset) {
        body.dataset.v6ScrollStatus = value
          ? "ready"
          : scrollError
            ? "error"
            : "loading";
      }
    },
    _setHuntReady(value) {
      huntReady = !!value;
      if (value) huntError = false;
      if (body && body.dataset) {
        body.dataset.v6HuntStatus = value
          ? "ready"
          : huntError
            ? "error"
            : "loading";
      }
    },
    _setWalkReady(value) {
      walkReady = !!value;
      if (value) walkError = false;
      if (body && body.dataset) {
        body.dataset.v6WalkStatus = value
          ? "ready"
          : walkError
            ? "error"
            : "loading";
      }
    },
    _setEdgePeekReady(value) {
      edgePeekReady = !!value;
      if (value) edgePeekError = false;
      if (body && body.dataset) {
        body.dataset.v6EdgePeekStatus = value
          ? "ready"
          : edgePeekError
            ? "error"
            : "loading";
      }
    },
    _setDanceReady(value) {
      danceReady = !!value;
      if (value) danceError = false;
      if (body && body.dataset) body.dataset.v6DanceStatus = value ? "ready" : danceError ? "error" : "loading";
    },
    SETTLE_MS: settleMs,
    PEEK_OPEN_MS: peekOpenMs,
    FIRST_PEEK_MIN_MS: firstPeekMinMs,
    FIRST_PEEK_MAX_MS: firstPeekMaxMs,
    NEXT_PEEK_MIN_MS: nextPeekMinMs,
    NEXT_PEEK_MAX_MS: nextPeekMaxMs,
  };
}

function previewEnabledFromSearch(search) {
  try {
    return new URLSearchParams(search || "").get("v6IdlePreview") === "1";
  } catch (_) {
    return false;
  }
}

if (typeof window === "object" && window.document) {
  const enabled = previewEnabledFromSearch(window.location && window.location.search);
  if (enabled) {
    const api = createV6VisualPose({
      body: document.body,
      document,
      window,
    });
    window.CatCodeV6VisualPose = api;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => api.start(), {
        once: true,
      });
    } else {
      api.start();
    }
  }
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    createV6VisualPose,
    POSES,
    HOST_IDS,
    SLEEP_HOST_IDS,
    PURR_FRAMES,
    PURR_HOST_IDS,
    CELEBRATE_FRAMES,
    CELEBRATE_HOST_IDS,
    TYPING_FRAMES,
    TYPING_HOST_IDS,
    SCROLL_FRAMES,
    SCROLL_HOST_IDS,
    SCROLL_RECOVERY_MS,
    SCROLL_REDUCED_MOTION_HOLD_MS,
    HUNT_FRAMES,
    HUNT_HOST_IDS,
    HUNT_ENTRY_FPS,
    HUNT_ENTRY_FRAME_MS,
    HUNT_REDUCED_MOTION_HOLD_MS,
    HUNT_HOLD_MAX_MS,
    TEASE_FRAMES,
    TEASE_HOST_IDS,
    TEASE_REDUCED_MOTION_HOLD_MS,
    EDGE_PEEK_FRAMES,
    EDGE_PEEK_HOST_IDS,
    WALK_FRAMES,
    WALK_HOST_IDS,
    WALK_FRAME_DURATION_MS,
    WALK_REDUCED_MOTION_HOLD_MS,
    DANCE_VARIANTS,
    DANCE_HOST_IDS,
    DANCE_REDUCED_MOTION_HOLD_MS,
    SETTLE_MS,
    PEEK_OPEN_MS,
    FIRST_PEEK_MIN_MS,
    FIRST_PEEK_MAX_MS,
    NEXT_PEEK_MIN_MS,
    NEXT_PEEK_MAX_MS,
  };
}
