"use strict";

// V4 idle gaze owner: translate only #v4-eye-left-move / #v4-eye-right-move.
// One complete narrow pupil group per eye. Integer authored-pixel snaps only.
// Legacy V2 tracker in renderer.js is disabled for V4 (layers = null).
// Stage G1: cache last real cursor payload and restore integer gaze when
// eligibility returns without waiting for a new cursor-pos IPC event.
// Stage G2: calm integer step transitions through measured safe offsets.

(() => {
  const THROTTLE_MS = 50;
  // Measured envelope for the 2×3 pupil inside the turquoise safe disk:
  // cardinals use the full safe range; diagonals use ±1 so all 9 stay distinct.
  const MAX_PUPIL_OFFSET = 2;
  const MAX_DX = 2;
  const MAX_DY_UP = 2;
  const MAX_DY_DOWN = 1;
  const DIAG_DX = 1;
  const DIAG_DY = 1;
  const AXIS_THRESHOLD = 0.28;
  const SATURATION_DIST = 280;
  const DEAD_ZONE = 36;
  const MAX_CURSOR_DELTA = 20000;
  /** Cadence between one-pixel integer steps (calm, still responsive). */
  const STEP_MS = 72;

  /** Canonical visually-distinct integer positions (center + 8 directions). */
  const GAZE_POSITIONS = Object.freeze({
    C: Object.freeze({ ox: 0, oy: 0 }),
    L: Object.freeze({ ox: -MAX_DX, oy: 0 }),
    R: Object.freeze({ ox: MAX_DX, oy: 0 }),
    U: Object.freeze({ ox: 0, oy: -MAX_DY_UP }),
    D: Object.freeze({ ox: 0, oy: MAX_DY_DOWN }),
    UL: Object.freeze({ ox: -DIAG_DX, oy: -DIAG_DY }),
    UR: Object.freeze({ ox: DIAG_DX, oy: -DIAG_DY }),
    DL: Object.freeze({ ox: -DIAG_DX, oy: DIAG_DY }),
    DR: Object.freeze({ ox: DIAG_DX, oy: DIAG_DY }),
  });

  /**
   * All integer offsets verified safe for the 2×3 pupil on both eyes
   * (every pupil cell stays inside turquoise iris). Includes the nine finals
   * plus one-pixel cardinal intermediates used for calm steps.
   */
  const SAFE_OFFSETS = Object.freeze([
    Object.freeze({ ox: 0, oy: 0 }),
    Object.freeze({ ox: -1, oy: 0 }),
    Object.freeze({ ox: 1, oy: 0 }),
    Object.freeze({ ox: 0, oy: -1 }),
    Object.freeze({ ox: 0, oy: 1 }),
    Object.freeze({ ox: -2, oy: 0 }),
    Object.freeze({ ox: 2, oy: 0 }),
    Object.freeze({ ox: 0, oy: -2 }),
    Object.freeze({ ox: -1, oy: -1 }),
    Object.freeze({ ox: 1, oy: -1 }),
    Object.freeze({ ox: -1, oy: 1 }),
    Object.freeze({ ox: 1, oy: 1 }),
  ]);

  const SAFE_KEYS = new Set(SAFE_OFFSETS.map((p) => `${p.ox},${p.oy}`));
  const ORTHO = Object.freeze([
    Object.freeze({ dx: 1, dy: 0 }),
    Object.freeze({ dx: -1, dy: 0 }),
    Object.freeze({ dx: 0, dy: 1 }),
    Object.freeze({ dx: 0, dy: -1 }),
  ]);

  const BLOCKING_BODY_ATTRS = [
    "data-purring",
    "data-idle-sleep",
    "data-idle-wake",
    "data-v4-sleep-peek",
    "data-hunting",
    "data-hunting-return",
    "data-pet-roaming",
    "data-cursor-stolen",
    // G-D3: block gaze only for an actual V4 dance visual — not mere music detection
    // (`data-music-dance`). Future authored dance must set data-v4-dance-active.
    "data-v4-dance-active",
    "data-pet-peek",
    "data-v4-blinking",
  ];

  const OBSERVED_BODY_ATTRS = [
    "class",
    "hidden",
    "aria-hidden",
    "data-v4-pose",
    "data-purring",
    "data-idle-sleep",
    "data-idle-wake",
    "data-v4-sleep-peek",
    "data-hunting",
    "data-hunting-return",
    "data-cursor-stolen",
    "data-music-dance",
    "data-v4-dance-active",
    "data-pet-roaming",
    "data-pet-peek",
    "data-typing",
    "data-v4-blinking",
  ];

  const MOVE_IDS = Object.freeze(["v4-eye-left-move", "v4-eye-right-move"]);

  let lastApply = 0;
  let targetDx = 0;
  let targetDy = 0;
  let appliedOx = 0;
  let appliedOy = 0;
  let goalOx = 0;
  let goalOy = 0;
  /** Remaining integer steps after the current applied position (newest retarget only). */
  let stepQueue = [];
  let stepTimer = null;
  let movers = null;
  let trackedDoc = null;
  let trackingEnabled = true;
  let reducedMotion = false;
  /** @type {{ dx: number, dy: number } | null} */
  let lastCursorPayload = null;
  let wasEligible = false;
  /** G-D1: resolved once; stays false when flag/API missing. */
  let diagnosticsEnabled = false;
  let diagnosticsResolved = false;
  let lastDiagEligible = null;
  let lastDiagMoversReady = null;

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

  function getBlockingReasons() {
    const reasons = [];
    if (!trackingEnabled) reasons.push("tracking-disabled");
    if (reducedMotion) reasons.push("reduced-motion");
    const body = document.body;
    if (!body) {
      reasons.push("no-body");
      return reasons;
    }
    if (body.dataset.catcodeModel !== "v4") reasons.push("not-v4-model");
    if (body.dataset.v4Pose && body.dataset.v4Pose !== "idle") {
      reasons.push("pose-not-idle");
    }
    if (body.classList.contains("dragging")) reasons.push("dragging");
    if (body.classList.contains("typing") || body.dataset.typing) {
      reasons.push("typing");
    }
    if (body.hidden) reasons.push("body-hidden");
    if (
      typeof body.getAttribute === "function" &&
      body.getAttribute("aria-hidden") === "true"
    ) {
      reasons.push("aria-hidden");
    }
    for (const attr of BLOCKING_BODY_ATTRS) {
      if (body.hasAttribute(attr)) reasons.push(attr);
    }
    return reasons;
  }

  function isEligible() {
    return getBlockingReasons().length === 0;
  }

  function collectStateFlags() {
    const body = document.body;
    const flags = {
      trackingEnabled: !!trackingEnabled,
      reducedMotion: !!reducedMotion,
      moversReady: !!(movers && movers.length === MOVE_IDS.length),
      dragging: false,
      typing: false,
      bodyHidden: false,
      purring: false,
      sleeping: false,
      blinking: false,
      musicDance: false,
      v4DanceActive: false,
      peek: false,
    };
    if (!body) return flags;
    flags.dragging = body.classList.contains("dragging");
    flags.typing = !!(body.classList.contains("typing") || body.dataset.typing);
    flags.bodyHidden = !!body.hidden;
    flags.purring = body.hasAttribute("data-purring");
    flags.sleeping = body.hasAttribute("data-idle-sleep");
    flags.blinking = body.hasAttribute("data-v4-blinking");
    flags.musicDance = body.hasAttribute("data-music-dance");
    flags.v4DanceActive = body.hasAttribute("data-v4-dance-active");
    flags.peek = body.hasAttribute("data-pet-peek");
    return flags;
  }

  function emitDiagnostics(payload) {
    try {
      if (!diagnosticsEnabled) return;
      const api = window.electronAPI;
      if (!api || typeof api.gazeDiagnosticsLog !== "function") return;
      const body = document.body;
      const event = {
        source: "gaze-sync",
        v4Pose: body && body.dataset ? body.dataset.v4Pose || "idle" : "unknown",
        flags: collectStateFlags(),
        ...payload,
      };
      const result = api.gazeDiagnosticsLog(event);
      if (result && typeof result.then === "function") {
        result.catch(() => {});
      }
    } catch {
      // Diagnostics must never affect the cat.
    }
  }

  function resolveDiagnosticsEnabled() {
    if (diagnosticsResolved) return;
    diagnosticsResolved = true;
    try {
      const api = window.electronAPI;
      if (!api || typeof api.gazeDiagnosticsEnabled !== "function") {
        diagnosticsEnabled = false;
        return;
      }
      const result = api.gazeDiagnosticsEnabled();
      if (result && typeof result.then === "function") {
        result
          .then((info) => {
            diagnosticsEnabled = !!(info && info.enabled);
          })
          .catch(() => {
            diagnosticsEnabled = false;
          });
      } else {
        diagnosticsEnabled = !!(result && result.enabled);
      }
    } catch {
      diagnosticsEnabled = false;
    }
  }

  function noteEligibilityTransition() {
    try {
      const eligible = isEligible();
      if (lastDiagEligible === eligible) return;
      lastDiagEligible = eligible;
      emitDiagnostics({
        type: "eligibility",
        eligible,
        blockingReasons: getBlockingReasons(),
        moversReady: !!(movers && movers.length === MOVE_IDS.length),
      });
    } catch {
      // ignore
    }
  }

  function ensureMovers(doc) {
    const prevReady = !!(movers && movers.length === MOVE_IDS.length);
    if (!doc || !doc.documentElement) {
      if (diagnosticsEnabled && lastDiagMoversReady !== false) {
        lastDiagMoversReady = false;
        emitDiagnostics({
          type: "movers",
          moversReady: false,
          eligible: isEligible(),
          blockingReasons: getBlockingReasons(),
        });
      }
      return null;
    }
    if (
      !doc.documentElement.matches ||
      !doc.documentElement.matches('svg[data-catcode-model="v4"]')
    ) {
      return null;
    }
    if (trackedDoc === doc && movers) return movers;
    const nodes = MOVE_IDS.map((id) => doc.getElementById(id)).filter(Boolean);
    if (nodes.length !== MOVE_IDS.length) {
      movers = null;
      trackedDoc = doc;
      trackingEnabled = false;
      if (diagnosticsEnabled && lastDiagMoversReady !== false) {
        lastDiagMoversReady = false;
        emitDiagnostics({
          type: "movers",
          moversReady: false,
          eligible: false,
          blockingReasons: getBlockingReasons(),
        });
      }
      return null;
    }
    trackedDoc = doc;
    trackingEnabled = true;
    movers = nodes.map((node) => {
      if (!node.dataset.v4AttBaseTransform) {
        node.dataset.v4AttBaseTransform = node.getAttribute("transform") || "";
      }
      return node;
    });
    if (diagnosticsEnabled && !prevReady) {
      lastDiagMoversReady = true;
      emitDiagnostics({
        type: "movers",
        moversReady: true,
        eligible: isEligible(),
        blockingReasons: getBlockingReasons(),
      });
    }
    return movers;
  }

  /**
   * Continuous look vector → one of the nine measured integer pupil positions.
   * Never emits fractional offsets.
   */
  function toIntegerOffset(dx, dy) {
    const x = Number(dx) || 0;
    const y = Number(dy) || 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...GAZE_POSITIONS.C };
    if (Math.abs(x) < AXIS_THRESHOLD && Math.abs(y) < AXIS_THRESHOLD) {
      return { ...GAZE_POSITIONS.C };
    }
    const horiz = Math.abs(x) >= AXIS_THRESHOLD;
    const vert = Math.abs(y) >= AXIS_THRESHOLD;
    if (horiz && vert) {
      const ox = x < 0 ? -DIAG_DX : DIAG_DX;
      const oy = y < 0 ? -DIAG_DY : DIAG_DY;
      return { ox, oy };
    }
    if (horiz) return { ox: x < 0 ? -MAX_DX : MAX_DX, oy: 0 };
    return { ox: 0, oy: y < 0 ? -MAX_DY_UP : MAX_DY_DOWN };
  }

  function labelForOffset(ox, oy) {
    for (const [label, pos] of Object.entries(GAZE_POSITIONS)) {
      if (pos.ox === ox && pos.oy === oy) return label;
    }
    return null;
  }

  function isSafeOffset(ox, oy) {
    return SAFE_KEYS.has(`${ox | 0},${oy | 0}`);
  }

  /**
   * Shortest orthogonal path across SAFE_OFFSETS from → to (excluding start,
   * including end). Falls back to a direct end hop if start is somehow unsafe.
   */
  function buildStepPath(fromOx, fromOy, toOx, toOy) {
    const sx = fromOx | 0;
    const sy = fromOy | 0;
    const tx = toOx | 0;
    const ty = toOy | 0;
    if (sx === tx && sy === ty) return [];
    if (!isSafeOffset(tx, ty)) return [];
    if (!isSafeOffset(sx, sy)) return [{ ox: tx, oy: ty }];

    const startKey = `${sx},${sy}`;
    const goalKey = `${tx},${ty}`;
    const queue = [{ ox: sx, oy: sy }];
    const prev = new Map([[startKey, null]]);

    while (queue.length) {
      const cur = queue.shift();
      const curKey = `${cur.ox},${cur.oy}`;
      if (curKey === goalKey) break;
      for (const step of ORTHO) {
        const nx = cur.ox + step.dx;
        const ny = cur.oy + step.dy;
        const key = `${nx},${ny}`;
        if (!SAFE_KEYS.has(key) || prev.has(key)) continue;
        prev.set(key, curKey);
        queue.push({ ox: nx, oy: ny });
      }
    }

    if (!prev.has(goalKey)) {
      // Should not happen inside the connected safe set; still land on goal.
      return [{ ox: tx, oy: ty }];
    }

    const rev = [];
    let walk = goalKey;
    while (walk && walk !== startKey) {
      const [ox, oy] = walk.split(",").map(Number);
      rev.push({ ox, oy });
      walk = prev.get(walk);
    }
    rev.reverse();
    return rev;
  }

  function clearStepTimer() {
    if (stepTimer !== null) {
      clearTimeout(stepTimer);
      stepTimer = null;
    }
  }

  function stopStepping() {
    clearStepTimer();
    stepQueue = [];
  }

  function applyIntegerOffsets(ox, oy) {
    if (!movers) return;
    const ix = ox | 0;
    const iy = oy | 0;
    if (ix === appliedOx && iy === appliedOy) return;
    appliedOx = ix;
    appliedOy = iy;
    const transform = ix === 0 && iy === 0 ? "" : `translate(${ix} ${iy})`;
    for (const node of movers) {
      const base = node.dataset.v4AttBaseTransform || "";
      const next = base && transform ? `${base} ${transform}` : base || transform;
      if (next) node.setAttribute("transform", next);
      else node.removeAttribute("transform");
    }
    emitDiagnostics({
      type: "transform",
      transformAction: "applied",
      direction: labelForOffset(ix, iy) || "step",
      eligible: isEligible(),
      blockingReasons: getBlockingReasons(),
      moversReady: true,
    });
  }

  function advanceStep() {
    stepTimer = null;
    if (!isEligible()) {
      stopStepping();
      goalOx = 0;
      goalOy = 0;
      targetDx = 0;
      targetDy = 0;
      applyIntegerOffsets(0, 0);
      return;
    }
    if (stepQueue.length === 0) {
      if (appliedOx !== goalOx || appliedOy !== goalOy) {
        stepQueue = buildStepPath(appliedOx, appliedOy, goalOx, goalOy);
      }
      if (stepQueue.length === 0) return;
    }
    const next = stepQueue.shift();
    applyIntegerOffsets(next.ox, next.oy);
    if (stepQueue.length > 0 || appliedOx !== goalOx || appliedOy !== goalOy) {
      stepTimer = setTimeout(advanceStep, STEP_MS);
    }
  }

  function ensureStepping() {
    if (stepTimer !== null) return;
    if (stepQueue.length === 0 && appliedOx === goalOx && appliedOy === goalOy) {
      return;
    }
    stepTimer = setTimeout(advanceStep, STEP_MS);
  }

  /**
   * Retarget the integer goal. Rebuilds the step path from the *current*
   * applied cell — never queues stale destinations behind an old path.
   */
  function setIntegerGoal(ox, oy, { immediate = false } = {}) {
    goalOx = ox | 0;
    goalOy = oy | 0;
    if (immediate || (appliedOx === goalOx && appliedOy === goalOy)) {
      stopStepping();
      applyIntegerOffsets(goalOx, goalOy);
      return;
    }
    stepQueue = buildStepPath(appliedOx, appliedOy, goalOx, goalOy);
    if (stepQueue.length === 0) {
      applyIntegerOffsets(goalOx, goalOy);
      return;
    }
    ensureStepping();
  }

  function resetVisual() {
    const hadOffset = appliedOx !== 0 || appliedOy !== 0;
    targetDx = 0;
    targetDy = 0;
    goalOx = 0;
    goalOy = 0;
    stopStepping();
    applyIntegerOffsets(0, 0);
    if (hadOffset || diagnosticsEnabled) {
      emitDiagnostics({
        type: "transform",
        transformAction: "reset",
        direction: "C",
        eligible: isEligible(),
        blockingReasons: getBlockingReasons(),
        moversReady: !!(movers && movers.length === MOVE_IDS.length),
      });
    }
  }

  function cacheCursorPayload(payload) {
    const dx = Number(payload && payload.dx);
    const dy = Number(payload && payload.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    lastCursorPayload = { dx, dy };
    return true;
  }

  function applyLookFromPayload(dx, dy, { snap = false } = {}) {
    const look = computeLookTargets(dx, dy);
    targetDx = look.targetDx;
    targetDy = look.targetDy;
    const off = toIntegerOffset(targetDx, targetDy);
    setIntegerGoal(off.ox, off.oy, { immediate: !!snap });
  }

  function resumeFromCachedCursor() {
    reducedMotion = prefersReducedMotion();
    const cat = document.getElementById("cat");
    const doc = cat && cat.contentDocument;
    ensureMovers(doc);
    if (!isEligible() || !movers) {
      resetVisual();
      return false;
    }
    if (!lastCursorPayload) {
      // No real cursor sample yet — stay centered.
      return false;
    }
    applyLookFromPayload(lastCursorPayload.dx, lastCursorPayload.dy, {
      snap: true,
    });
    return true;
  }

  /**
   * Body-attr / reduced-motion transitions. Centers while blocked; when
   * eligibility returns, restores the last cached look without new IPC.
   */
  function syncEligibility() {
    reducedMotion = prefersReducedMotion();
    const eligible = isEligible();
    noteEligibilityTransition();
    if (!eligible) {
      wasEligible = false;
      resetVisual();
      return;
    }
    const cat = document.getElementById("cat");
    ensureMovers(cat && cat.contentDocument);
    if (!wasEligible) {
      resumeFromCachedCursor();
    }
    wasEligible = true;
  }

  function handleCursor(payload) {
    // Always remember the latest real sample, including while blocked, so a
    // stationary cursor can restore gaze after purr/blink/etc. without IPC.
    cacheCursorPayload(payload);
    const now = Date.now();
    if (now - lastApply < THROTTLE_MS) return;
    lastApply = now;
    reducedMotion = prefersReducedMotion();
    const cat = document.getElementById("cat");
    const doc = cat && cat.contentDocument;
    ensureMovers(doc);
    noteEligibilityTransition();
    if (!isEligible() || !movers) {
      wasEligible = false;
      resetVisual();
      emitDiagnostics({
        type: "cursor-payload",
        source: "gaze-sync",
        payloadReceived: true,
        eligible: false,
        blockingReasons: getBlockingReasons(),
        moversReady: !!movers,
        direction: "C",
      });
      return;
    }
    wasEligible = true;
    const look = computeLookTargets(
      Number(payload && payload.dx) || 0,
      Number(payload && payload.dy) || 0,
    );
    const off = toIntegerOffset(look.targetDx, look.targetDy);
    emitDiagnostics({
      type: "cursor-payload",
      source: "gaze-sync",
      payloadReceived: true,
      eligible: true,
      blockingReasons: [],
      moversReady: true,
      direction: labelForOffset(off.ox, off.oy) || "unknown",
    });
    applyLookFromPayload(
      Number(payload && payload.dx) || 0,
      Number(payload && payload.dy) || 0,
      { snap: false },
    );
  }

  function computeLookTargets(dx, dy) {
    let x = Number(dx) || 0;
    let y = Number(dy) || 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { targetDx: 0, targetDy: 0 };
    }
    x = Math.max(-MAX_CURSOR_DELTA, Math.min(MAX_CURSOR_DELTA, x));
    y = Math.max(-MAX_CURSOR_DELTA, Math.min(MAX_CURSOR_DELTA, y));
    const dist = Math.hypot(x, y);
    if (dist < DEAD_ZONE) return { targetDx: 0, targetDy: 0 };
    const intensity = Math.min(1, dist / SATURATION_DIST);
    return {
      targetDx: (x / dist) * intensity,
      targetDy: (y / dist) * intensity,
    };
  }

  function bind() {
    if (window.__catCodeV4CursorAttentionBound) return;
    if (!window.electronAPI || typeof window.electronAPI.onCursorPos !== "function") {
      return;
    }
    window.__catCodeV4CursorAttentionBound = true;
    resolveDiagnosticsEnabled();
    // Single V4 gaze owner. Legacy createSvgTracking also subscribes but sets
    // layers=null for V4 and never transforms eye groups.
    window.electronAPI.onCursorPos(handleCursor);
    reducedMotion = prefersReducedMotion();
    wasEligible = isEligible();
    try {
      if (typeof matchMedia === "function") {
        const mq = matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => {
          syncEligibility();
        };
        if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
        else if (typeof mq.addListener === "function") mq.addListener(onChange);
      }
    } catch {
      // ignore
    }
    const cat = document.getElementById("cat");
    cat?.addEventListener("load", () => {
      movers = null;
      trackedDoc = null;
      trackingEnabled = true;
      appliedOx = 1;
      appliedOy = 1;
      ensureMovers(cat.contentDocument);
      resetVisual();
      wasEligible = false;
      syncEligibility();
    });
    const observer = new MutationObserver(() => {
      syncEligibility();
    });
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: OBSERVED_BODY_ATTRS,
      });
    }
  }

  window.CatCodeV4CursorAttention = {
    handleCursor,
    isEligible,
    getBlockingReasons,
    ensureMovers,
    MOVE_IDS,
    THROTTLE_MS,
    STEP_MS,
    MAX_PUPIL_OFFSET,
    MAX_DX,
    MAX_DY_UP,
    MAX_DY_DOWN,
    GAZE_POSITIONS,
    SAFE_OFFSETS,
    SATURATION_DIST,
    DEAD_ZONE,
    MAX_CURSOR_DELTA,
    computeLookTargets,
    toIntegerOffset,
    labelForOffset,
    isSafeOffset,
    buildStepPath,
    setIntegerGoal,
    resetVisual,
    syncEligibility,
    resumeFromCachedCursor,
    getCachedCursor: () =>
      lastCursorPayload ? { ...lastCursorPayload } : null,
    getMovers: () => movers,
    getTargets: () => ({ targetDx, targetDy }),
    getGoal: () => ({ ox: goalOx, oy: goalOy }),
    getApplied: () => ({ ox: appliedOx, oy: appliedOy }),
    getStepQueue: () => stepQueue.map((s) => ({ ...s })),
    isStepping: () => stepTimer !== null || stepQueue.length > 0,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
