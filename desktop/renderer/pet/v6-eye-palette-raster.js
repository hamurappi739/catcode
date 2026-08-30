"use strict";

(() => {
  const CANONICAL_TYPING_IRIS = Object.freeze([245, 191, 45]);

  function isTypingPath(relativePath) {
    return typeof relativePath === "string" && /^typing\/[^/]+\.png$/i.test(relativePath);
  }

  function normalizeHex(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toLowerCase()
      : null;
  }

  function hexToRgb(value) {
    const hex = normalizeHex(value);
    if (!hex) return null;
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
  }

  /** Recolour only the exact authored yellow iris in canonical typing PNGs. */
  function recolorExactTypingIris(imageData, relativePath, color) {
    if (!imageData || !imageData.data || !isTypingPath(relativePath)) return 0;
    const target = hexToRgb(color);
    if (!target) return 0;
    const data = imageData.data;
    let changed = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] === 0
        || data[offset] !== CANONICAL_TYPING_IRIS[0]
        || data[offset + 1] !== CANONICAL_TYPING_IRIS[1]
        || data[offset + 2] !== CANONICAL_TYPING_IRIS[2]) continue;
      data[offset] = target[0];
      data[offset + 1] = target[1];
      data[offset + 2] = target[2];
      changed += 1;
    }
    return changed;
  }

  function paintTypingImageUrl(sourceUrl, color) {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, 256, 256);
        const pixels = context.getImageData(0, 0, 256, 256);
        let changed = 0;
        const data = pixels.data;
        const target = hexToRgb(color);
        if (target) {
          for (let offset = 0; offset < data.length; offset += 4) {
            if (data[offset + 3] === 0
              || data[offset] !== CANONICAL_TYPING_IRIS[0]
              || data[offset + 1] !== CANONICAL_TYPING_IRIS[1]
              || data[offset + 2] !== CANONICAL_TYPING_IRIS[2]) continue;
            data[offset] = target[0];
            data[offset + 1] = target[1];
            data[offset + 2] = target[2];
            changed += 1;
          }
        }
        if (!changed) {
          resolve(null);
          return;
        }
        context.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => resolve(null);
      image.src = sourceUrl;
    });
  }

  const api = {
    CANONICAL_TYPING_IRIS,
    isTypingPath,
    recolorExactTypingIris,
    paintTypingImageUrl,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.CatCodeV6TypingEyePalette = api;
})();
