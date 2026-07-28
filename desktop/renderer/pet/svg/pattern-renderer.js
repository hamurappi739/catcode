"use strict";

// Renders custom pattern spots into each pose SVG.

const SVG_NS = "http://www.w3.org/2000/svg";
const PATTERN_PART_MAPPING = {
  legFl: ["leg-fl"],
  legFr: ["leg-fr"],
  legRl: ["leg-rl"],
  legRr: ["leg-rr"],
  earL: ["ear-left"],
  earR: ["ear-right"],
};

// Pattern coordinates are now stored on a two-times denser grid.  Keeping the
// conversion here lets pre-64x64 presets render unchanged in every pose.
const DETAIL_SCALE = 2;
const LEGACY_PART_CELLS = {
  head: { x: 22, y: 18 },
  body: { x: 22, y: 15 },
  tail: { x: 13, y: 10 },
  legFl: { x: 8, y: 11 },
  legFr: { x: 8, y: 11 },
  legRl: { x: 8, y: 8 },
  legRr: { x: 8, y: 8 },
  earL: { x: 6, y: 8 },
  earR: { x: 5, y: 8 },
};

function normalizePatternResolution(pattern) {
  const source = pattern && typeof pattern === "object" ? pattern : {};
  if (source.pixelResolution === DETAIL_SCALE) return source;

  const upgraded = { ...source, pixelResolution: DETAIL_SCALE };
  for (const [part, cells] of Object.entries(LEGACY_PART_CELLS)) {
    const spots = Array.isArray(source[part]) ? source[part] : [];
    upgraded[part] = spots.flatMap((spot) => {
      const x = Number(spot && spot.x);
      const y = Number(spot && spot.y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
      if (x < 0 || y < 0 || x >= cells.x || y >= cells.y) return [];
      return [
        { ...spot, x: x * DETAIL_SCALE, y: y * DETAIL_SCALE },
        { ...spot, x: x * DETAIL_SCALE + 1, y: y * DETAIL_SCALE },
        { ...spot, x: x * DETAIL_SCALE, y: y * DETAIL_SCALE + 1 },
        { ...spot, x: x * DETAIL_SCALE + 1, y: y * DETAIL_SCALE + 1 },
      ];
    });
  }
  return upgraded;
}

function createPatternRenderer({
  registry,
  refreshHeatOverlays,
  getEndData,
  getSegmentCount,
}) {
  let currentPattern = { head: [] };

  function applyToSvg(doc, pattern = currentPattern) {
    if (!doc || !pattern) return;
    const detailedPattern = normalizePatternResolution(pattern);
    for (const [partKey, spots] of Object.entries(detailedPattern)) {
      if (!Array.isArray(spots)) continue;
      const elemIds = PATTERN_PART_MAPPING[partKey] || [partKey];
      for (const elemId of elemIds) {
        applyPatternSpotsToElement(doc, elemId, spots);
      }
    }
  }

  function applyPatternSpotsToElement(doc, elemId, spots) {
    if (elemId === "body" && doc.getElementById("seg-wrap-0")) {
      distributeBodyPatchesToChain(doc, spots);
      return;
    }

    const partEl = doc.getElementById(elemId);
    if (!partEl) return;
    const frameAttr = partEl.getAttribute("data-patch-frame");
    if (!frameAttr) return;
    const [ox, oy, cw, ch] = frameAttr.split(/\s+/).map(Number);
    const mirrorXCells = parseFloat(
      partEl.getAttribute("data-patch-mirror-x") || "0",
    );
    const slot = partEl.querySelector(".patches");
    if (!slot) return;
    slot.setAttribute("shape-rendering", "crispEdges");
    while (slot.firstChild) slot.removeChild(slot.firstChild);
    for (const spot of spots) {
      const cellX =
        mirrorXCells > 0
          ? mirrorXCells * DETAIL_SCALE - 1 - spot.x
          : spot.x;
      const mappedPixels = getMappedPixelsForSpot(doc, elemId, cellX, spot.y);
      if (mappedPixels) {
        for (const pixel of mappedPixels) {
          const rect = doc.createElementNS(SVG_NS, "rect");
          rect.setAttribute("x", pixel.x);
          rect.setAttribute("y", pixel.y);
          rect.setAttribute("width", pixel.width || 1);
          rect.setAttribute("height", pixel.height || 1);
          rect.setAttribute("fill", spot.color);
          rect.setAttribute("shape-rendering", "crispEdges");
          slot.appendChild(rect);
        }
        continue;
      }

      const rect = doc.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", ox + cellX * (cw / DETAIL_SCALE));
      rect.setAttribute("y", oy + spot.y * (ch / DETAIL_SCALE));
      rect.setAttribute("width", cw / DETAIL_SCALE);
      rect.setAttribute("height", ch / DETAIL_SCALE);
      rect.setAttribute("fill", spot.color);
      rect.setAttribute("shape-rendering", "crispEdges");
      slot.appendChild(rect);
    }
  }

  function getMappedPixelsForSpot(doc, elemId, cellX, cellY) {
    const api = window.cellMappings;
    if (!api || typeof api.getPixelsForCell !== "function") return null;
    const svgName = registry.getName(doc);
    if (!svgName) return null;
    const sourceX = Math.floor(cellX / DETAIL_SCALE);
    const sourceY = Math.floor(cellY / DETAIL_SCALE);
    const pixels = api.getPixelsForCell(svgName, elemId, sourceX, sourceY);
    if (
      Array.isArray(pixels) &&
      pixels.length === 0 &&
      (svgName === "jump-ing" || svgName === "jump-start") &&
      (elemId === "leg-fl" || elemId === "leg-fr")
    ) {
      return null;
    }
    if (!Array.isArray(pixels)) return null;
    const offsetX = (cellX % DETAIL_SCALE) / DETAIL_SCALE;
    const offsetY = (cellY % DETAIL_SCALE) / DETAIL_SCALE;
    return pixels.map((pixel) => ({
      x: pixel.x + offsetX,
      y: pixel.y + offsetY,
      width: 1 / DETAIL_SCALE,
      height: 1 / DETAIL_SCALE,
    }));
  }

  function distributeBodyPatchesToChain(doc, spots) {
    const endData = getEndData && getEndData();
    if (!endData) return;
    const bodyWrapper = doc.getElementById("body");
    if (!bodyWrapper) return;

    const segmentCount = getSegmentCount();
    const { bodyYmin, segHeight, lerpData, bodyRowRects } = endData;
    if (!bodyRowRects || bodyRowRects.length === 0) return;

    for (let i = 0; i < segmentCount; i++) {
      const wrapEl = doc.getElementById(`seg-wrap-${i}`);
      if (!wrapEl) continue;
      for (const child of Array.from(wrapEl.children)) {
        if (child.classList && child.classList.contains("body-patch")) {
          wrapEl.removeChild(child);
        }
      }
    }
    for (let i = lerpData.length - 1; i >= 0; i--) {
      if (
        lerpData[i].rect &&
        lerpData[i].rect.classList &&
        lerpData[i].rect.classList.contains("body-patch")
      ) {
        lerpData.splice(i, 1);
      }
    }
    const slot = bodyWrapper.querySelector(".patches");
    if (slot) while (slot.firstChild) slot.removeChild(slot.firstChild);

    function addBodyPatchRect({
      color,
      endX,
      endY,
      endW,
      endH,
      startX,
      startY,
      startW,
      startH,
    }) {
      const cy = endY + endH / 2;
      const segIdx = Math.min(
        segmentCount - 1,
        Math.max(0, Math.floor((cy - bodyYmin) / segHeight)),
      );
      const cumulativeY = bodyYmin + segIdx * segHeight;
      const startYLocal = startY - cumulativeY;
      const endYLocal = endY - cumulativeY;

      const rect = doc.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "body-patch");
      rect.setAttribute("x", endX);
      rect.setAttribute("y", endYLocal);
      rect.setAttribute("width", endW);
      rect.setAttribute("height", endH);
      rect.setAttribute("fill", color);
      rect.setAttribute("shape-rendering", "crispEdges");

      const wrapEl = doc.getElementById(`seg-wrap-${segIdx}`);
      if (wrapEl) wrapEl.appendChild(rect);

      lerpData.push({
        rect,
        useTransform: false,
        startX,
        endX,
        startYLocal,
        endYLocal,
        startW,
        endW,
        startH,
        endH,
      });
    }

    // Stretching poses still distribute patches through the legacy body-chain
    // map. The surrounding renderer uses half-pixel patches; this lookup must
    // stay on the map's native 22-column coordinate system.
    const CELLS_X = 22;
    const chainMapping =
      window.cellMappings &&
      window.cellMappings.MAPPINGS &&
      window.cellMappings.MAPPINGS["stretch-chain:body"];

    function addBodyBlockPatch(blockX, blockY, color) {
      if (blockY < 0 || blockY >= bodyRowRects.length) return;
      const targetRect = bodyRowRects[blockY];
      if (blockX < 0 || blockX >= CELLS_X) return;

      const startMaxCol = Math.max(0, targetRect.startW - 1);
      const endMaxCol = Math.max(0, targetRect.endW - 1);
      const cellsMaxCol = CELLS_X - 1;
      const startColInRow = Math.round((blockX * startMaxCol) / cellsMaxCol);
      const endColInRow = Math.round((blockX * endMaxCol) / cellsMaxCol);
      const startX = targetRect.startX + startColInRow;
      const endX = targetRect.endX + endColInRow;
      const startW = 1;
      const endW = 1;
      const startH = targetRect.startH;
      const endH = targetRect.endH;
      const endY = targetRect.endY;

      addBodyPatchRect({
        color,
        endX,
        endY,
        endW,
        endH,
        startX,
        startY: targetRect.startY,
        startW,
        startH,
      });
    }

    for (const spot of spots) {
      const mappedBlocks =
        chainMapping &&
        chainMapping.cells &&
        Array.isArray(
          chainMapping.cells[
            `${Math.floor(spot.x / DETAIL_SCALE)},${Math.floor(
              spot.y / DETAIL_SCALE,
            )}`
          ],
        ) &&
        chainMapping.cells[
          `${Math.floor(spot.x / DETAIL_SCALE)},${Math.floor(
            spot.y / DETAIL_SCALE,
          )}`
        ].length > 0
          ? chainMapping.cells[
              `${Math.floor(spot.x / DETAIL_SCALE)},${Math.floor(
                spot.y / DETAIL_SCALE,
              )}`
            ]
          : [[Math.floor(spot.x / DETAIL_SCALE), Math.floor(spot.y / DETAIL_SCALE)]];
      for (const [blockX, blockY] of mappedBlocks) {
        addBodyBlockPatch(blockX, blockY, spot.color);
      }
    }
  }

  function applyAll(pattern) {
    currentPattern = normalizePatternResolution(pattern);
    registry.forEach((doc) => {
      applyToSvg(doc, currentPattern);
      refreshHeatOverlays(doc);
    });
  }

  function applyCurrentBodyToChain(doc) {
    if (Array.isArray(currentPattern && currentPattern.body)) {
      distributeBodyPatchesToChain(doc, currentPattern.body);
    }
  }

  return {
    applyAll,
    applyCurrentBodyToChain,
    applyToSvg,
    getCurrentPattern: () => currentPattern,
  };
}

module.exports = {
  createPatternRenderer,
};
