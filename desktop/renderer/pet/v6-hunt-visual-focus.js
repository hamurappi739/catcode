"use strict";

/**
 * V6 hunt visual-focus contract (shared main + renderer).
 * Normalized {x,y,radius} in the pet window; main converts to screen space.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === "object") {
    root.CatCodeV6HuntVisualFocus = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VISUAL_FOCUS_PROTOCOL = 1;
  const VISUAL_FOCUS_CHANNEL = "v6-hunt-visual-focus";
  const DEFAULT_NEAR_RADIUS_PX = 300;
  const DEFAULT_APPROACH_BAND_PX = 760;
  const PLAY_MARGIN_RATIO = 0.22;
  const MIN_NORMALIZED_RADIUS = 0.18;
  const MAX_NORMALIZED_RADIUS = 0.95;

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function hypot(dx, dy) {
    return Math.sqrt(dx * dx + dy * dy);
  }

  function normalizeVisualFocusContract(input) {
    if (!input || typeof input !== "object") return null;
    const x = Number(input.x);
    const y = Number(input.y);
    const radius = Number(input.radius);
    if (![x, y, radius].every((n) => Number.isFinite(n))) return null;
    if (radius <= 0) return null;
    return {
      protocol: VISUAL_FOCUS_PROTOCOL,
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      radius: clamp(radius, MIN_NORMALIZED_RADIUS, MAX_NORMALIZED_RADIUS),
    };
  }

  function contractFromVisibleBox(box, windowSize, opts) {
    opts = opts || {};
    const ww = Number(windowSize && windowSize.width);
    const wh = Number(windowSize && windowSize.height);
    if (!(ww > 0) || !(wh > 0) || !box) return null;
    const left = Number(box.left);
    const top = Number(box.top);
    const right = Number(
      box.right != null ? box.right : left + Number(box.width || 0),
    );
    const bottom = Number(
      box.bottom != null ? box.bottom : top + Number(box.height || 0),
    );
    if (![left, top, right, bottom].every((n) => Number.isFinite(n))) return null;
    const bw = Math.max(1, right - left);
    const bh = Math.max(1, bottom - top);
    const cx = left + bw / 2;
    const cy = top + bh / 2;
    const halfDiag = hypot(bw / 2, bh / 2);
    const marginRatio =
      opts.playMarginRatio != null ? opts.playMarginRatio : PLAY_MARGIN_RATIO;
    const radiusPx = halfDiag * (1 + Math.max(0, marginRatio));
    const minSide = Math.min(ww, wh);
    return normalizeVisualFocusContract({
      x: cx / ww,
      y: cy / wh,
      radius: radiusPx / minSide,
    });
  }

  function screenFocusFromContract(
    bounds,
    contract,
    fallbackFocus,
    fallbackRadiusPx,
  ) {
    if (fallbackRadiusPx == null) fallbackRadiusPx = DEFAULT_NEAR_RADIUS_PX;
    const safeFallback = {
      x: fallbackFocus && Number.isFinite(fallbackFocus.x) ? fallbackFocus.x : 0,
      y: fallbackFocus && Number.isFinite(fallbackFocus.y) ? fallbackFocus.y : 0,
      radiusPx:
        Number.isFinite(fallbackRadiusPx) && fallbackRadiusPx > 0
          ? fallbackRadiusPx
          : DEFAULT_NEAR_RADIUS_PX,
      fromContract: false,
    };
    if (
      !bounds ||
      !(bounds.width > 0) ||
      !(bounds.height > 0) ||
      !contract ||
      typeof contract !== "object"
    ) {
      return safeFallback;
    }
    const normalized = normalizeVisualFocusContract(contract);
    if (!normalized) return safeFallback;
    const minSide = Math.min(bounds.width, bounds.height);
    return {
      x: bounds.x + normalized.x * bounds.width,
      y: bounds.y + normalized.y * bounds.height,
      radiusPx: normalized.radius * minSide,
      fromContract: true,
    };
  }

  function relativeCursorFromScreen(cursor, focus) {
    const cx = cursor && Number(cursor.x);
    const cy = cursor && Number(cursor.y);
    const fx = focus && Number(focus.x);
    const fy = focus && Number(focus.y);
    return {
      dx: Math.round(
        (Number.isFinite(cx) ? cx : 0) - (Number.isFinite(fx) ? fx : 0),
      ),
      dy: Math.round(
        (Number.isFinite(cy) ? cy : 0) - (Number.isFinite(fy) ? fy : 0),
      ),
    };
  }

  function classifyDistance(distancePx, nearRadiusPx, approachBandPx) {
    if (nearRadiusPx == null) nearRadiusPx = DEFAULT_NEAR_RADIUS_PX;
    if (approachBandPx == null) approachBandPx = DEFAULT_APPROACH_BAND_PX;
    const dist = Number(distancePx);
    const near =
      Number.isFinite(nearRadiusPx) && nearRadiusPx > 0
        ? nearRadiusPx
        : DEFAULT_NEAR_RADIUS_PX;
    const approach =
      Number.isFinite(approachBandPx) && approachBandPx > near
        ? approachBandPx
        : Math.max(DEFAULT_APPROACH_BAND_PX, near * 2.5);
    if (!Number.isFinite(dist)) return "far";
    if (dist <= near) return "near";
    if (dist <= approach) return "approach";
    return "far";
  }

  function isPlayfulDirectionReversal(prevVelocity, nextVelocity, minAxis) {
    if (minAxis == null) minAxis = 0.05;
    if (!prevVelocity || !nextVelocity) return false;
    const px = Number(prevVelocity.x);
    const py = Number(prevVelocity.y);
    const nx = Number(nextVelocity.x);
    const ny = Number(nextVelocity.y);
    if (![px, py, nx, ny].every((n) => Number.isFinite(n))) return false;
    const prevMag = hypot(px, py);
    const nextMag = hypot(nx, ny);
    if (!(prevMag > 0) || !(nextMag > 0)) return false;
    const axisFlipX =
      px * nx < 0 && Math.abs(px) >= minAxis && Math.abs(nx) >= minAxis;
    const axisFlipY =
      py * ny < 0 && Math.abs(py) >= minAxis && Math.abs(ny) >= minAxis;
    if (axisFlipX || axisFlipY) return true;
    const directionDot = (px * nx + py * ny) / (prevMag * nextMag);
    return directionDot <= 0;
  }

  function measureVisibleV6CatBox(doc, win) {
    if (!doc || typeof doc.getElementById !== "function") return null;
    const candidates = [
      "v6-idle-body-layer",
      "v6-idle-head-layer",
      "v6-idle-preview",
      "v6-hunt-body-layer",
      "v6-hunt-head-layer",
      "v6-hunt-f8",
      "v6-hunt-f0",
    ];
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    let found = false;
    for (let i = 0; i < candidates.length; i += 1) {
      const el = doc.getElementById(candidates[i]);
      if (!el || typeof el.getBoundingClientRect !== "function") continue;
      let visible = true;
      try {
        if (el.hidden) visible = false;
        const style =
          win && typeof win.getComputedStyle === "function"
            ? win.getComputedStyle(el)
            : null;
        if (
          style &&
          (style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0")
        ) {
          visible = false;
        }
      } catch (_) {}
      if (!visible) continue;
      const rect = el.getBoundingClientRect();
      if (!rect || !(rect.width > 2) || !(rect.height > 2)) continue;
      found = true;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    if (!found) return null;
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  function measureV6HuntVisualFocusContract(doc, win) {
    const box = measureVisibleV6CatBox(doc, win);
    const ww =
      (win &&
        (win.innerWidth ||
          (win.document &&
            win.document.documentElement &&
            win.document.documentElement.clientWidth))) ||
      (doc && doc.documentElement && doc.documentElement.clientWidth) ||
      0;
    const wh =
      (win &&
        (win.innerHeight ||
          (win.document &&
            win.document.documentElement &&
            win.document.documentElement.clientHeight))) ||
      (doc && doc.documentElement && doc.documentElement.clientHeight) ||
      0;
    return contractFromVisibleBox(box, { width: ww, height: wh });
  }

  return {
    VISUAL_FOCUS_PROTOCOL,
    VISUAL_FOCUS_CHANNEL,
    DEFAULT_NEAR_RADIUS_PX,
    DEFAULT_APPROACH_BAND_PX,
    PLAY_MARGIN_RATIO,
    MIN_NORMALIZED_RADIUS,
    MAX_NORMALIZED_RADIUS,
    normalizeVisualFocusContract,
    contractFromVisibleBox,
    screenFocusFromContract,
    relativeCursorFromScreen,
    classifyDistance,
    isPlayfulDirectionReversal,
    measureVisibleV6CatBox,
    measureV6HuntVisualFocusContract,
  };
});
