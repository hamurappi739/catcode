"use strict";

// V6 raster art has baked pupils, so gaze is an explicit canvas layer. It
// redraws each cyan iris and exactly one whole pupil per eye; no part of a
// pupil is left at its old centre and no direction vector is ever rendered.

const V6_GAZE_VIEWBOX = 1024;
const CURSOR_SATURATION_PX = 420;
const GAZE_RESPONSE_MS = 135;
const IDLE_ATTENTION_RESPONSE_MS = 175;
const IDLE_ATTENTION_MAX_ROTATE_DEG = 1.15;
const IDLE_ATTENTION_MAX_TRANSLATE_X_PX = 1.7;
const IDLE_ATTENTION_MAX_TRANSLATE_Y_PX = 0.75;
const HEAD_MOTION_RESPONSE_MS = 190;
const IDLE_HEAD_MAX_TRANSLATE_X = 10;
const IDLE_HEAD_MAX_TRANSLATE_Y = 5;
const IDLE_HEAD_MAX_ROTATE_DEG = 1.15;
const HUNT_HEAD_MAX_TRANSLATE_X = 11;
const HUNT_HEAD_MAX_TRANSLATE_Y = 5;
const HUNT_HEAD_MAX_ROTATE_DEG = 1.35;
const IRIS = "#48dfe1";
const IRIS_LIGHT = "#8ff7f1";
const PUPIL = "#092d3a";

const EYE_LAYOUTS = Object.freeze({
  idle: Object.freeze([
    { x: 380, y: 420, maxX: 26, maxY: 12 },
    { x: 592, y: 420, maxX: 26, maxY: 12 },
  ]),
  hunt: Object.freeze([
    { x: 360, y: 555, maxX: 29, maxY: 12 },
    { x: 578, y: 555, maxX: 29, maxY: 12 },
  ]),
});

// The V6 masters are flattened PNGs. These masks split a small, deliberately
// overlapping head plate from the static body in the canvas compositing pass.
// They are authored around the actual 1024px masters, not CSS coordinates.
const HEAD_MASKS = Object.freeze({
  idle: Object.freeze({
    pivot: Object.freeze({ x: 512, y: 566 }),
    points: Object.freeze([
      [269, 112], [350, 185], [426, 208], [510, 202], [595, 208], [675, 185],
      [757, 112], [749, 348], [778, 412], [752, 486], [676, 534], [625, 574],
      [590, 604], [434, 604], [399, 574], [347, 540], [271, 494], [242, 423],
      [269, 348],
    ]),
  }),
  hunt: Object.freeze({
    pivot: Object.freeze({ x: 500, y: 704 }),
    points: Object.freeze([
      [241, 250], [330, 323], [410, 348], [497, 340], [584, 348], [667, 322],
      [750, 250], [744, 474], [777, 544], [739, 625], [666, 680], [618, 719],
      [575, 744], [420, 744], [379, 719], [329, 681], [254, 631], [214, 548],
      [241, 475],
    ]),
  }),
});

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

function activeLayout(body) {
  if (!body || !body.dataset || body.dataset.catcodeModel !== "v6-idle-preview") return null;
  if (body.dataset.v6Pose === "idle") return "idle";
  if (
    body.dataset.v6Pose === "hunt" &&
    body.dataset.v6HuntFrame === "f8" &&
    body.dataset.v6HuntGaze === "1"
  ) {
    return "hunt";
  }
  return null;
}

function drawPixelIris(context, eye, lookX, lookY) {
  const x = Math.round(eye.x);
  const y = Math.round(eye.y);
  // Repaint the entire safe iris pocket over the baked V6 pupil first.
  context.fillStyle = IRIS;
  context.fillRect(x - 48, y - 20, 96, 40);
  context.fillRect(x - 36, y - 28, 72, 56);
  context.fillRect(x - 24, y - 32, 48, 64);

  // The two tiny highlights preserve the established V6 eye language.
  context.fillStyle = IRIS_LIGHT;
  context.fillRect(x - 28, y - 20, 12, 12);
  context.fillRect(x - 16, y - 28, 8, 8);

  const px = Math.round((x + lookX * eye.maxX) / 4) * 4;
  const py = Math.round((y + lookY * eye.maxY) / 4) * 4;
  context.fillStyle = PUPIL;
  // One fixed, fully opaque 24×48 pixel-art pupil. Its footprint never scales,
  // stretches, rotates, or leaves a line behind at the old position.
  context.fillRect(px - 8, py - 28, 16, 56);
  context.fillRect(px - 12, py - 20, 24, 40);
}

function drawMaskPath(context, mask) {
  const [first, ...rest] = mask.points;
  context.beginPath();
  context.moveTo(first[0], first[1]);
  for (const point of rest) context.lineTo(point[0], point[1]);
  context.closePath();
}

function sourceForLayout(doc, layout) {
  if (!doc || typeof doc.getElementById !== "function") return null;
  return doc.getElementById(layout === "hunt" ? "v6-hunt-f8" : "v6-idle-preview");
}

function sourceIsReady(source) {
  return !!(source && source.naturalWidth >= V6_GAZE_VIEWBOX && source.naturalHeight >= V6_GAZE_VIEWBOX);
}

function wireV6Gaze({
  win = window,
  electronAPI = win && win.electronAPI,
  document: doc = win && win.document,
  responseMs = GAZE_RESPONSE_MS,
} = {}) {
  const body = doc && doc.body;
  const headCanvas = doc && doc.getElementById ? doc.getElementById("v6-head-motion-layer") : null;
  const headContext = headCanvas && typeof headCanvas.getContext === "function" ? headCanvas.getContext("2d") : null;
  const canvas = doc && doc.getElementById ? doc.getElementById("v6-gaze-layer") : null;
  const context = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  let target = { x: 0, y: 0 };
  let applied = { x: 0, y: 0 };
  let lastFrameAt = null;
  let rafId = null;
  let lastLayout = null;
  let attention = { x: 0, y: 0, rotate: 0 };
  let headMotion = { x: 0, y: 0, rotate: 0 };

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
    if (headContext) headContext.clearRect(0, 0, V6_GAZE_VIEWBOX, V6_GAZE_VIEWBOX);
  }

  function updateHeadMotion(layout, elapsed) {
    if (!layout) {
      resetHeadMotion();
      return false;
    }
    const limits = layout === "hunt"
      ? { x: HUNT_HEAD_MAX_TRANSLATE_X, y: HUNT_HEAD_MAX_TRANSLATE_Y, rotate: HUNT_HEAD_MAX_ROTATE_DEG }
      : { x: IDLE_HEAD_MAX_TRANSLATE_X, y: IDLE_HEAD_MAX_TRANSLATE_Y, rotate: IDLE_HEAD_MAX_ROTATE_DEG };
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
    return (
      headMotion.x !== next.x ||
      headMotion.y !== next.y ||
      headMotion.rotate !== next.rotate
    );
  }

  function drawHeadComposite(layout) {
    if (!headContext) return false;
    const source = sourceForLayout(doc, layout);
    const mask = HEAD_MASKS[layout];
    if (!mask || !sourceIsReady(source)) {
      if (body && body.dataset) delete body.dataset.v6HeadMotionReady;
      return false;
    }

    headContext.clearRect(0, 0, V6_GAZE_VIEWBOX, V6_GAZE_VIEWBOX);
    headContext.imageSmoothingEnabled = false;
    headContext.drawImage(source, 0, 0, V6_GAZE_VIEWBOX, V6_GAZE_VIEWBOX);

    headContext.save();
    drawMaskPath(headContext, mask);
    headContext.globalCompositeOperation = "destination-out";
    headContext.fill();
    headContext.restore();

    headContext.save();
    headContext.translate(mask.pivot.x + headMotion.x, mask.pivot.y + headMotion.y);
    headContext.rotate((headMotion.rotate * Math.PI) / 180);
    headContext.translate(-mask.pivot.x, -mask.pivot.y);
    drawMaskPath(headContext, mask);
    headContext.clip();
    headContext.drawImage(source, 0, 0, V6_GAZE_VIEWBOX, V6_GAZE_VIEWBOX);
    headContext.restore();
    if (body && body.dataset) body.dataset.v6HeadMotionReady = "1";
    return true;
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
    rafId = win.requestAnimationFrame(tick);
  }

  function clear() {
    if (context) context.clearRect(0, 0, V6_GAZE_VIEWBOX, V6_GAZE_VIEWBOX);
  }

  function draw(layout) {
    if (!context) return;
    clear();
    for (const eye of EYE_LAYOUTS[layout]) {
      drawPixelIris(context, eye, applied.x, applied.y);
    }
  }

  function tick(timestamp) {
    rafId = null;
    const layout = activeLayout(body);
    if (!layout) {
      applied = { x: 0, y: 0 };
      lastLayout = null;
      lastFrameAt = timestamp;
      clear();
      resetIdleAttention();
      resetHeadMotion();
      return;
    }
    const elapsed = lastFrameAt == null ? 16 : Math.min(64, Math.max(1, timestamp - lastFrameAt));
    lastFrameAt = timestamp;
    applied = {
      x: smoothToward(applied.x, target.x, elapsed, responseMs),
      y: smoothToward(applied.y, target.y, elapsed, responseMs),
    };
    const layoutChanged = layout !== lastLayout;
    const attentionMoving = updateIdleAttention(layout, elapsed);
    const headMoving = updateHeadMotion(layout, elapsed);
    drawHeadComposite(layout);
    draw(layout);
    lastLayout = layout;
    if (
      applied.x !== target.x ||
      applied.y !== target.y ||
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
    target = targetFromCursor(dx, dy);
    requestTick();
  }

  if (electronAPI && typeof electronAPI.onCursorPos === "function") {
    electronAPI.onCursorPos(handleCursorPos);
  }
  // A source can still be loading on the first idle frame. Do not spin an
  // animation loop while waiting; the image load itself wakes the compositor.
  for (const layout of ["idle", "hunt"]) {
    const source = sourceForLayout(doc, layout);
    if (source && typeof source.addEventListener === "function") {
      source.addEventListener("load", requestTick);
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
    getLayout: () => activeLayout(body),
    getIdleAttention: () => ({ ...attention }),
    getHeadMotion: () => ({ ...headMotion }),
    resetIdleAttention,
    resetHeadMotion,
    clear,
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
    EYE_LAYOUTS,
    HEAD_MASKS,
    targetFromCursor,
    smoothToward,
    activeLayout,
    drawPixelIris,
    drawMaskPath,
    sourceForLayout,
    sourceIsReady,
    wireV6Gaze,
  };
}
