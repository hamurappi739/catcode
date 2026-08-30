"use strict";

(() => {
  /** Editor-only idle preview: compose pupil-free layers, then add centred pupils. */
  const IDLE_PREVIEW_RELATIVE = "idle-master.png";
  const VIEWBOX = 256;
  const GAZE_VIEWBOX = 1024;
  const SCALE = VIEWBOX / GAZE_VIEWBOX;
  const DEFAULT_PUPIL_HEX = "#080a0e";
  const IDLE_EYES_GAZE = Object.freeze([
    Object.freeze({
      id: "left",
      x: 387,
      y: 420,
      maxX: 26,
      maxY: 12,
      pupilBounds: Object.freeze([344, 382, 430, 458]),
    }),
    Object.freeze({
      id: "right",
      x: 582,
      y: 420,
      maxX: 26,
      maxY: 12,
      pupilBounds: Object.freeze([539, 382, 625, 458]),
    }),
  ]);
  const PUPIL_FOOTPRINT_GAZE = Object.freeze([
    Object.freeze({ y0: -26, y1: -19, width: 12 }),
    Object.freeze({ y0: -18, y1: -13, width: 22 }),
    Object.freeze({ y0: -12, y1: 16, width: 30 }),
    Object.freeze({ y0: 17, y1: 22, width: 22 }),
    Object.freeze({ y0: 23, y1: 26, width: 12 }),
  ]);

  function scale(value) { return Math.round(value * SCALE); }

  function scaleEye(eye) {
    return {
      x: scale(eye.x),
      y: scale(eye.y),
      pupilBounds: eye.pupilBounds.map(scale),
    };
  }

  function hexToRgb(value) {
    const hex = typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : DEFAULT_PUPIL_HEX;
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
  }

  function footprintRects(eye) {
    return PUPIL_FOOTPRINT_GAZE.map(({ y0, y1, width }) => ({
      x: eye.x - Math.floor(scale(width) / 2),
      y: eye.y + scale(y0),
      w: Math.max(1, scale(width)),
      h: scale(y1 - y0 + 1),
    }));
  }

  function insideBounds(eye, x, y) {
    const [x0, y0, x1, y1] = eye.pupilBounds;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  function addCentredPupils(imageData) {
    const rgb = hexToRgb(DEFAULT_PUPIL_HEX);
    let painted = 0;
    for (const sourceEye of IDLE_EYES_GAZE) {
      const eye = scaleEye(sourceEye);
      for (const rect of footprintRects(eye)) {
        for (let y = rect.y; y < rect.y + rect.h; y += 1) {
          for (let x = rect.x; x < rect.x + rect.w; x += 1) {
            if (!insideBounds(eye, x, y)) continue;
            const offset = (y * VIEWBOX + x) * 4;
            if (imageData.data[offset + 3] === 0) continue;
            imageData.data[offset] = rgb[0];
            imageData.data[offset + 1] = rgb[1];
            imageData.data[offset + 2] = rgb[2];
            painted += 1;
          }
        }
      }
    }
    return painted;
  }

  function isIdlePreviewPath(relativePath) {
    return relativePath === IDLE_PREVIEW_RELATIVE;
  }

  function paintIdlePreview(relativePath, palette, coreApi) {
    if (!isIdlePreviewPath(relativePath) || !coreApi
      || typeof coreApi.paintComposedIdle !== "function") return Promise.resolve(null);
    return Promise.resolve(coreApi.paintComposedIdle(palette)).then((sourceUrl) => {
      if (!sourceUrl || typeof document === "undefined") return null;
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = VIEWBOX;
          canvas.height = VIEWBOX;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, VIEWBOX, VIEWBOX);
          const pixels = context.getImageData(0, 0, VIEWBOX, VIEWBOX);
          addCentredPupils(pixels);
          context.putImageData(pixels, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        image.onerror = () => resolve(null);
        image.src = sourceUrl;
      });
    });
  }

  const api = { IDLE_PREVIEW_RELATIVE, IDLE_EYES_GAZE, addCentredPupils, isIdlePreviewPath, paintIdlePreview };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatCodeV6EditorIdlePreview = api;
})();
