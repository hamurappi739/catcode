"use strict";

// V6 raster art has baked pupils, so gaze is an explicit canvas layer. It
// redraws each iris and exactly one whole pupil per eye; no part of a pupil is
// left at its old centre and no direction vector is ever rendered. Iris and
// highlight coverage comes from exact atlas runs. The small pupil track is
// separately measured because those atlas runs intentionally omit the baked
// pupil hole.

const GAZE_MASKS = (typeof window === "object" && window.CatCodeV6GazeMasks)
  || (typeof require === "function" ? require("./v6-gaze-masks") : null);
const REFERENCE_IDLE_GAZE = (typeof window === "object" && window.CatCodeV6ReferenceIdleGaze)
  || (typeof require === "function" ? require("./v6-reference-idle-gaze-contract") : null);

const V6_GAZE_VIEWBOX = 1024;
const CURSOR_SATURATION_PX = 420;
const GAZE_RESPONSE_MS = 135;
const IDLE_ATTENTION_RESPONSE_MS = 175;
const IDLE_ATTENTION_MAX_ROTATE_DEG = 1.15;
const IDLE_ATTENTION_MAX_TRANSLATE_X_PX = 1.7;
const IDLE_ATTENTION_MAX_TRANSLATE_Y_PX = 0.75;
const HEAD_MOTION_RESPONSE_MS = 190;
/** Idle head nudge in CSS pixels (not 1024-viewbox units). */
const IDLE_HEAD_MAX_TRANSLATE_X = 1.5;
const IDLE_HEAD_MAX_TRANSLATE_Y = 1.5;
const IDLE_HEAD_MAX_ROTATE_DEG = 1.2;
const HUNT_HEAD_MAX_TRANSLATE_X = 7;
const HUNT_HEAD_MAX_TRANSLATE_Y = 3;
const HUNT_HEAD_MAX_ROTATE_DEG = 0.8;
// Keep the finished hunt f8 silhouette intact for now. Its supplied layer
// pair remains available for a future, hand-authored head-motion pass.
const HUNT_HEAD_MOTION_ENABLED = false;
// Idle has an accepted authored, overlapping body/head pair.
const HEAD_MOTION_ENABLED = true;
const DEFAULT_EYE_PALETTE = Object.freeze({
  iris: "#48dfe1",
  irisLight: "#8ff7f1",
  pupil: "#092d3a",
});

const EYE_LAYOUTS = Object.freeze({
  idle: Object.freeze([
    // Measured from the authored idle pupil centres, not the old rough eye
    // centres. The former values left each live pupil visibly off-centre.
    { x: 387, y: 420, maxX: 26, maxY: 12, pupilBounds: [344, 382, 430, 458] },
    { x: 582, y: 420, maxX: 26, maxY: 12, pupilBounds: [539, 382, 625, 458] },
  ]),
  // Retired: misaligned to the current crouched f8 face (~y742). Never selected.
  hunt: Object.freeze([
    { x: 360, y: 555, maxX: 29, maxY: 12 },
    { x: 578, y: 555, maxX: 29, maxY: 12 },
  ]),
});

// Measured from hunt-f8-watch-hold.png (see docs/design/v6-hunt-final-gaze-rig/).
const HUNT_FINAL_EYE_LAYOUT = Object.freeze([
  Object.freeze({
    id: "left",
    x: 275,
    y: 742,
    maxX: 28,
    maxY: 12,
    irisBBox: Object.freeze([217, 695, 321, 785]),
    pupilBounds: Object.freeze([230, 704, 320, 780]),
  }),
  Object.freeze({
    id: "right",
    x: 460,
    y: 742,
    maxX: 28,
    maxY: 12,
    irisBBox: Object.freeze([417, 695, 527, 785]),
    pupilBounds: Object.freeze([417, 704, 505, 780]),
  }),
]);

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function targetFromCursor(dx, dy, saturationPx = CURSOR_SATURATION_PX) {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 0.001) return { x: 0, y: 0 };
  const reach = Math.min(1, distance / saturationPx);
  return {
    x: (dx / distance) * reach,
    y: (dy / distance) * reach,
  };
}

function smoothToward(current, target, elapsedMs, responseMs = GAZE_RESPONSE_MS) {
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / Math.max(1, responseMs));
  const next = current + (target - current) * alpha;
  return Math.abs(next - target) < 0.0008 ? target : next;
}

function prefersReducedMotion(win) {
  try {
    if (
      win &&
      win.CatCodeV6VisualPose &&
      typeof win.CatCodeV6VisualPose.isReducedMotion === "function"
    ) {
      return !!win.CatCodeV6VisualPose.isReducedMotion();
    }
    if (win && typeof win.matchMedia === "function") {
      return !!win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

function activeLayout(body, win = typeof window !== "undefined" ? window : null) {
  if (!body || !body.dataset || body.dataset.catcodeModel !== "v6-idle-preview") return null;
  if (body.dataset.v6Pose === "idle") return "idle";
  // Final hunt hold only: measured crouch eyes on #v6-hunt-gaze-layer.
  // Reduced motion keeps the layout but freezes look at centre (see tick).
  if (
    body.dataset.v6Pose === "hunt" &&
    body.dataset.v6HuntFrame === "f8" &&
    body.dataset.v6HuntGaze === "1"
  ) {
    return "huntFinal";
  }
  return null;
}

function eyePaletteForSkin(win = typeof window !== "undefined" ? window : null) {
  const catalog = win && win.CatCodeV6SkinCatalog;
  const selected = win && win.CatCodeV6Skin && typeof win.CatCodeV6Skin.getSelected === "function"
    ? win.CatCodeV6Skin.getSelected()
    : null;
  if (catalog && selected && typeof catalog.getV6Skin === "function") {
    const skin = catalog.getV6Skin(selected.id);
    if (skin && skin.eyePalette) return skin.eyePalette;
  }
  return DEFAULT_EYE_PALETTE;
}

function selectedSkinId(winRef) {
  const selected =
    winRef &&
    winRef.CatCodeV6Skin &&
    typeof winRef.CatCodeV6Skin.getSelected === "function"
      ? winRef.CatCodeV6Skin.getSelected()
      : null;
  return selected && selected.id ? selected.id : null;
}

function referenceIdleGaze(winRef) {
  const api = (winRef && winRef.CatCodeV6ReferenceIdleGaze) || REFERENCE_IDLE_GAZE;
  if (!api || typeof api.get !== "function") return null;
  const id = selectedSkinId(winRef);
  if (!id) return null;
  const row = api.get(id);
  return row && row.ok ? row : null;
}

const referenceInteriorSets = new WeakMap();
function eyeInteriorSet(mask) {
  let set = referenceInteriorSets.get(mask);
  if (set) return set;
  set = new Set();
  for (const runs of [mask.irisRuns, mask.pupilRuns]) {
    for (const run of runs || []) {
      const y = run[0];
      for (let x = run[1]; x <= run[2]; x += 1) set.add(y * V6_GAZE_VIEWBOX + x);
    }
  }
  referenceInteriorSets.set(mask, set);
  return set;
}

const irisPixelSets = new WeakMap();
function irisPixelSet(mask) {
  let set = irisPixelSets.get(mask);
  if (set) return set;
  set = new Set();
  for (const run of mask.irisRuns || []) {
    const y = run[0];
    for (let x = run[1]; x <= run[2]; x += 1) set.add(y * V6_GAZE_VIEWBOX + x);
  }
  irisPixelSets.set(mask, set);
  return set;
}

function drawReferenceIdleGaze(context, contract, lookX, lookY, palette) {
  const painted = { ok: false, left: 0, right: 0 };
  if (!context || !contract || !contract.eyes || contract.eyes.length !== 2) return painted;
  const masks = { idle: contract.masks };
  for (const eye of contract.eyes) {
    if (!drawPixelIris(context, eye, lookX, lookY, palette, "idle", masks)) {
      return { ok: false, left: 0, right: 0 };
    }
    painted[eye.id] = 1;
  }
  painted.ok = painted.left > 0 && painted.right > 0;
  return painted;
}

function idleGazePack(winRef) {
  const row = referenceIdleGaze(winRef);
  if (row && row.masks && row.masks.left && row.masks.right) {
    return { left: row.masks.left, right: row.masks.right };
  }
  return GAZE_MASKS && GAZE_MASKS.idle;
}

function idleEyeLayout(winRef) {
  const row = referenceIdleGaze(winRef);
  if (row && Array.isArray(row.eyes) && row.eyes.length === 2) {
    return row.eyes.map((eye) => ({
      id: eye.id,
      x: eye.x,
      y: eye.y,
      maxX: eye.maxX,
      maxY: eye.maxY,
      pupilBounds: eye.pupilBounds,
    }));
  }
  return EYE_LAYOUTS.idle;
}

function gazeMaskForEye(layout, eye, masks = GAZE_MASKS) {
  if (!masks) return null;
  const pack = layout === "huntFinal" ? masks.huntFinal : masks[layout];
  if (!pack) return null;
  const side = eye && eye.id === "right" ? "right"
    : eye && eye.id === "left" ? "left"
    : eye && eye.x >= 500 ? "right"
    : "left";
  const mask = pack[side];
  if (!mask || !mask.irisRuns || mask.irisRuns.length === 0) return null;
  return mask;
}

function fillExactRuns(context, runs, color) {
  if (!context || !runs || !runs.length) return 0;
  context.fillStyle = color;
  for (let i = 0; i < runs.length; i += 1) {
    const y = runs[i][0];
    const x0 = runs[i][1];
    const x1 = runs[i][2];
    context.fillRect(x0, y, x1 - x0 + 1, 1);
  }
  return runs.length;
}

function pupilPixelInsideTrack(eye, x, y) {
  if (!eye || !eye.pupilBounds) return false;
  const [x0, y0, x1, y1] = eye.pupilBounds;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

const PUPIL_FOOTPRINT = Object.freeze([
  Object.freeze({ y0: -26, y1: -19, width: 12 }),
  Object.freeze({ y0: -18, y1: -13, width: 22 }),
  Object.freeze({ y0: -12, y1: 16, width: 30 }),
  Object.freeze({ y0: 17, y1: 22, width: 22 }),
  Object.freeze({ y0: 23, y1: 26, width: 12 }),
]);

function pupilOrigin(eye, lookX, lookY) {
  return {
    // One source pixel is sub-pixel movement at the on-screen V6 scale. Do
    // not snap to a four-pixel grid: that was the visible "jump" in the eyes.
    px: Math.round(eye.x + lookX * eye.maxX),
    py: Math.round(eye.y + lookY * eye.maxY),
  };
}

function pupilFootprintRects(eye, lookX, lookY) {
  const { px, py } = pupilOrigin(eye, lookX, lookY);
  return PUPIL_FOOTPRINT.map(({ y0, y1, width }) => ({
    x: px - Math.floor(width / 2),
    y: py + y0,
    w: width,
    h: y1 - y0 + 1,
  }));
}

function fillClippedPupil(context, eye, lookX, lookY, palette, mask) {
  const rects = pupilFootprintRects(eye, lookX, lookY);
  const iris = irisPixelSet(mask);
  context.fillStyle = palette.pupil;
  let painted = 0;
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (!pupilPixelInsideTrack(eye, x, y) || !iris.has(y * V6_GAZE_VIEWBOX + x)) continue;
        context.fillRect(x, y, 1, 1);
        painted += 1;
      }
    }
  }
  return painted;
}

/** Pupil-only path (idle + huntFinal): exact footprint ∩ pupil track.
 * Do NOT require irisRuns — both idle and huntFinal irisRuns omit the resting
 * pupil hole, so an iris clip hides the centre pupil on pupil-free bases. */
function fillPupilFootprintOnly(context, eye, lookX, lookY, palette) {
  const rects = pupilFootprintRects(eye, lookX, lookY);
  context.fillStyle = palette.pupil;
  let painted = 0;
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (!pupilPixelInsideTrack(eye, x, y)) continue;
        context.fillRect(x, y, 1, 1);
        painted += 1;
      }
    }
  }
  return painted;
}

function drawExactIrisGaze(context, eye, lookX, lookY, palette, mask) {
  if (!context || !mask) return false;
  if (Object.prototype.hasOwnProperty.call(mask, "pupilRuns")) {
    if (!mask.pupilRuns || !mask.pupilRuns.length) return false;
    // Reference idle uses the same overlay painter as Ginger/Black, but the
    // authored slit is the pupil footprint. Do not flatten the whole iris.
    // Iris/pupil writes stay inside the authored eye interior (iris∪pupilRuns).
    const clip = eyeInteriorSet(mask);
    context.fillStyle = palette.iris;
    for (const run of mask.pupilRuns) {
      const y = run[0];
      for (let x = run[1]; x <= run[2]; x += 1) {
        if (clip.has(y * V6_GAZE_VIEWBOX + x)) context.fillRect(x, y, 1, 1);
      }
    }
    fillExactRuns(context, mask.highlightRuns, palette.irisLight);
    const dx = Math.round(lookX * eye.maxX);
    const dy = Math.round(lookY * eye.maxY);
    context.fillStyle = palette.pupil;
    let painted = 0;
    for (const run of mask.pupilRuns) {
      const y = run[0] + dy;
      for (let x = run[1] + dx; x <= run[2] + dx; x += 1) {
        if (!clip.has(y * V6_GAZE_VIEWBOX + x)) continue;
        context.fillRect(x, y, 1, 1);
        painted += 1;
      }
    }
    return painted > 0;
  }
  fillExactRuns(context, mask.irisRuns, palette.iris);
  // Clear the old pupil footprint only where the exact iris atlas owns it.
  // A footprint rectangle is larger than an iris on some poses; painting it
  // unmasked leaked iris colour onto the final hunt paw.
  const sourceRects = pupilFootprintRects(eye, 0, 0);
  const iris = irisPixelSet(mask);
  context.fillStyle = palette.iris;
  for (const rect of sourceRects) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (iris.has(y * V6_GAZE_VIEWBOX + x)) context.fillRect(x, y, 1, 1);
      }
    }
  }
  fillExactRuns(context, mask.highlightRuns, palette.irisLight);
  fillClippedPupil(context, eye, lookX, lookY, palette, mask);
  return true;
}

function drawPixelIris(context, eye, lookX, lookY, palette = DEFAULT_EYE_PALETTE, layout = "idle", masks) {
  const mask = gazeMaskForEye(layout, eye, masks);
  if (!mask) return false;
  return drawExactIrisGaze(context, eye, lookX, lookY, palette, mask);
}

function drawPupilOnly(context, eye, lookX, lookY, palette = DEFAULT_EYE_PALETTE, layout = "idle", masks) {
  const mask = gazeMaskForEye(layout, eye, masks);
  if (!mask) return false;
  // Pupil-only idle and huntFinal: footprint∩track only. irisRuns omit the
  // resting pupil hole on pupil-free bases, so an iris membership clip hides
  // the centre pupil. Full iris+pupil painters still use fillClippedPupil.
  return fillPupilFootprintOnly(context, eye, lookX, lookY, palette) > 0;
}

function huntFinalPupilRects(eye, lookX, lookY) {
  return pupilFootprintRects(eye, lookX, lookY);
}

function pupilRectsInsideIrisBBox(eye, lookX, lookY) {
  const [x0, y0, x1, y1] = eye.irisBBox;
  return huntFinalPupilRects(eye, lookX, lookY).every(
    (rect) => rect.x >= x0 && rect.y >= y0 && rect.x + rect.w - 1 <= x1 && rect.y + rect.h - 1 <= y1,
  );
}

function drawHuntFinalPupil(context, eye, lookX, lookY, palette = DEFAULT_EYE_PALETTE) {
  const mask = gazeMaskForEye("huntFinal", eye);
  if (!mask) return false;
  return drawExactIrisGaze(context, eye, lookX, lookY, palette, mask);
}

function pupilPixelsInsideExactIris(eye, lookX, lookY, layout = "huntFinal") {
  const mask = gazeMaskForEye(layout, eye);
  if (!mask) return false;
  return huntFinalPupilRects(eye, lookX, lookY).every((rect) => {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (!pupilPixelInsideTrack(eye, x, y)) return false;
      }
    }
    return true;
  });
}

function sourceForLayout(doc, layout) {
  if (!doc || typeof doc.getElementById !== "function") return null;
  if (layout === "huntFinal" || layout === "hunt") return doc.getElementById("v6-hunt-f8");
  return doc.getElementById("v6-idle-preview");
}

function sourceIsReady(source) {
  // Owner Ginger/Midnight idle head/body layers are authored at 256×256.
  // The obsolete 1024 gate left headLayersReady false forever on those skins.
  const w = source && source.naturalWidth;
  const h = source && source.naturalHeight;
  return !!(Number.isFinite(w) && Number.isFinite(h) && w >= 256 && h >= 256);
}

function wireV6Gaze({
  win = window,
  electronAPI = win && win.electronAPI,
  document: doc = win && win.document,
  responseMs = GAZE_RESPONSE_MS,
} = {}) {
  const body = doc && doc.body;
  const idleBodyLayer = doc && doc.getElementById ? doc.getElementById("v6-idle-body-layer") : null;
  const idleHeadLayer = doc && doc.getElementById ? doc.getElementById("v6-idle-head-layer") : null;
  const huntBodyLayer = doc && doc.getElementById ? doc.getElementById("v6-hunt-body-layer") : null;
  const huntHeadLayer = doc && doc.getElementById ? doc.getElementById("v6-hunt-head-layer") : null;
  const canvas = doc && doc.getElementById ? doc.getElementById("v6-gaze-layer") : null;
  const huntCanvas = doc && doc.getElementById ? doc.getElementById("v6-hunt-gaze-layer") : null;
  const context = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  const huntContext =
    huntCanvas && typeof huntCanvas.getContext === "function" ? huntCanvas.getContext("2d") : null;
  let target = { x: 0, y: 0 };
  let applied = { x: 0, y: 0 };
  let lastFrameAt = null;
  let rafId = null;
  let lastLayout = null;
  let attention = { x: 0, y: 0, rotate: 0 };
  let headMotion = { x: 0, y: 0, rotate: 0 };

  function requestImageLayer(layer) {
    if (!layer || !layer.dataset || !layer.dataset.src) return;
    if (typeof layer.getAttribute === "function" && layer.getAttribute("src")) return;
    if (typeof layer.getAttribute !== "function" && layer.src) return;
    layer.hidden = false;
    layer.dataset.v6SkinLayer = "1";
    if (win.CatCodeV6Skin && typeof win.CatCodeV6Skin.setHostSource === "function") {
      win.CatCodeV6Skin.setHostSource(layer);
    } else {
      layer.src = layer.dataset.src;
    }
  }

  function setIdleAttention(next) {
    if (!body || !body.style) return;
    body.style.setProperty("--v6-idle-attention-x", `${next.x.toFixed(2)}px`);
    body.style.setProperty("--v6-idle-attention-y", `${next.y.toFixed(2)}px`);
    body.style.setProperty("--v6-idle-attention-rotate", `${next.rotate.toFixed(2)}deg`);
  }

  function resetIdleAttention() {
    attention = { x: 0, y: 0, rotate: 0 };
    if (!body || !body.style) return;
    body.style.removeProperty("--v6-idle-attention-x");
    body.style.removeProperty("--v6-idle-attention-y");
    body.style.removeProperty("--v6-idle-attention-rotate");
  }

  function resetHeadMotion() {
    headMotion = { x: 0, y: 0, rotate: 0 };
    if (body && body.dataset) delete body.dataset.v6HeadMotionReady;
    if (body && body.dataset) delete body.dataset.v6IdleSplit;
    if (body && body.style) {
      body.style.removeProperty("--v6-head-motion-x");
      body.style.removeProperty("--v6-head-motion-y");
      body.style.removeProperty("--v6-head-motion-rotate");
    }
  }

  function headLayersReady(layout) {
    const selected = win && win.CatCodeV6Skin && typeof win.CatCodeV6Skin.getSelected === "function"
      ? win.CatCodeV6Skin.getSelected()
      : null;
    // Split idle head/body layers are only safe for skins that ship matching
    // authored layers (Snowball default + owner Ginger). Other custom skins
    // stay as one complete authored image to avoid white layer seams.
    if (selected && selected.id && selected.id !== "snowball") {
      const catalog = win && win.CatCodeV6SkinCatalog;
      const skin = catalog && typeof catalog.getV6Skin === "function"
        ? catalog.getV6Skin(selected.id)
        : null;
      if (!(skin && skin.idleHeadLayers)) return false;
    }
    if (layout === "hunt" || layout === "huntFinal") {
      // Hunt never uses the failed split-head system for custom skins.
      return sourceIsReady(huntBodyLayer) && sourceIsReady(huntHeadLayer);
    }
    return sourceIsReady(idleBodyLayer) && sourceIsReady(idleHeadLayer);
  }

  function setHeadLayerMotion(next) {
    if (!body || !body.style) return;
    // CSS consumes these as px on #v6-idle-head-layer only (never the body layer).
    body.style.setProperty("--v6-head-motion-x", `${next.x.toFixed(2)}px`);
    body.style.setProperty("--v6-head-motion-y", `${next.y.toFixed(2)}px`);
    body.style.setProperty("--v6-head-motion-rotate", `${next.rotate.toFixed(3)}deg`);
  }

  function updateHeadMotion(layout, elapsed) {
    if (
      !HEAD_MOTION_ENABLED ||
      layout !== "idle" ||
      !headLayersReady(layout)
    ) {
      resetHeadMotion();
      return false;
    }
    const limits = {
      x: IDLE_HEAD_MAX_TRANSLATE_X,
      y: IDLE_HEAD_MAX_TRANSLATE_Y,
      rotate: IDLE_HEAD_MAX_ROTATE_DEG,
    };
    const next = {
      x: target.x * limits.x,
      y: target.y * limits.y,
      rotate: target.x * limits.rotate,
    };
    headMotion = {
      x: smoothToward(headMotion.x, next.x, elapsed, HEAD_MOTION_RESPONSE_MS),
      y: smoothToward(headMotion.y, next.y, elapsed, HEAD_MOTION_RESPONSE_MS),
      rotate: smoothToward(headMotion.rotate, next.rotate, elapsed, HEAD_MOTION_RESPONSE_MS),
    };
    setHeadLayerMotion(headMotion);
    if (body && body.dataset) {
      body.dataset.v6HeadMotionReady = "1";
      body.dataset.v6IdleSplit = "1";
    }
    return (
      headMotion.x !== next.x ||
      headMotion.y !== next.y ||
      headMotion.rotate !== next.rotate
    );
  }

  function updateIdleAttention(layout, elapsed) {
    if (layout !== "idle") {
      resetIdleAttention();
      return false;
    }
    const targetAttention = {
      x: target.x * IDLE_ATTENTION_MAX_TRANSLATE_X_PX,
      y: target.y * IDLE_ATTENTION_MAX_TRANSLATE_Y_PX,
      rotate: target.x * IDLE_ATTENTION_MAX_ROTATE_DEG,
    };
    attention = {
      x: smoothToward(attention.x, targetAttention.x, elapsed, IDLE_ATTENTION_RESPONSE_MS),
      y: smoothToward(attention.y, targetAttention.y, elapsed, IDLE_ATTENTION_RESPONSE_MS),
      rotate: smoothToward(attention.rotate, targetAttention.rotate, elapsed, IDLE_ATTENTION_RESPONSE_MS),
    };
    setIdleAttention(attention);
    return (
      attention.x !== targetAttention.x ||
      attention.y !== targetAttention.y ||
      attention.rotate !== targetAttention.rotate
    );
  }

  function requestTick() {
    if (rafId != null || !win || typeof win.requestAnimationFrame !== "function") return;
    const id = win.requestAnimationFrame((timestamp) => {
      if (rafId === id) rafId = null;
      tick(timestamp);
    });
    rafId = id;
  }

  function clearIdle() {
    if (context) context.clearRect(0, 0, V6_GAZE_VIEWBOX, V6_GAZE_VIEWBOX);
  }

  function clearHunt() {
    if (huntContext) huntContext.clearRect(0, 0, V6_GAZE_VIEWBOX, V6_GAZE_VIEWBOX);
  }

  function clear() {
    clearIdle();
    clearHunt();
  }

  function skinAllowsGazeOverlay(winRef, layout) {
    const selected =
      winRef &&
      winRef.CatCodeV6Skin &&
      typeof winRef.CatCodeV6Skin.getSelected === "function"
        ? winRef.CatCodeV6Skin.getSelected()
        : null;
    if (!selected || !selected.id || selected.id === "snowball") return true;
    const catalog = winRef && winRef.CatCodeV6SkinCatalog;
    const skin =
      catalog && typeof catalog.getV6Skin === "function"
        ? catalog.getV6Skin(selected.id)
        : null;
    if (!skin) return true;
    if (skin.stillEyes) return false;
    const contractApi = winRef && winRef.CatCodeV6LiveGazeSkinContract;
    if (contractApi && typeof contractApi.registerLiveGazeSkin === "function") {
      if (skin.liveGazeRecolorOnly) {
        if (layout === "idle") return contractApi.registerLiveGazeSkin(skin).ok;
        return !!(skin.eyePalette && skin.eyePalette.pupil);
      }
    }
    return true;
  }

  function skinUsesPupilOnlyGaze(winRef) {
    if (
      winRef &&
      winRef.document &&
      winRef.document.body &&
      winRef.document.body.dataset &&
      winRef.document.body.dataset.v6GazePaintMode === "pupil-only"
    ) return true;
    const selected =
      winRef &&
      winRef.CatCodeV6Skin &&
      typeof winRef.CatCodeV6Skin.getSelected === "function"
        ? winRef.CatCodeV6Skin.getSelected()
        : null;
    const catalog = winRef && winRef.CatCodeV6SkinCatalog;
    const skin =
      catalog && selected && typeof catalog.getV6Skin === "function"
        ? catalog.getV6Skin(selected.id)
        : null;
    return !!(skin && skin.liveGazeRecolorOnly && skin.idleGazeBaseWithoutPupils);
  }

  function draw(layout) {
    const palette = eyePaletteForSkin(win);
    if (layout === "idle") {
      clearHunt();
      if (!context) return;
      clearIdle();
      if (!skinAllowsGazeOverlay(win, "idle")) return;
      const eyes = idleEyeLayout(win);
      const masks = {
        idle: idleGazePack(win),
        huntFinal: GAZE_MASKS && GAZE_MASKS.huntFinal,
      };
      if (!gazeMaskForEye("idle", eyes[0], masks) || !gazeMaskForEye("idle", eyes[1], masks)) return;
      const paintPupilOnly = skinUsesPupilOnlyGaze(win);
      for (const eye of eyes) {
        if (paintPupilOnly) {
          drawPupilOnly(context, eye, applied.x, applied.y, palette, "idle", masks);
        } else {
          drawPixelIris(context, eye, applied.x, applied.y, palette, "idle", masks);
        }
      }
      return;
    }
    if (layout === "huntFinal") {
      clearIdle();
      if (!huntContext) return;
      clearHunt();
      if (!skinAllowsGazeOverlay(win, "huntFinal")) return;
      if (!gazeMaskForEye("huntFinal", HUNT_FINAL_EYE_LAYOUT[0])
        || !gazeMaskForEye("huntFinal", HUNT_FINAL_EYE_LAYOUT[1])) return;
      const paintPupilOnly = skinUsesPupilOnlyGaze(win);
      for (const eye of HUNT_FINAL_EYE_LAYOUT) {
        if (paintPupilOnly) {
          drawPupilOnly(huntContext, eye, applied.x, applied.y, palette, "huntFinal");
        } else {
          drawHuntFinalPupil(huntContext, eye, applied.x, applied.y, palette);
        }
      }
    }
  }

  function tick(timestamp) {
    const layout = activeLayout(body, win);
    if (!layout) {
      applied = { x: 0, y: 0 };
      lastLayout = null;
      lastFrameAt = timestamp;
      clear();
      resetIdleAttention();
      resetHeadMotion();
      return;
    }
    const reduced = prefersReducedMotion(win);
    const desired = layout === "huntFinal" && reduced ? { x: 0, y: 0 } : target;
    const elapsed = lastFrameAt == null ? 16 : Math.min(64, Math.max(1, timestamp - lastFrameAt));
    lastFrameAt = timestamp;
    applied = {
      x: smoothToward(applied.x, desired.x, elapsed, responseMs),
      y: smoothToward(applied.y, desired.y, elapsed, responseMs),
    };
    const layoutChanged = layout !== lastLayout;
    const attentionMoving = updateIdleAttention(layout, elapsed);
    const headMoving = updateHeadMotion(layout, elapsed);
    draw(layout);
    lastLayout = layout;
    if (
      applied.x !== desired.x ||
      applied.y !== desired.y ||
      attentionMoving ||
      headMoving ||
      layoutChanged
    ) requestTick();
  }

  function handleCursorPos(payload) {
    if (!payload || typeof payload !== "object") return;
    const dx = Number(payload.dx);
    const dy = Number(payload.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    // Keep the last valid target when cursor reports pause (no call). Fresh
    // finite samples replace the target; reduced-motion hunt freezes in tick.
    target = targetFromCursor(dx, dy);
    requestTick();
  }

  if (electronAPI && typeof electronAPI.onCursorPos === "function") {
    electronAPI.onCursorPos(handleCursorPos);
  }
  requestImageLayer(idleBodyLayer);
  requestImageLayer(idleHeadLayer);
  requestImageLayer(huntBodyLayer);
  requestImageLayer(huntHeadLayer);
  // A source can still be loading on the first idle frame. Do not spin an
  // animation loop while waiting; the image load itself wakes the compositor.
  for (const layout of ["idle", "huntFinal"]) {
    const source = sourceForLayout(doc, layout);
    if (source && typeof source.addEventListener === "function") {
      source.addEventListener("load", requestTick);
    }
  }
  for (const layer of [idleBodyLayer, idleHeadLayer, huntBodyLayer, huntHeadLayer]) {
    if (layer && typeof layer.addEventListener === "function") {
      layer.addEventListener("load", requestTick);
    }
  }
  if (body && typeof MutationObserver === "function") {
    new MutationObserver(() => requestTick()).observe(body, {
      attributes: true,
      attributeFilter: ["data-catcode-model", "data-v6-pose", "data-v6-hunt-frame", "data-v6-hunt-gaze"],
    });
  }
  requestTick();

  return {
    handleCursorPos,
    getTarget: () => ({ ...target }),
    getApplied: () => ({ ...applied }),
    getLayout: () => activeLayout(body, win),
    getIdleAttention: () => ({ ...attention }),
    getHeadMotion: () => ({ ...headMotion }),
    resetIdleAttention,
    resetHeadMotion,
    requestTick,
    clear,
    clearHunt,
  };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6Gaze = wireV6Gaze();
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    V6_GAZE_VIEWBOX,
    CURSOR_SATURATION_PX,
    GAZE_RESPONSE_MS,
    IDLE_ATTENTION_RESPONSE_MS,
    IDLE_ATTENTION_MAX_ROTATE_DEG,
    IDLE_ATTENTION_MAX_TRANSLATE_X_PX,
    IDLE_ATTENTION_MAX_TRANSLATE_Y_PX,
    HEAD_MOTION_RESPONSE_MS,
    IDLE_HEAD_MAX_TRANSLATE_X,
    IDLE_HEAD_MAX_TRANSLATE_Y,
    IDLE_HEAD_MAX_ROTATE_DEG,
    HUNT_HEAD_MAX_TRANSLATE_X,
    HUNT_HEAD_MAX_TRANSLATE_Y,
    HUNT_HEAD_MAX_ROTATE_DEG,
    HUNT_HEAD_MOTION_ENABLED,
    HEAD_MOTION_ENABLED,
    EYE_LAYOUTS,
    HUNT_FINAL_EYE_LAYOUT,
    DEFAULT_EYE_PALETTE,
    targetFromCursor,
    smoothToward,
    activeLayout,
    eyePaletteForSkin,
    drawPixelIris,
    drawPupilOnly,
    drawExactIrisGaze,
    drawReferenceIdleGaze,
    referenceIdleGaze,
    idleEyeLayout,
    idleGazePack,
    drawHuntFinalPupil,
    huntFinalPupilRects,
    pupilRectsInsideIrisBBox,
    pupilPixelsInsideExactIris,
    pupilFootprintRects,
    pupilOrigin,
    fillClippedPupil,
    fillPupilFootprintOnly,
    gazeMaskForEye,
    pupilPixelInsideTrack,
    fillExactRuns,
    sourceForLayout,
    sourceIsReady,
    wireV6Gaze,
  };
}
