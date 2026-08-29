"use strict";

// Hit-tests pet poses and overlays to decide Electron mouse passthrough.

const MOUSE_PASSTHROUGH_CHECK_MS = 50;

// Fallback tight AABB covering the typical V4 idle silhouette inside 64x64.
const V4_FALLBACK_BOUNDS = Object.freeze({
  minX: 0.14,
  minY: 0.02,
  maxX: 0.86,
  maxY: 0.98,
});

const silhouetteBoundsCache = new WeakMap();
const opaqueHitCache = new WeakMap();

function rectContains(rect, x, y) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function pointInEllipse(nx, ny, cx, cy, rx, ry) {
  const dx = (nx - cx) / rx;
  const dy = (ny - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function parseViewBox(root) {
  const parts = String(root.getAttribute("viewBox") || "0 0 64 64")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return {
    vx: Number.isFinite(parts[0]) ? parts[0] : 0,
    vy: Number.isFinite(parts[1]) ? parts[1] : 0,
    vw: Number.isFinite(parts[2]) && parts[2] > 0 ? parts[2] : 64,
    vh: Number.isFinite(parts[3]) && parts[3] > 0 ? parts[3] : 64,
  };
}

/**
 * Whether a V4 pixel rect is currently painted (not display:none / opacity:0).
 * Uses attributes first, then computed style when a window is available so CSS
 * pose rules (e.g. svg.purring hiding open eyes) are respected.
 */
function isV4PixelVisible(rect) {
  let node = rect;
  while (node && node.nodeType === 1) {
    const displayAttr =
      typeof node.getAttribute === "function" ? node.getAttribute("display") : null;
    if (displayAttr === "none") return false;
    const visAttr =
      typeof node.getAttribute === "function"
        ? node.getAttribute("visibility")
        : null;
    if (visAttr === "hidden") return false;
    const opAttr =
      typeof node.getAttribute === "function" ? node.getAttribute("opacity") : null;
    if (opAttr !== null && opAttr !== "" && Number(opAttr) === 0) return false;

    try {
      const view = node.ownerDocument && node.ownerDocument.defaultView;
      if (view && typeof view.getComputedStyle === "function") {
        const cs = view.getComputedStyle(node);
        if (cs) {
          if (cs.display === "none" || cs.visibility === "hidden") return false;
          if (cs.opacity !== "" && Number(cs.opacity) === 0) return false;
        }
      }
    } catch {
      // Ignore cross-document style failures; attributes already checked.
    }
    node = node.parentElement || node.parentNode;
  }
  return true;
}

function visibilityCacheKey(poseEl, body) {
  const root = poseEl && poseEl.contentDocument && poseEl.contentDocument.documentElement;
  const cls = root && typeof root.getAttribute === "function"
    ? root.getAttribute("class") || ""
    : "";
  const ds = (body && body.dataset) || {};
  return `${cls}|${ds.v4Pose || ""}|${ds.purring || ""}|${ds.idleSleep || ""}|${
    poseEl && poseEl.dataset ? poseEl.dataset.v4HitRev || "0" : "0"
  }`;
}

/**
 * Tight visual bounding box of authored V4 pixels, normalized to the object
 * element's content box. Prefer this over center-only ellipses so sleep/purr
 * limbs are draggable, without enabling the full transparent square.
 */
function computeV4NormBounds(poseEl) {
  if (!poseEl) return V4_FALLBACK_BOUNDS;
  const cached = silhouetteBoundsCache.get(poseEl);
  const rev = poseEl.dataset ? poseEl.dataset.v4HitRev || "0" : "0";
  if (cached && cached.rev === rev) return cached.bounds;

  let bounds = V4_FALLBACK_BOUNDS;
  try {
    const doc = poseEl.contentDocument;
    const root = doc && doc.documentElement;
    if (root && root.matches && root.matches('svg[data-catcode-model="v4"]')) {
      const { vx, vy, vw, vh } = parseViewBox(root);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const rect of doc.querySelectorAll("rect.v4-pixel")) {
        if (!isV4PixelVisible(rect)) continue;
        const x = Number(rect.getAttribute("x"));
        const y = Number(rect.getAttribute("y"));
        const w = Number(rect.getAttribute("width") || 1);
        const h = Number(rect.getAttribute("height") || 1);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + (Number.isFinite(w) ? w : 1));
        maxY = Math.max(maxY, y + (Number.isFinite(h) ? h : 1));
      }
      if (Number.isFinite(minX) && maxX > minX && maxY > minY) {
        const pad = 1;
        bounds = {
          minX: clamp01((minX - pad - vx) / vw),
          minY: clamp01((minY - pad - vy) / vh),
          maxX: clamp01((maxX + pad - vx) / vw),
          maxY: clamp01((maxY + pad - vy) / vh),
        };
      }
    }
  } catch {
    bounds = V4_FALLBACK_BOUNDS;
  }

  silhouetteBoundsCache.set(poseEl, { bounds, rev });
  return bounds;
}

function buildV4OpaqueHitCache(poseEl, body) {
  const key = visibilityCacheKey(poseEl, body);
  const cached = opaqueHitCache.get(poseEl);
  if (cached && cached.key === key) return cached;

  let entry = {
    key,
    keys: new Set(),
    vx: 0,
    vy: 0,
    vw: 64,
    vh: 64,
  };
  try {
    const doc = poseEl.contentDocument;
    const root = doc && doc.documentElement;
    if (root && root.matches && root.matches('svg[data-catcode-model="v4"]')) {
      const vb = parseViewBox(root);
      entry = { ...entry, ...vb, keys: new Set() };
      for (const rect of doc.querySelectorAll("rect.v4-pixel")) {
        if (!isV4PixelVisible(rect)) continue;
        const x = Number(rect.getAttribute("x"));
        const y = Number(rect.getAttribute("y"));
        const w = Math.max(1, Math.floor(Number(rect.getAttribute("width") || 1)));
        const h = Math.max(1, Math.floor(Number(rect.getAttribute("height") || 1)));
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        for (let yy = y0; yy < y0 + h; yy += 1) {
          for (let xx = x0; xx < x0 + w; xx += 1) {
            entry.keys.add(`${xx},${yy}`);
          }
        }
      }
    }
  } catch {
    entry.keys = new Set();
  }
  opaqueHitCache.set(poseEl, entry);
  return entry;
}

/**
 * Map a client point through the <object> box (xMidYMid meet) into a viewBox
 * cell and return true only when that cell has a currently painted V4 pixel.
 * Transparent areas inside the object rectangle pass through.
 */
function isV4OpaqueHitPoint(poseEl, clientX, clientY, body) {
  if (!poseEl) return false;
  const rect = poseEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || !rectContains(rect, clientX, clientY)) {
    return false;
  }

  const cache = buildV4OpaqueHitCache(poseEl, body);
  if (!cache.keys.size) {
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const bounds = computeV4NormBounds(poseEl);
    return (
      nx >= bounds.minX &&
      nx <= bounds.maxX &&
      ny >= bounds.minY &&
      ny <= bounds.maxY
    );
  }

  const { vx, vy, vw, vh } = cache;
  const scale = Math.min(rect.width / vw, rect.height / vh);
  const contentW = vw * scale;
  const contentH = vh * scale;
  const offsetX = (rect.width - contentW) / 2;
  const offsetY = (rect.height - contentH) / 2;
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  if (localX < 0 || localY < 0 || localX >= contentW || localY >= contentH) {
    return false;
  }
  const cellX = Math.floor(vx + (localX / contentW) * vw);
  const cellY = Math.floor(vy + (localY / contentH) * vh);
  return cache.keys.has(`${cellX},${cellY}`);
}

function invalidateV4HitBounds(poseEl) {
  if (poseEl && poseEl.dataset) {
    const next = String((Number(poseEl.dataset.v4HitRev) || 0) + 1);
    poseEl.dataset.v4HitRev = next;
  }
  if (poseEl) {
    silhouetteBoundsCache.delete(poseEl);
    opaqueHitCache.delete(poseEl);
  }
}

function createMousePassthrough({
  domDocument = document,
  body = document.body,
  catObject,
  stretchEndObject,
  overlays,
  ensureSvgObjectReady,
  getPetPeekState,
  isDragging,
  isReleasing,
  hasPendingDrag,
  setPetMouseEventsEnabled,
}) {
  let lastCheckAt = 0;
  let lastClientPoint = null;

  function currentPoseElement() {
    const isV4 = body.dataset.catcodeModel === "v4";
    const isV6IdlePreview = body.dataset.catcodeModel === "v6-idle-preview";
    if (isV6IdlePreview) {
      const v6Pose =
        domDocument.defaultView && domDocument.defaultView.CatCodeV6VisualPose;
      return (v6Pose && typeof v6Pose.getActiveHost === "function" && v6Pose.getActiveHost()) ||
        domDocument.getElementById("v6-idle-preview");
    }
    // Stage A: V4 drag keeps #cat visible; do not hit-test hidden stretch SVG.
    if (body.classList.contains("dragging")) {
      if (isV4) {
        ensureSvgObjectReady("cat");
        return catObject;
      }
      ensureSvgObjectReady("stretch-svg-end");
      return stretchEndObject;
    }
    if (isV4) {
      // Sleep swaps to #sleep-pose. V4 purr keeps live #cat visible; #purr-pose
      // stays display:none and must not be the hit target.
      const pose = body.dataset.v4Pose;
      if (pose === "sleep" || body.dataset.idleSleep) {
        ensureSvgObjectReady("sleep-pose");
        return domDocument.getElementById("sleep-pose") || catObject;
      }
      if (pose === "purr" || body.dataset.purring) {
        ensureSvgObjectReady("cat");
        return catObject;
      }
      ensureSvgObjectReady("cat");
      return catObject;
    }
    if (getPetPeekState()) {
      ensureSvgObjectReady("press-left");
      return domDocument.getElementById("press-left");
    }
    if (body.dataset.stretching) {
      ensureSvgObjectReady("stretch-pose-default");
      return domDocument.getElementById("stretch-pose-default");
    }
    if (body.dataset.hunting) {
      ensureSvgObjectReady("cat");
      return domDocument.getElementById("cat");
    }
    if (body.dataset.jump === "start") {
      ensureSvgObjectReady("jump-start");
      return domDocument.getElementById("jump-start");
    }
    if (body.dataset.jump === "ing") {
      ensureSvgObjectReady("jump-ing");
      return domDocument.getElementById("jump-ing");
    }
    if (body.dataset.scroll) {
      ensureSvgObjectReady("scroll-unroll");
      return domDocument.getElementById("scroll-unroll");
    }
    if (body.dataset.press === "left") {
      ensureSvgObjectReady("press-left");
      return domDocument.getElementById("press-left");
    }
    if (body.dataset.press === "right") {
      ensureSvgObjectReady("press-right");
      return domDocument.getElementById("press-right");
    }
    ensureSvgObjectReady("cat");
    return catObject;
  }

  function isCatHitPoint(x, y) {
    const pose = currentPoseElement();
    if (!pose) return false;
    const rect = pose.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !rectContains(rect, x, y))
      return false;

    const nx = (x - rect.left) / rect.width;
    const ny = (y - rect.top) / rect.height;

    if (body.dataset.catcodeModel === "v6-idle-preview") {
      const v6Preview = domDocument.defaultView && domDocument.defaultView.CatCodeV6IdlePreview;
      return !!(v6Preview && v6Preview.isOpaqueHitPoint(x, y));
    }

    if (pose === stretchEndObject) {
      return (
        pointInEllipse(nx, ny, 0.5, 0.2, 0.2, 0.14) ||
        pointInEllipse(nx, ny, 0.5, 0.52, 0.18, 0.38)
      );
    }

    const isV4Pose =
      body.dataset.catcodeModel === "v4" ||
      (pose.contentDocument &&
        pose.contentDocument.documentElement &&
        pose.contentDocument.documentElement.matches &&
        pose.contentDocument.documentElement.matches(
          'svg[data-catcode-model="v4"]',
        ));
    if (isV4Pose) {
      return isV4OpaqueHitPoint(pose, x, y, body);
    }

    return (
      pointInEllipse(nx, ny, 0.4, 0.3, 0.24, 0.22) ||
      pointInEllipse(nx, ny, 0.55, 0.62, 0.3, 0.3) ||
      (nx >= 0.28 && nx <= 0.72 && ny >= 0.3 && ny <= 0.78)
    );
  }

  function visibleElementContains(element, x, y) {
    return (
      element &&
      getComputedStyle(element).display !== "none" &&
      rectContains(element.getBoundingClientRect(), x, y)
    );
  }

  function shouldReceiveMouseAt(x, y) {
    if (getPetPeekState()) return isCatHitPoint(x, y);
    if (isDragging() || isReleasing() || hasPendingDrag()) return true;
    for (const element of overlays) {
      if (visibleElementContains(element, x, y)) return true;
    }
    return isCatHitPoint(x, y);
  }

  function update(event) {
    if (!event) {
      lastCheckAt = 0;
      const shouldReceive = lastClientPoint
        ? shouldReceiveMouseAt(lastClientPoint.x, lastClientPoint.y)
        : Boolean(
            isDragging() ||
              isReleasing() ||
              hasPendingDrag() ||
              getPetPeekState() ||
              body.dataset.accountNudge,
          );
      setPetMouseEventsEnabled(shouldReceive);
      return;
    }
    lastClientPoint = { x: event.clientX, y: event.clientY };
    const now = performance.now();
    if (
      !isDragging() &&
      !isReleasing() &&
      now - lastCheckAt < MOUSE_PASSTHROUGH_CHECK_MS
    )
      return;
    lastCheckAt = now;
    setPetMouseEventsEnabled(
      shouldReceiveMouseAt(event.clientX, event.clientY),
    );
  }

  function clearLastPoint() {
    lastClientPoint = null;
  }

  function init() {
    requestAnimationFrame(() => setPetMouseEventsEnabled(false));
  }

  return {
    clearLastPoint,
    init,
    isCatHitPoint,
    currentPoseElement,
    update,
    invalidateV4HitBounds,
  };
}

module.exports = {
  createMousePassthrough,
  computeV4NormBounds,
  invalidateV4HitBounds,
  isV4OpaqueHitPoint,
  isV4PixelVisible,
  V4_FALLBACK_BOUNDS,
};
