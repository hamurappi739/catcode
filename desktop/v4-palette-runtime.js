"use strict";

// Palette adapter for the approved v4 mascot. It is loaded before the v4
// migration is enabled, so it deliberately ignores all current v2 SVG poses.
// The adapter keeps the detailed source shading and shifts it toward the
// selected pattern colour once a v4 SVG document is registered.
(() => {
  const modelSelector = 'svg[data-catcode-model="v4"]';
  const detailCells = {
    head: { x: 44, y: 36 },
    body: { x: 44, y: 30 },
    tail: { x: 26, y: 20 },
    legFl: { x: 16, y: 22 },
    legFr: { x: 16, y: 22 },
    legRl: { x: 16, y: 16 },
    legRr: { x: 16, y: 16 },
    earL: { x: 12, y: 16 },
    earR: { x: 10, y: 16 },
  };
  const v4LayerForPart = {
    head: "head",
    earL: "head",
    earR: "head",
    body: "body",
    tail: "tail",
    legFl: "leg-fl",
    legRl: "leg-fl",
    legFr: "leg-fr",
    legRr: "leg-fr",
  };

  // Eye roles are only valid on face/eye layers. Body/tail/leg pixels must
  // never be treated as pupil/iris/eye-bg (structural — never color heuristics).
  const EYE_ROLE_CLASSES = [
    "v4-pupil-left",
    "v4-pupil-right",
    "v4-iris-left",
    "v4-iris-right",
    "v4-eye-bg-left",
    "v4-eye-bg-right",
  ];
  const ALLOWED_EYE_LAYER_IDS = new Set([
    "head",
    "face-js",
    "eyes-js",
    "v4-eye-left",
    "v4-eye-left-frame",
    "v4-eye-left-move",
    "v4-eye-right",
    "v4-eye-right-frame",
    "v4-eye-right-move",
    // Stage S-eye / S-eye.1 sleep eye stacks (side-lying SVG).
    "v4-sleep-eyes",
    "v4-sleep-closed-lids",
    "v4-sleep-closed-face",
    "v4-sleep-peek-face",
    "v4-sleep-peek-face-frame",
    "v4-sleep-peek-face-move",
    // Legacy dual ids kept harmless if an older SVG is loaded in tests.
    "v4-sleep-closed-left",
    "v4-sleep-closed-right",
    "v4-sleep-peek-left",
    "v4-sleep-peek-left-frame",
    "v4-sleep-peek-left-move",
    "v4-sleep-peek-right",
    "v4-sleep-peek-right-frame",
    "v4-sleep-peek-right-move",
  ]);
  const FORBIDDEN_EYE_LAYER_IDS = new Set([
    "body",
    "body-js",
    "tail",
    "leg-fl",
    "leg-fr",
    "leg-rl",
    "leg-rr",
  ]);
  const REGION_CLASS_TO_KEY = Object.freeze({
    "v4-region-head": "head",
    "v4-region-ears": "ears",
    "v4-region-body": "body",
    "v4-region-frontPaws": "frontPaws",
    "v4-region-hindPaws": "hindPaws",
    "v4-region-tail": "tail",
  });
  const EYE_PIXEL_SELECTOR =
    ".v4-iris-left,.v4-iris-right,.v4-pupil-left,.v4-pupil-right,.v4-eye-bg-left,.v4-eye-bg-right,.v4-eye-outline";

  function clamp(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function parseHex(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || "").trim());
    if (!match) return null;
    const source = match[1];
    return [0, 2, 4].map((offset) => Number.parseInt(source.slice(offset, offset + 2), 16));
  }

  function toHex(rgb) {
    return `#${rgb.map((value) => clamp(value).toString(16).padStart(2, "0")).join("")}`;
  }

  function luminance(rgb) {
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  }

  function tint(source, base) {
    const sourceRgb = parseHex(source);
    const baseRgb = parseHex(base);
    if (!sourceRgb || !baseRgb) return source;
    const value = luminance(sourceRgb);
    if (value < 48) return toHex(baseRgb.map((channel) => channel * 0.48));
    if (value > 205) return toHex(baseRgb.map((channel) => channel + (255 - channel) * 0.46));
    const amount = Math.max(0.25, Math.min(1.6, value / 112));
    return toHex(baseRgb.map((channel) => channel * amount));
  }

  // Dark coats must keep their selected hue. A fixed graphite lift made navy,
  // burgundy, dark green, and black look identical. This maps authored shading
  // onto the chosen coat while preserving chromaticity.
  function shadeCoat(source, coat) {
    const sourceRgb = parseHex(source);
    const coatRgb = parseHex(coat);
    if (!sourceRgb || !coatRgb) return source || coat;
    const srcT = Math.max(0, Math.min(1, luminance(sourceRgb) / 255));
    const coatL = Math.max(0.001, luminance(coatRgb) / 255);
    // Band around the coat: darker source pixels deepen it, lighter ones lift it.
    const lo = Math.max(0.015, coatL * 0.38);
    const hi = Math.min(0.94, coatL * 1.7 + 0.1);
    const targetL = lo + (hi - lo) * srcT;
    const scale = targetL / coatL;
    return toHex(coatRgb.map((channel) => channel * scale));
  }

  function coatColorForSource(source, coat) {
    const coatRgb = parseHex(coat);
    if (!coatRgb) return tint(source, coat);
    // Always shade through the selected coat so dark hues stay distinguishable.
    // Mid/light coats keep the previous soft tint curve for familiar contrast.
    if (luminance(coatRgb) < 90) return shadeCoat(source, coat);
    return tint(source, coat);
  }

  // Retained for tests/export; no longer used as the dark-coat paint path.
  function liftDarkReference(source) {
    const sourceRgb = parseHex(source);
    if (!sourceRgb) return source;
    const amount = luminance(sourceRgb) / 255;
    const shadow = [36, 44, 57];
    const highlight = [113, 132, 154];
    return toHex(shadow.map((channel, index) => (
      channel + (highlight[index] - channel) * amount
    )));
  }

  // Purr closed lids: coat-crease / outline contrast — never iris/eye colour.
  // On dark coats lift enough to read as a thin crease at desktop scale, but
  // stay well below pale sclera greys that read as "blind" eye blobs.
  function lidColorForCoat(coat) {
    const coatRgb = parseHex(coat);
    if (!coatRgb) return "#3a4450";
    const L = luminance(coatRgb);
    if (L < 48) {
      // Graphite/black: readable fur crease, well below pale sclera greys.
      return toHex([
        Math.min(255, coatRgb[0] + 32),
        Math.min(255, coatRgb[1] + 36),
        Math.min(255, coatRgb[2] + 40),
      ]);
    }
    if (L > 170) {
      // Light coats: soft dark crease, not a pure black sticker.
      return toHex(coatRgb.map((channel) => Math.round(channel * 0.28)));
    }
    // Mid coats: deepen toward a fur-shadow.
    return toHex(coatRgb.map((channel) => Math.round(channel * 0.42)));
  }

  function setPixelFill(pixel, hex) {
    if (!pixel) return;
    if (pixel.style && typeof pixel.style.setProperty === "function") {
      pixel.style.setProperty("fill", hex);
    } else if (pixel.style) {
      pixel.style.fill = hex;
    }
  }

  function clearPixelFill(pixel) {
    if (!pixel) return;
    if (pixel.style && typeof pixel.style.removeProperty === "function") {
      pixel.style.removeProperty("fill");
    } else if (pixel.style) {
      pixel.style.fill = "";
    }
  }

  function detailCoordinate(pattern, point) {
    const multiplier = Number(pattern && pattern.pixelResolution) === 2 ? 1 : 2;
    return {
      x: Math.round(Number(point && point.x) * multiplier),
      y: Math.round(Number(point && point.y) * multiplier),
    };
  }

  function candidatePixels(svg, layerId) {
    return Array.from(svg.querySelectorAll(`#${layerId} > rect.v4-pixel`)).map((pixel) => ({
      pixel,
      x: Number(pixel.getAttribute("x")),
      y: Number(pixel.getAttribute("y")),
    }));
  }

  function closestPixel(cells, x, y) {
    let closest = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const cell of cells) {
      const nextDistance = (cell.x - x) ** 2 + (cell.y - y) ** 2;
      if (nextDistance < distance) {
        closest = cell;
        distance = nextDistance;
      }
    }
    return closest;
  }

  function isAllowedEyeLayer(pixel) {
    let node = pixel && pixel.parentElement;
    while (node && node.tagName && node.tagName.toLowerCase() !== "svg") {
      const id = node.id || "";
      if (FORBIDDEN_EYE_LAYER_IDS.has(id)) return false;
      if (ALLOWED_EYE_LAYER_IDS.has(id)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function sanitizeSemanticEyeRoles(svg) {
    if (!svg || !svg.querySelectorAll) return;
    const selector = EYE_ROLE_CLASSES.map((name) => `.${name}`).join(",");
    svg.querySelectorAll(selector).forEach((pixel) => {
      if (isAllowedEyeLayer(pixel)) return;
      pixel.classList.remove(...EYE_ROLE_CLASSES);
      if (
        !pixel.classList.contains("v4-base") &&
        !pixel.classList.contains("v4-outline") &&
        !pixel.classList.contains("v4-highlight") &&
        !pixel.classList.contains("v4-coat-light") &&
        !pixel.classList.contains("v4-ear-inner") &&
        !pixel.classList.contains("v4-muzzle") &&
        !pixel.classList.contains("v4-closed-lid")
      ) {
        pixel.classList.add("v4-base");
      }
    });
  }

  function applyPatternSpots(svg, pattern) {
    const prior = svg.querySelector("#v4-pattern-spots");
    if (prior) prior.remove();
    const ns = "http://www.w3.org/2000/svg";
    const overlay = svg.ownerDocument.createElementNS(ns, "g");
    overlay.id = "v4-pattern-spots";
    overlay.setAttribute("data-v4-generated", "pattern-projection");
    const cellCache = new Map();
    const occupied = new Set();

    for (const [part, bounds] of Object.entries(detailCells)) {
      const layerId = v4LayerForPart[part];
      if (!layerId || !Array.isArray(pattern[part])) continue;
      const cells = cellCache.get(layerId) || candidatePixels(svg, layerId);
      cellCache.set(layerId, cells);
      if (cells.length === 0) continue;
      const minX = Math.min(...cells.map((cell) => cell.x));
      const maxX = Math.max(...cells.map((cell) => cell.x));
      const minY = Math.min(...cells.map((cell) => cell.y));
      const maxY = Math.max(...cells.map((cell) => cell.y));
      for (const spot of pattern[part]) {
        if (!spot || typeof spot.color !== "string" || !spot.color) continue;
        const point = detailCoordinate(pattern, spot);
        if (point.x < 0 || point.y < 0 || point.x >= bounds.x || point.y >= bounds.y) continue;
        const targetX = minX + (point.x / Math.max(1, bounds.x - 1)) * (maxX - minX);
        const targetY = minY + (point.y / Math.max(1, bounds.y - 1)) * (maxY - minY);
        const target = closestPixel(cells, targetX, targetY);
        if (!target) continue;
        const key = `${target.x},${target.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        const rect = svg.ownerDocument.createElementNS(ns, "rect");
        rect.setAttribute("x", String(target.x));
        rect.setAttribute("y", String(target.y));
        rect.setAttribute("width", "1");
        rect.setAttribute("height", "1");
        rect.setAttribute("fill", spot.color);
        overlay.appendChild(rect);
      }
    }
    if (overlay.childElementCount > 0) svg.querySelector("#cat-content")?.appendChild(overlay);
  }

  function isEyePixel(pixel) {
    if (!pixel || !pixel.classList) return false;
    return (
      pixel.classList.contains("v4-iris-left") ||
      pixel.classList.contains("v4-iris-right") ||
      pixel.classList.contains("v4-pupil-left") ||
      pixel.classList.contains("v4-pupil-right") ||
      pixel.classList.contains("v4-eye-bg-left") ||
      pixel.classList.contains("v4-eye-bg-right") ||
      pixel.classList.contains("v4-eye-outline")
    );
  }

  // Canonical idle front paint space used when projecting markings onto the
  // side-lying sleep silhouette (Stage S1). Not identical anatomy — a
  // deterministic UV map from editor coords → sleep region bbox.
  const IDLE_MARK_SPACE = Object.freeze({
    minX: 8,
    maxX: 55,
    minY: 2,
    maxY: 61,
  });
  const SLEEP_MARK_MAP = "idle-uv-to-region-bbox";

  function isSleepPoseSvg(svg) {
    return !!(
      svg &&
      typeof svg.getAttribute === "function" &&
      svg.getAttribute("data-v4-sleep-pose") === "1"
    );
  }

  function isProtectedFacePixel(pixel) {
    if (!pixel || !pixel.classList) return false;
    return (
      isEyePixel(pixel) ||
      pixel.classList.contains("v4-nose") ||
      pixel.classList.contains("v4-closed-lid") ||
      // Stage S1 reserve for future S2/S3 lid/open-eye art on sleep.
      pixel.classList.contains("v4-sleep-lid-reserve")
    );
  }

  function regionKeyForPixel(pixel) {
    if (!pixel || !pixel.classList) return null;
    for (const [className, key] of Object.entries(REGION_CLASS_TO_KEY)) {
      if (pixel.classList.contains(className)) return key;
    }
    return null;
  }

  function paintableCells(svg, regionKey) {
    return Array.from(svg.querySelectorAll("rect.v4-pixel"))
      .map((pixel) => ({
        pixel,
        x: Number(pixel.getAttribute("x")),
        y: Number(pixel.getAttribute("y")),
      }))
      .filter((cell) => {
        if (!Number.isFinite(cell.x) || !Number.isFinite(cell.y)) return false;
        if (isProtectedFacePixel(cell.pixel)) return false;
        if (!regionKey || regionKey === "all") {
          return !!regionKeyForPixel(cell.pixel);
        }
        return regionKeyForPixel(cell.pixel) === regionKey;
      });
  }

  function cellsBBox(cells) {
    return {
      minX: Math.min(...cells.map((c) => c.x)),
      maxX: Math.max(...cells.map((c) => c.x)),
      minY: Math.min(...cells.map((c) => c.y)),
      maxY: Math.max(...cells.map((c) => c.y)),
    };
  }

  /**
   * Map an idle-front integer marking (x,y) into a sleep paintable cell.
   * u/v clamp into IDLE_MARK_SPACE, scale into the sleep cells' AABB, snap.
   */
  function projectIdleMarkToSleepCells(x, y, cells) {
    if (!cells || cells.length === 0) return null;
    const box = cellsBBox(cells);
    const denomX = Math.max(1, IDLE_MARK_SPACE.maxX - IDLE_MARK_SPACE.minX);
    const denomY = Math.max(1, IDLE_MARK_SPACE.maxY - IDLE_MARK_SPACE.minY);
    let u = (x - IDLE_MARK_SPACE.minX) / denomX;
    let v = (y - IDLE_MARK_SPACE.minY) / denomY;
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));
    const tx = box.minX + u * (box.maxX - box.minX);
    const ty = box.minY + v * (box.maxY - box.minY);
    return closestPixel(cells, tx, ty);
  }

  function applyMarkings(svg, pattern) {
    const prior = svg.querySelector("#v4-user-markings");
    if (prior) prior.remove();
    const ns = "http://www.w3.org/2000/svg";
    const overlay = svg.ownerDocument.createElementNS(ns, "g");
    overlay.id = "v4-user-markings";
    overlay.setAttribute("data-v4-generated", "user-markings");
    const sleepPose = isSleepPoseSvg(svg);
    if (sleepPose) {
      overlay.setAttribute("data-v4-sleep-mark-map", SLEEP_MARK_MAP);
    }
    const occupied = new Set();

    function paintSpots(spots, regionKey) {
      if (!Array.isArray(spots) || spots.length === 0) return;
      const cells = paintableCells(svg, regionKey || "all");
      if (cells.length === 0) return;
      for (const spot of spots) {
        if (!spot || typeof spot.color !== "string" || !spot.color) continue;
        const x = Number(spot.x);
        const y = Number(spot.y);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        const target = sleepPose
          ? projectIdleMarkToSleepCells(x, y, cells)
          : closestPixel(cells, x, y);
        if (!target) continue;
        if (regionKey && regionKey !== "all") {
          if (regionKeyForPixel(target.pixel) !== regionKey) continue;
        }
        const key = `${target.x},${target.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        const rect = svg.ownerDocument.createElementNS(ns, "rect");
        rect.setAttribute("x", String(target.x));
        rect.setAttribute("y", String(target.y));
        rect.setAttribute("width", "1");
        rect.setAttribute("height", "1");
        rect.setAttribute("fill", spot.color);
        overlay.appendChild(rect);
      }
    }

    paintSpots(pattern.markings, "all");
    const regionMarkings =
      pattern.regionMarkings && typeof pattern.regionMarkings === "object"
        ? pattern.regionMarkings
        : {};
    for (const key of Object.keys(REGION_CLASS_TO_KEY).map(
      (className) => REGION_CLASS_TO_KEY[className],
    )) {
      paintSpots(regionMarkings[key], key);
    }
    if (overlay.childElementCount > 0) {
      svg.querySelector("#cat-content")?.appendChild(overlay);
    }
  }

  function isNearWhite(hex) {
    const rgb = parseHex(hex);
    if (!rgb) return false;
    return luminance(rgb) > 210;
  }

  function applyPalette(svg, pattern = {}) {
    if (!svg || !svg.matches || !svg.matches(modelSelector)) return;
    // V6-M0: palette must not mutate document.body.dataset.catcodeModel.
    sanitizeSemanticEyeRoles(svg);
    const base = pattern.baseColor || "#20242d";
    const eye = pattern.eyeColor || "#a7eff0";
    const eyeLeft = pattern.oddEye ? pattern.eyeColorLeft || eye : eye;
    const eyeRight = pattern.oddEye ? pattern.eyeColorRight || eye : eye;
    const eyeStyle = pattern.eyeStyle === "solid" ? "solid" : "natural";
    let eyeBg = pattern.eyeBgColor || "#edf4f5";
    // Solid eyes: never leave a pale sclera fragment. If fill is still the
    // near-white natural default, promote iris color into the fill.
    if (eyeStyle === "solid" && isNearWhite(eyeBg)) {
      eyeBg = eye;
    }
    const eyeFillLeft = eyeStyle === "solid" ? (pattern.oddEye ? eyeLeft : eyeBg) : eyeBg;
    const eyeFillRight = eyeStyle === "solid" ? (pattern.oddEye ? eyeRight : eyeBg) : eyeBg;
    // In solid mode the whole eye body shares the fill; iris can still tint
    // slightly but defaults to the same fill when matching owner expectation.
    const irisLeft = eyeStyle === "solid" ? eyeLeft : eyeLeft;
    const irisRight = eyeStyle === "solid" ? eyeRight : eyeRight;
    const solidFillLeft = eyeStyle === "solid" ? eyeLeft : eyeFillLeft;
    const solidFillRight = eyeStyle === "solid" ? eyeRight : eyeFillRight;
    const eyeOutline = pattern.eyeOutlineColor || "#1c1c1c";
    const eyePupil = pattern.eyePupilColor || "#141820";
    const earInner = pattern.earInnerColor || "#f18aa5";
    const nose = pattern.noseColor || "#304055";
    const root = svg.style;
    root.setProperty("--cat-color", base);
    root.setProperty("--eye-color", eye);
    root.setProperty("--eye-color-left", eyeLeft);
    root.setProperty("--eye-color-right", eyeRight);
    root.setProperty("--eye-bg-color", eyeBg);
    root.setProperty("--eye-outline-color", eyeOutline);
    root.setProperty("--eye-pupil-color", eyePupil);
    root.setProperty("--ear-inner-color", earInner);
    root.setProperty("--nose-color", nose);
    root.setProperty("--eye-style", eyeStyle);
    const regionColors =
      pattern.regionColors && typeof pattern.regionColors === "object"
        ? pattern.regionColors
        : {};
    svg.querySelectorAll(".v4-pixel").forEach((pixel) => {
      const fill = pixel.getAttribute("fill") || "";
      const match = /--v4-source-([0-9a-f]{6})/i.exec(fill);
      if (!match) return;
      const source = `#${match[1]}`;
      const baseRgb = parseHex(base) || [32, 36, 45];
      let coat = base;
      const regionKey = regionKeyForPixel(pixel);
      const regionOverride =
        regionKey &&
        typeof regionColors[regionKey] === "string" &&
        regionColors[regionKey]
          ? regionColors[regionKey]
          : "";
      if (regionOverride) coat = regionOverride;
      const coatRgb = parseHex(coat) || baseRgb;
      let next = coatColorForSource(source, coat);
      let forceDirect = !!regionOverride;
      if (pixel.classList.contains("v4-outline")) {
        next = luminance(coatRgb) > 150 ? "#1c1c1c" : next;
        // Outline must not rewrite shared --v4-source-* used by coat fills.
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-eye-outline")) {
        next = eyeOutline;
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-ear-inner")) {
        // S-ear.0 / S-ear.0.1: ear interiors always use earInnerColor.
        // regionColors.ears owns shell/rim only (v4-region-ears without ear-inner).
        next = earInner;
        forceDirect = true;
      } else if (
        pixel.classList.contains("v4-region-ears") &&
        typeof regionColors.ears === "string" &&
        regionColors.ears
      ) {
        // S-ear.0.1: outer ear shell must read as the chosen ears colour, not a
        // muddy source-tint that can look like the default coat.
        if (pixel.classList.contains("v4-outline")) {
          const earsRgb = parseHex(regionColors.ears) || coatRgb;
          next =
            luminance(earsRgb) > 150
              ? "#1c1c1c"
              : coatColorForSource(source, regionColors.ears);
        } else {
          next = regionColors.ears;
        }
        forceDirect = true;
      }
      // Nose tip only — muzzle keeps coat shading so it cannot steal nose color.
      if (pixel.classList.contains("v4-nose")) {
        next = nose;
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-closed-lid")) {
        // Always derive from the active coat (incl. head region override).
        // Never fall back to iris / eyeColor — that produced cyan purr bars.
        next = lidColorForCoat(coat);
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-iris-left")) {
        next = eyeStyle === "solid" ? solidFillLeft : irisLeft;
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-iris-right")) {
        next = eyeStyle === "solid" ? solidFillRight : irisRight;
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-pupil-left") || pixel.classList.contains("v4-pupil-right")) {
        next = eyePupil;
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-eye-bg-left")) {
        next = eyeStyle === "solid" ? solidFillLeft : eyeBg;
        forceDirect = true;
      }
      if (pixel.classList.contains("v4-eye-bg-right")) {
        next = eyeStyle === "solid" ? solidFillRight : eyeBg;
        forceDirect = true;
      }
      // Role/region colors must not share CSS variables with unrelated pixels.
      if (forceDirect) {
        setPixelFill(pixel, next);
      } else {
        clearPixelFill(pixel);
        root.setProperty(`--v4-source-${match[1]}`, next);
      }
    });
    const highlight = pattern.__editorHighlightRegion;
    svg.querySelectorAll("[data-v4-region-highlight]").forEach((node) => {
      node.removeAttribute("data-v4-region-highlight");
    });
    if (highlight && highlight !== "all") {
      const className = Object.entries(REGION_CLASS_TO_KEY).find(
        ([, key]) => key === highlight,
      )?.[0];
      if (className) {
        svg.querySelectorAll(`rect.${className}`).forEach((pixel) => {
          pixel.setAttribute("data-v4-region-highlight", highlight);
        });
      }
    }
    applyPatternSpots(svg, pattern);
    applyMarkings(svg, pattern);
  }

  window.CatCodeV4Palette = {
    applyPalette,
    sanitizeSemanticEyeRoles,
    applyMarkings,
    paintableCells,
    regionKeyForPixel,
    isEyePixel,
    isProtectedFacePixel,
    isSleepPoseSvg,
    projectIdleMarkToSleepCells,
    IDLE_MARK_SPACE,
    SLEEP_MARK_MAP,
    REGION_CLASS_TO_KEY,
    tint,
    shadeCoat,
    coatColorForSource,
    liftDarkReference,
    lidColorForCoat,
  };
})();
