"use strict";

// CatCode has shipped skins in three coordinate formats. Keep the conversion
// in one place so the editor and every animated pose read them identically.
(() => {
  const DETAIL_SCALE = 2;
  const PART_CELLS = {
    head: { x: 44, y: 36 },
    body: { x: 44, y: 30 },
    tail: { x: 26, y: 20 },
    legFl: { x: 16, y: 22 },
    legFr: { x: 16, y: 22 },
    legRl: { x: 16, y: 16 },
    legRr: { x: 16, y: 16 },
    earL: { x: 12, y: 16 },
    earR: { x: 10, y: 16 },
    side: { x: 56, y: 40 },
  };
  const LEGACY_PART_CELLS = Object.fromEntries(
    Object.entries(PART_CELLS).map(([part, cells]) => [
      part,
      { x: Math.ceil(cells.x / DETAIL_SCALE), y: Math.ceil(cells.y / DETAIL_SCALE) },
    ]),
  );

  function sourceSpots(pattern, part) {
    return Array.isArray(pattern && pattern[part]) ? pattern[part] : [];
  }

  function numericSpot(spot) {
    const x = Number(spot && spot.x);
    const y = Number(spot && spot.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }

  function detectCoordinateMode(pattern) {
    const source = pattern && typeof pattern === "object" ? pattern : {};
    if (Number(source.pixelResolution) === DETAIL_SCALE) return "detail";
    if (source.coordinateSpace === "percent") return "percent";

    let hasCoordinates = false;
    let hasFractionalCoordinates = false;
    let fitsLegacy = true;
    let fitsDetail = true;
    let fitsPercent = true;

    for (const [part, detailCells] of Object.entries(PART_CELLS)) {
      const legacyCells = LEGACY_PART_CELLS[part];
      for (const spot of sourceSpots(source, part)) {
        const point = numericSpot(spot);
        if (!point) continue;
        hasCoordinates = true;
        hasFractionalCoordinates ||=
          !Number.isInteger(point.x) || !Number.isInteger(point.y);
        fitsLegacy &&=
          point.x >= 0 &&
          point.y >= 0 &&
          point.x < legacyCells.x &&
          point.y < legacyCells.y;
        fitsDetail &&=
          point.x >= 0 &&
          point.y >= 0 &&
          point.x < detailCells.x &&
          point.y < detailCells.y;
        fitsPercent &&=
          point.x >= 0 && point.y >= 0 && point.x <= 100 && point.y <= 100;
      }
    }

    if (!hasCoordinates) return "detail";
    if (fitsLegacy) return "legacy";
    if (fitsPercent && (!fitsDetail || hasFractionalCoordinates)) return "percent";
    if (fitsDetail) return "detail";
    if (fitsPercent) return "percent";
    return "detail";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizePartSpots(pattern, part, mode = detectCoordinateMode(pattern)) {
    const cells = PART_CELLS[part];
    if (!cells) return [];
    const normalized = new Map();

    function remember(spot, x, y) {
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= cells.x ||
        y >= cells.y ||
        !spot ||
        typeof spot.color !== "string" ||
        !spot.color
      )
        return;
      normalized.set(`${x},${y}`, { ...spot, x, y });
    }

    for (const spot of sourceSpots(pattern, part)) {
      const point = numericSpot(spot);
      if (!point) continue;
      if (mode === "legacy") {
        const x = Math.round(point.x) * DETAIL_SCALE;
        const y = Math.round(point.y) * DETAIL_SCALE;
        remember(spot, x, y);
        remember(spot, x + 1, y);
        remember(spot, x, y + 1);
        remember(spot, x + 1, y + 1);
        continue;
      }
      if (mode === "percent") {
        remember(
          spot,
          Math.round((clamp(point.x, 0, 100) / 100) * (cells.x - 1)),
          Math.round((clamp(point.y, 0, 100) / 100) * (cells.y - 1)),
        );
        continue;
      }
      remember(spot, Math.round(point.x), Math.round(point.y));
    }
    return Array.from(normalized.values()).sort(
      (left, right) =>
        left.y - right.y || left.x - right.x || left.color.localeCompare(right.color),
    );
  }

  function normalizePatternCoordinates(pattern) {
    const source = pattern && typeof pattern === "object" ? pattern : {};
    const mode = detectCoordinateMode(source);
    const normalized = { ...source, pixelResolution: DETAIL_SCALE };
    for (const part of Object.keys(PART_CELLS))
      normalized[part] = normalizePartSpots(source, part, mode);
    return normalized;
  }

  const exported = {
    DETAIL_SCALE,
    LEGACY_PART_CELLS,
    PART_CELLS,
    detectCoordinateMode,
    normalizePartSpots,
    normalizePatternCoordinates,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof window !== "undefined") window.CatCodePatternCoordinates = exported;
})();
