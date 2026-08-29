"use strict";

// Recolors the artist-authored walking frames from the active CatCode skin.
// The PNG supplies motion geometry only; coat colors and markings come from
// the current pattern, including the editable side-view grid.

(() => {
  const coordinateTools =
    typeof window !== "undefined" && window.CatCodePatternCoordinates
      ? window.CatCodePatternCoordinates
      : typeof require === "function"
        ? require("../../pattern-coordinate-normalizer")
        : null;
  const FRAME_SIZE = 64;
  const FRAME_COUNT = 4;
  const SIDE_BOUNDS = { x: 4, y: 8, width: 56, height: 52 };
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
  const SIDE_PROJECTION = {
    head: { x: 43, y: 4, width: 13, height: 22 },
    body: { x: 12, y: 14, width: 36, height: 20 },
    tail: { x: 0, y: 0, width: 16, height: 23 },
    legFl: { x: 36, y: 25, width: 13, height: 15 },
    legFr: { x: 28, y: 25, width: 13, height: 15 },
    legRl: { x: 11, y: 25, width: 13, height: 15 },
    legRr: { x: 1, y: 25, width: 13, height: 15 },
    earL: { x: 48, y: 0, width: 7, height: 10 },
    earR: { x: 44, y: 1, width: 7, height: 10 },
  };

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function parseHex(value, fallback = [26, 26, 26]) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || "").trim());
    if (!match) return fallback.slice();
    return [
      parseInt(match[1].slice(0, 2), 16),
      parseInt(match[1].slice(2, 4), 16),
      parseInt(match[1].slice(4, 6), 16),
    ];
  }

  function normalizeSpots(pattern, part) {
    const source = coordinateTools
      ? coordinateTools.normalizePatternCoordinates(pattern)
      : pattern && typeof pattern === "object"
        ? pattern
        : {};
    const spots = Array.isArray(source[part]) ? source[part] : [];
    return spots
      .map((spot) => ({
        x: Number(spot && spot.x),
        y: Number(spot && spot.y),
        color: spot && typeof spot.color === "string" ? spot.color : "",
      }))
      .filter(
        (spot) =>
          Number.isInteger(spot.x) &&
          Number.isInteger(spot.y) &&
          spot.color,
      );
  }

  function projectSideSpots(pattern) {
    const source = coordinateTools
      ? coordinateTools.normalizePatternCoordinates(pattern)
      : pattern;
    const projected = new Map();
    for (const [part, sourceCells] of Object.entries(PART_CELLS)) {
      if (part === "side") continue;
      const target = SIDE_PROJECTION[part];
      for (const spot of normalizeSpots(source, part)) {
        if (
          spot.x < 0 ||
          spot.y < 0 ||
          spot.x >= sourceCells.x ||
          spot.y >= sourceCells.y
        )
          continue;
        const x = Math.min(
          SIDE_BOUNDS.width - 1,
          target.x +
            Math.round((spot.x / Math.max(1, sourceCells.x - 1)) * (target.width - 1)),
        );
        const y = Math.min(
          SIDE_BOUNDS.height - 1,
          target.y +
            Math.round((spot.y / Math.max(1, sourceCells.y - 1)) * (target.height - 1)),
        );
        projected.set(`${x},${y}`, { x, y, color: spot.color });
      }
    }
    return Array.from(projected.values());
  }

  function sideSpots(pattern) {
    const source = coordinateTools
      ? coordinateTools.normalizePatternCoordinates(pattern)
      : pattern;
    const explicit = normalizeSpots(source, "side").filter(
      (spot) =>
        spot.x >= 0 &&
        spot.y >= 0 &&
        spot.x < SIDE_BOUNDS.width &&
        spot.y < SIDE_BOUNDS.height,
    );
    if (source && source.sidePatternMode === "custom") return explicit;
    return projectSideSpots(source);
  }

  function coordinateMode(pattern) {
    return coordinateTools ? coordinateTools.detectCoordinateMode(pattern) : "detail";
  }

  function createPartSampler(pattern, parts, { fill = false } = {}) {
    const points = [];
    for (const part of parts) {
      const cells = PART_CELLS[part];
      if (!cells) continue;
      for (const spot of normalizeSpots(pattern, part)) {
        points.push({
          u: spot.x / Math.max(1, cells.x - 1),
          v: spot.y / Math.max(1, cells.y - 1),
          color: parseHex(spot.color),
        });
      }
    }
    return (u, v, fallback) => {
      let closest = null;
      let closestDistance = Infinity;
      for (const point of points) {
        const distance = (point.u - u) ** 2 + (point.v - v) ** 2;
        if (distance < closestDistance) {
          closest = point;
          closestDistance = distance;
        }
      }
      if (!closest || (!fill && closestDistance > 0.05 ** 2)) return fallback;
      return closest.color;
    };
  }

  function blendedPartColor(pattern, parts, fallback, { fill = false } = {}) {
    const colors = [];
    let availableCells = 0;
    for (const part of parts) {
      const cells = PART_CELLS[part];
      if (!cells) continue;
      availableCells += cells.x * cells.y;
      for (const spot of normalizeSpots(pattern, part)) colors.push(parseHex(spot.color));
    }
    if (colors.length === 0) return fallback;
    const effectiveCells = fill
      ? colors.length
      : Math.max(colors.length, Math.round(availableCells * 0.55));
    const missingCells = Math.max(0, effectiveCells - colors.length);
    const totals = fallback.map((channel) => channel * missingCells);
    for (const color of colors)
      for (let channel = 0; channel < 3; channel += 1)
        totals[channel] += color[channel];
    return totals.map((total) => clampByte(total / effectiveCells));
  }

  function anatomyRegion(frameX, y) {
    if (y >= 44) return frameX >= 33 ? "frontLegs" : "rearLegs";
    if (frameX <= 20) return "tail";
    if (frameX >= 34) return "head";
    return "body";
  }

  const REGION_SIDE_PROJECTION = {
    head: SIDE_PROJECTION.head,
    body: SIDE_PROJECTION.body,
    tail: SIDE_PROJECTION.tail,
    frontLegs: { x: 28, y: 25, width: 21, height: 15 },
    rearLegs: { x: 1, y: 25, width: 23, height: 15 },
  };

  function updateRegionBounds(bounds, key, x, y) {
    const current = bounds.get(key);
    if (!current) {
      bounds.set(key, { minX: x, maxX: x, minY: y, maxY: y });
      return;
    }
    current.minX = Math.min(current.minX, x);
    current.maxX = Math.max(current.maxX, x);
    current.minY = Math.min(current.minY, y);
    current.maxY = Math.max(current.maxY, y);
  }

  function hasNearbyKind(kinds, width, height, x, y, expected, radius = 1) {
    const frame = Math.floor(x / FRAME_SIZE);
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX < 0 ||
          nextY < 0 ||
          nextX >= width ||
          nextY >= height ||
          Math.floor(nextX / FRAME_SIZE) !== frame
        )
          continue;
        if (kinds[nextY * width + nextX] === expected) return true;
      }
    }
    return false;
  }

  function outsideTransparencyMask(kinds, width, height) {
    const outside = new Uint8Array(width * height);
    const queue = [];
    function enqueue(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const index = y * width + x;
      if (outside[index] || kinds[index] !== "transparent") return;
      outside[index] = 1;
      queue.push([x, y]);
    }
    for (let frameStart = 0; frameStart < width; frameStart += FRAME_SIZE) {
      const frameEnd = Math.min(width - 1, frameStart + FRAME_SIZE - 1);
      for (let x = frameStart; x <= frameEnd; x += 1) {
        enqueue(x, 0);
        enqueue(x, height - 1);
      }
      for (let y = 0; y < height; y += 1) {
        enqueue(frameStart, y);
        enqueue(frameEnd, y);
      }
    }
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const [x, y] = queue[cursor];
      const frame = Math.floor(x / FRAME_SIZE);
      for (const [offsetX, offsetY] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (Math.floor(nextX / FRAME_SIZE) === frame) enqueue(nextX, nextY);
      }
    }
    return outside;
  }

  function hasNearbyOutside(mask, width, height, x, y, radius = 1) {
    const frame = Math.floor(x / FRAME_SIZE);
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (
          nextX >= 0 &&
          nextY >= 0 &&
          nextX < width &&
          nextY < height &&
          Math.floor(nextX / FRAME_SIZE) === frame &&
          mask[nextY * width + nextX]
        )
          return true;
      }
    }
    return false;
  }

  function classifySourcePixel(r, g, b, a, position = {}) {
    if (a < 128) return "transparent";
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    if (b - r > 18 && g - r > 12) return "eye";
    if (
      r - g > 34 &&
      b - g > 12 &&
      b > 100
    )
      return "ear";
    if (luminance < 165) return "outline";
    if (chroma > 18 || r - b > 8) return "coat";
    return "transparent";
  }

  function buildDynamicSheet(sourcePixels, width, height, pattern = {}) {
    const output = new Uint8ClampedArray(sourcePixels.length);
    const mode = coordinateMode(pattern);
    const normalizedPattern = coordinateTools
      ? coordinateTools.normalizePatternCoordinates(pattern)
      : pattern;
    const base = parseHex(normalizedPattern.baseColor);
    const baseLum = (0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]) / 255;
    const outline = baseLum > 0.55 ? [28, 28, 28] : [255, 255, 255];
    const eyeBg = parseHex(normalizedPattern.eyeBgColor, [225, 247, 251]);
    const eye = parseHex(
      normalizedPattern.oddEye
        ? normalizedPattern.eyeColorRight
        : normalizedPattern.eyeColor,
      [26, 26, 26],
    );
    const fillParts = mode === "percent";
    const regionColors = {
      head: blendedPartColor(normalizedPattern, ["head"], base, {
        fill: fillParts,
      }),
      body: blendedPartColor(normalizedPattern, ["body"], base, {
        fill: fillParts,
      }),
      tail: blendedPartColor(normalizedPattern, ["tail"], base, {
        fill: fillParts,
      }),
      frontLegs: blendedPartColor(normalizedPattern, ["legFl", "legFr"], base, {
        fill: fillParts,
      }),
      rearLegs: blendedPartColor(normalizedPattern, ["legRl", "legRr"], base, {
        fill: fillParts,
      }),
    };
    // Every bundled skin has its own front-view colour data. Project it onto
    // the side grid when no artist-painted side grid exists, so a calico,
    // Siamese, tabby, etc. keep their recognisable markings while walking.
    // A manually painted side grid always wins.
    const projectedSide = sideSpots(normalizedPattern);
    const hasSideDetails = projectedSide.length > 0;
    const sidePattern = {
      ...normalizedPattern,
      side: projectedSide,
    };
    const sideSampler = createPartSampler(sidePattern, ["side"], {
      fill: false,
    });
    const rawPixelKinds = new Array(width * height);
    const pixelKinds = new Array(width * height);
    const pixelRegions = new Array(width * height);
    const regionBounds = new Map();

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        const index = pixelIndex * 4;
        const frameX = x % FRAME_SIZE;
        const kind = classifySourcePixel(
          sourcePixels[index],
          sourcePixels[index + 1],
          sourcePixels[index + 2],
          sourcePixels[index + 3],
          { frameX, y },
        );
        rawPixelKinds[pixelIndex] = kind;
      }
    }

    const outsideTransparency = outsideTransparencyMask(rawPixelKinds, width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        let kind = rawPixelKinds[pixelIndex];
        const alpha = sourcePixels[pixelIndex * 4 + 3];
        if (
          kind === "transparent" &&
          alpha >= 128 &&
          !outsideTransparency[pixelIndex]
        )
          kind = "coat";
        if (kind === "outline") {
          if (hasNearbyKind(rawPixelKinds, width, height, x, y, "eye", 2))
            kind = "eye";
          else if (!hasNearbyOutside(outsideTransparency, width, height, x, y, 1))
            kind = "coat";
        }
        pixelKinds[pixelIndex] = kind;
        if (kind !== "coat") continue;
        const frame = Math.floor(x / FRAME_SIZE);
        const frameX = x % FRAME_SIZE;
        const region = anatomyRegion(frameX, y);
        pixelRegions[pixelIndex] = region;
        updateRegionBounds(regionBounds, `${frame}:${region}`, frameX, y);
      }
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const r = sourcePixels[index];
        const g = sourcePixels[index + 1];
        const b = sourcePixels[index + 2];
        const a = sourcePixels[index + 3];
        const frameX = x % FRAME_SIZE;
        const pixelIndex = y * width + x;
        const kind = pixelKinds[pixelIndex];
        if (kind === "transparent") continue;

        let color = base;
        if (kind === "outline") color = outline;
        else if (kind === "eye") color = eyeBg;
        else if (kind === "ear") color = [244, 138, 166];
        else {
          const frame = Math.floor(x / FRAME_SIZE);
          const region = pixelRegions[pixelIndex] || "body";
          const bounds = regionBounds.get(`${frame}:${region}`) || {
            minX: SIDE_BOUNDS.x,
            maxX: SIDE_BOUNDS.x + SIDE_BOUNDS.width - 1,
            minY: SIDE_BOUNDS.y,
            maxY: SIDE_BOUNDS.y + SIDE_BOUNDS.height - 1,
          };
          const u = (frameX - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX);
          const v = (y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY);
          if (hasSideDetails) {
            const target = REGION_SIDE_PROJECTION[region];
            const sideU =
              (target.x + u * Math.max(1, target.width - 1)) /
              (SIDE_BOUNDS.width - 1);
            const sideV =
              (target.y + v * Math.max(1, target.height - 1)) /
              (SIDE_BOUNDS.height - 1);
            color = sideSampler(sideU, sideV, regionColors[region]);
          } else {
            color = regionColors[region];
          }
        }

        output[index] = color[0];
        output[index + 1] = color[1];
        output[index + 2] = color[2];
        output[index + 3] = 255;

        if (kind === "eye") {
          if ((frameX + y) % 3 === 0) {
            output[index] = eye[0];
            output[index + 1] = eye[1];
            output[index + 2] = eye[2];
          }
        }
      }
    }
    return output;
  }

  function bind() {
    const sprite = document.getElementById("playful-walk-sprite");
    const electronAPI = window.electronAPI;
    if (!sprite || !electronAPI) return;

    const image = new Image();
    let sourceImageData = null;
    let currentPattern = null;

    function render() {
      if (!sourceImageData || !currentPattern) return;
      const canvas = document.createElement("canvas");
      canvas.width = FRAME_SIZE * FRAME_COUNT;
      canvas.height = FRAME_SIZE;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) return;
      const dynamic = buildDynamicSheet(
        sourceImageData.data,
        canvas.width,
        canvas.height,
        currentPattern,
      );
      context.putImageData(
        new ImageData(dynamic, canvas.width, canvas.height),
        0,
        0,
      );
      sprite.style.backgroundImage = `url(${canvas.toDataURL("image/png")})`;
      sprite.dataset.dynamicSkinReady = "true";
    }

    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = FRAME_SIZE * FRAME_COUNT;
      canvas.height = FRAME_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      sourceImageData = context.getImageData(0, 0, canvas.width, canvas.height);
      render();
    });
    image.src = "assets/catcode-v4-walk-spritesheet.png";

    electronAPI
      .patternGet()
      .then((pattern) => {
        currentPattern = pattern || {};
        render();
      })
      .catch(() => {});
    electronAPI.onPatternChanged((pattern) => {
      currentPattern = pattern || {};
      render();
    });
  }

  const exported = {
    SIDE_BOUNDS,
    SIDE_PROJECTION,
    buildDynamicSheet,
    anatomyRegion,
    blendedPartColor,
    classifySourcePixel,
    createPartSampler,
    projectSideSpots,
    sideSpots,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof window !== "undefined" && window.document) {
    window.CatCodeSideWalk = exported;
    bind();
  }
})();
