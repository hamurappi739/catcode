"use strict";

(() => {
  /** Editor-only Hunt f8 preview pupils in 256px PNG space (runtime gaze uses 1024). */
  const HUNT_PREVIEW_RELATIVE = "hunt-smooth/hunt-f8-gaze-ready.png";
  const VIEWBOX = 256;
  const GAZE_VIEWBOX = 1024;
  const GAZE_TO_PNG_SCALE = VIEWBOX / GAZE_VIEWBOX;
  const DEFAULT_PUPIL_HEX = "#092d3a";

  const HUNT_FINAL_EYE_LAYOUT_GAZE = Object.freeze([
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

  const PUPIL_FOOTPRINT_GAZE = Object.freeze([
    Object.freeze({ y0: -26, y1: -19, width: 12 }),
    Object.freeze({ y0: -18, y1: -13, width: 22 }),
    Object.freeze({ y0: -12, y1: 16, width: 30 }),
    Object.freeze({ y0: 17, y1: 22, width: 22 }),
    Object.freeze({ y0: 23, y1: 26, width: 12 }),
  ]);

  function scaleCoord(value) {
    return Math.round(value * GAZE_TO_PNG_SCALE);
  }

  function scaleEye(eye) {
    return Object.freeze({
      id: eye.id,
      x: scaleCoord(eye.x),
      y: scaleCoord(eye.y),
      maxX: scaleCoord(eye.maxX),
      maxY: scaleCoord(eye.maxY),
      irisBBox: Object.freeze(eye.irisBBox.map(scaleCoord)),
      pupilBounds: Object.freeze(eye.pupilBounds.map(scaleCoord)),
    });
  }

  function scaleFootprintRow(row) {
    return Object.freeze({
      y0: scaleCoord(row.y0),
      y1: scaleCoord(row.y1),
      width: Math.max(1, scaleCoord(row.width)),
    });
  }

  const HUNT_FINAL_EYE_LAYOUT = Object.freeze(HUNT_FINAL_EYE_LAYOUT_GAZE.map(scaleEye));
  const PUPIL_FOOTPRINT = Object.freeze(PUPIL_FOOTPRINT_GAZE.map(scaleFootprintRow));

  function hexToRgb(hex) {
    const value = typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_PUPIL_HEX;
    return [
      Number.parseInt(value.slice(1, 3), 16),
      Number.parseInt(value.slice(3, 5), 16),
      Number.parseInt(value.slice(5, 7), 16),
    ];
  }

  function pupilOrigin(eye, lookX, lookY) {
    return {
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

  function pupilPixelInsideTrack(eye, x, y) {
    if (!eye || !eye.pupilBounds) return false;
    const [x0, y0, x1, y1] = eye.pupilBounds;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  function footprintPixelKeys(eye, lookX, lookY) {
    const keys = [];
    for (const rect of pupilFootprintRects(eye, lookX, lookY)) {
      for (let y = rect.y; y < rect.y + rect.h; y += 1) {
        for (let x = rect.x; x < rect.x + rect.w; x += 1) {
          if (pupilPixelInsideTrack(eye, x, y)) keys.push(`${x},${y}`);
        }
      }
    }
    return keys;
  }

  function fillPupilFootprintOnImageData(imageData, eye, lookX, lookY, pupilRgb) {
    if (!imageData || !imageData.data) return 0;
    const data = imageData.data;
    const width = imageData.width || VIEWBOX;
    let painted = 0;
    for (const rect of pupilFootprintRects(eye, lookX, lookY)) {
      for (let y = rect.y; y < rect.y + rect.h; y += 1) {
        for (let x = rect.x; x < rect.x + rect.w; x += 1) {
          if (!pupilPixelInsideTrack(eye, x, y)) continue;
          const offset = (y * width + x) * 4;
          if (data[offset + 3] === 0) continue;
          data[offset] = pupilRgb[0];
          data[offset + 1] = pupilRgb[1];
          data[offset + 2] = pupilRgb[2];
          painted += 1;
        }
      }
    }
    return painted;
  }

  function composeHuntPreviewImageData(imageData, entry, palette, coreApi) {
    if (!imageData || !imageData.data) return imageData;
    if (coreApi && typeof coreApi.applyPaletteToImageData === "function" && entry) {
      coreApi.applyPaletteToImageData(imageData, entry, palette);
    }
    const pupilRgb = hexToRgb(DEFAULT_PUPIL_HEX);
    let total = 0;
    for (const eye of HUNT_FINAL_EYE_LAYOUT) {
      total += fillPupilFootprintOnImageData(imageData, eye, 0, 0, pupilRgb);
    }
    return { imageData, pupilPaintCount: total };
  }

  function isHuntPreviewPath(relativePath) {
    return relativePath === HUNT_PREVIEW_RELATIVE;
  }

  function paintHuntPreviewFromBuffer(sourceData, entry, palette, coreApi) {
    const data = new Uint8ClampedArray(sourceData);
    const imageData = { data, width: VIEWBOX, height: VIEWBOX };
    return composeHuntPreviewImageData(imageData, entry, palette, coreApi);
  }

  function paintHuntPreview(relativePath, palette, coreApi, assetUrlFn) {
    if (!isHuntPreviewPath(relativePath)) return Promise.resolve(null);
    const contracts = typeof window !== "undefined" ? window.CatCodeV6CustomPaletteContracts : null;
    const entry = contracts && contracts.hosts ? contracts.hosts[relativePath] : null;
    if (!entry || typeof document === "undefined" || typeof assetUrlFn !== "function") {
      return Promise.resolve(null);
    }
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
        composeHuntPreviewImageData(pixels, entry, palette, coreApi);
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => resolve(null);
      image.src = assetUrlFn(relativePath, entry);
    });
  }

  const api = {
    HUNT_PREVIEW_RELATIVE,
    GAZE_VIEWBOX,
    GAZE_TO_PNG_SCALE,
    HUNT_FINAL_EYE_LAYOUT_GAZE,
    HUNT_FINAL_EYE_LAYOUT,
    DEFAULT_PUPIL_HEX,
    scaleCoord,
    scaleEye,
    pupilFootprintRects,
    pupilPixelInsideTrack,
    footprintPixelKeys,
    fillPupilFootprintOnImageData,
    composeHuntPreviewImageData,
    paintHuntPreviewFromBuffer,
    paintHuntPreview,
    isHuntPreviewPath,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatCodeV6EditorHuntPreview = api;
})();
