"use strict";

/**
 * Deterministic V6 semantic skin mask contract.
 * Runtime recolour uses pre-baked masks only — never RGB guessing for coat selection.
 *
 * Mask PNG: R channel stores class id, G=B=0, A=255 for labeled pixels / 0 transparent.
 */

const MASK_TRANSPARENT = 0;
const MASK_COAT = 1;
const MASK_EYE = 2;
const MASK_INNER_EAR = 3;
const MASK_LINE = 4;
const MASK_PROP = 5;

const MASK_CLASS_NAMES = Object.freeze({
  [MASK_TRANSPARENT]: "transparent",
  [MASK_COAT]: "coat",
  [MASK_EYE]: "eye",
  [MASK_INNER_EAR]: "inner-ear",
  [MASK_LINE]: "line",
  [MASK_PROP]: "prop",
});

function familyFromAssetPath(assetRel) {
  const value = String(assetRel || "").replace(/\\/g, "/");
  if (value.includes("typing/")) return "typing";
  if (value.includes("scroll/")) return "scroll";
  if (value.includes("tease/")) return "tease";
  if (value.includes("hunt")) return "hunt";
  if (value.includes("dance/")) return "dance";
  if (value.includes("walk/")) return "walk";
  if (value.includes("sleep/")) return "sleep";
  if (value.includes("purr")) return "purr";
  if (value.includes("celebrate/")) return "celebrate";
  if (value.includes("edge-peek/")) return "edge-peek";
  if (value.includes("head-layers/")) return "idle-head-layers";
  if (value.includes("angry/")) return "angry";
  return "idle";
}

function maskPathForSource(source) {
  const raw = String(source || "").replace(/\\/g, "/");
  const marker = "assets/v6/";
  const index = raw.indexOf(marker);
  if (index < 0) return null;
  const rest = raw.slice(index + marker.length);
  if (!rest || rest.startsWith("masks/")) return null;
  if (rest.startsWith("skins/")) return null;
  if (rest.startsWith("angry/")) return null;
  return `${raw.slice(0, index + marker.length)}masks/${rest}`;
}

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) || 0,
    Number.parseInt(value.slice(2, 4), 16) || 0,
    Number.parseInt(value.slice(4, 6), 16) || 0,
  ];
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, amount)));
}

function isIrisCore(r, g, b) {
  return g > 150 && b > 155 && g - r > 42 && b - r > 42;
}

function isEyeTeal(r, g, b) {
  if (isIrisCore(r, g, b)) return true;
  // Desaturated / rim turquoise only — never near-white fur.
  return g > 115 && b > 120 && g - r > 18 && b - r > 18 && Math.max(r, g, b) - Math.min(r, g, b) > 18;
}

function isNearWhiteHighlight(r, g, b) {
  return r > 215 && g > 220 && b > 220 && Math.abs(g - b) < 20 && Math.abs(r - g) < 25;
}

function isWarmPink(r, g, b) {
  return r > 120 && r - g > 22 && r - b > 12;
}

function isPaperish(r, g, b) {
  return r > 145 && g > 100 && b < g - 24;
}

function isWarmPropMaterial(r, g, b) {
  return isPaperish(r, g, b) || (r > b + 16 && g > b + 8 && r > 140);
}

function buildSemanticMask(rgba, width, height, family) {
  const count = width * height;
  const labels = new Uint8Array(count);
  const marked = new Uint8Array(count);
  const familyName = family || "idle";
  const hasPropFamily =
    familyName === "typing" ||
    familyName === "scroll" ||
    familyName === "tease";

  function assign(i, cls) {
    labels[i] = cls;
    marked[i] = 1;
  }

  for (let i = 0; i < count; i++) {
    if (rgba[i * 4 + 3] < 8) assign(i, MASK_TRANSPARENT);
  }

  // --- Eyes: seed strong iris, flood only through teal/turquoise ---
  const queue = [];
  for (let i = 0; i < count; i++) {
    if (marked[i]) continue;
    const o = i * 4;
    if (isIrisCore(rgba[o], rgba[o + 1], rgba[o + 2])) {
      assign(i, MASK_EYE);
      queue.push(i);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (marked[ni]) continue;
        const o = ni * 4;
        if (isEyeTeal(rgba[o], rgba[o + 1], rgba[o + 2])) {
          assign(ni, MASK_EYE);
          queue.push(ni);
        }
      }
    }
  }

  // Grow pupils/highlights by distance-limited BFS from current eye region (O(n)).
  // Dark pupil interiors may path through other dark pixels; highlights stay tight.
  const eyeDist = new Int16Array(count);
  eyeDist.fill(32767);
  const growQ = [];
  for (let i = 0; i < count; i++) {
    if (labels[i] === MASK_EYE && marked[i]) {
      eyeDist[i] = 0;
      growQ.push(i);
    }
  }
  const maxDist = 48;
  let gHead = 0;
  while (gHead < growQ.length) {
    const i = growQ[gHead++];
    const dist = eyeDist[i];
    if (dist >= maxDist) continue;
    const x = i % width;
    const y = (i / width) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        const nd = dist + 1;
        if (nd >= eyeDist[ni] || nd > maxDist) continue;
        const o = ni * 4;
        const r = rgba[o];
        const g = rgba[o + 1];
        const b = rgba[o + 2];
        const dark = Math.max(r, g, b) < 110;
        const hi = isNearWhiteHighlight(r, g, b);
        const teal = isEyeTeal(r, g, b);
        if (!marked[ni]) {
          // Highlights only in the first few steps; dark/teal can travel farther.
          if (hi && nd > 6) continue;
          if (!(dark || hi || teal)) continue;
          assign(ni, MASK_EYE);
        } else if (labels[ni] !== MASK_EYE) {
          continue;
        }
        eyeDist[ni] = nd;
        growQ.push(ni);
      }
    }
  }

  // --- Warm pink components: small/upper = inner ear; huge blush = coat later ---
  const visitedPink = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (marked[i] || visitedPink[i]) continue;
    const o = i * 4;
    if (!isWarmPink(rgba[o], rgba[o + 1], rgba[o + 2])) continue;
    const component = [];
    const q = [i];
    visitedPink[i] = 1;
    let sumY = 0;
    while (q.length) {
      const cur = q.pop();
      component.push(cur);
      sumY += (cur / width) | 0;
      const x = cur % width;
      const y = (cur / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (visitedPink[ni] || marked[ni]) continue;
          const no = ni * 4;
          if (!isWarmPink(rgba[no], rgba[no + 1], rgba[no + 2])) continue;
          visitedPink[ni] = 1;
          q.push(ni);
        }
      }
    }
    const avgY = sumY / component.length;
    const earLike =
      component.length < 28000 &&
      (avgY < height * 0.48 || component.length < 6000);
    if (earLike) {
      for (const idx of component) assign(idx, MASK_INNER_EAR);
    }
  }

  // --- Props: paper / warm scroll / lower prop materials ---
  if (hasPropFamily) {
    for (let i = 0; i < count; i++) {
      if (marked[i]) continue;
      const o = i * 4;
      const r = rgba[o];
      const g = rgba[o + 1];
      const b = rgba[o + 2];
      const y = (i / width) | 0;
      if (isPaperish(r, g, b)) {
        assign(i, MASK_PROP);
        continue;
      }
      if (isWarmPropMaterial(r, g, b) && y > height * 0.42) {
        assign(i, MASK_PROP);
      }
    }
  }

  // --- Linework / keyboard ---
  for (let i = 0; i < count; i++) {
    if (marked[i]) continue;
    const o = i * 4;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    if (Math.max(r, g, b) >= 82) continue;
    const y = (i / width) | 0;
    // Typing keyboard sits in the lower canvas as dark authored props.
    if (familyName === "typing" && y > height * 0.55) assign(i, MASK_PROP);
    else assign(i, MASK_LINE);
  }

  // --- Remaining opaque pixels are coat ---
  for (let i = 0; i < count; i++) {
    if (marked[i]) continue;
    if (rgba[i * 4 + 3] < 8) {
      assign(i, MASK_TRANSPARENT);
      continue;
    }
    assign(i, MASK_COAT);
  }

  return labels;
}

function maskLabelsToRgba(labels) {
  const out = new Uint8ClampedArray(labels.length * 4);
  for (let i = 0; i < labels.length; i++) {
    const o = i * 4;
    const cls = labels[i];
    out[o] = cls;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = cls === MASK_TRANSPARENT ? 0 : 255;
  }
  return out;
}

function readMaskClass(maskRgba, index) {
  const o = index * 4;
  if (!maskRgba || o + 3 >= maskRgba.length) return MASK_TRANSPARENT;
  if (maskRgba[o + 3] < 8) return MASK_TRANSPARENT;
  return maskRgba[o] | 0;
}

function recolorWithMask(sourceRgba, maskRgba, skin, defaultSkinId) {
  if (!sourceRgba || !skin || skin.id === defaultSkinId) return sourceRgba;
  if (!maskRgba) {
    throw new Error("semantic skin mask required for non-default coat");
  }
  const output = new Uint8ClampedArray(sourceRgba);
  const base = hexToRgb(skin.base);
  const shade = hexToRgb(skin.shade);
  const pixels = (output.length / 4) | 0;
  for (let i = 0; i < pixels; i++) {
    if (readMaskClass(maskRgba, i) !== MASK_COAT) continue;
    const o = i * 4;
    const r = output[o];
    const g = output[o + 1];
    const b = output[o + 2];
    const a = output[o + 3];
    if (a < 8) continue;
    const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
    const strength = Math.max(0, Math.min(1, (luminance - 0.3) / 0.7));
    output[o] = mix(shade[0], base[0], strength);
    output[o + 1] = mix(shade[1], base[1], strength);
    output[o + 2] = mix(shade[2], base[2], strength);
    // Alpha never rewritten.
  }
  return output;
}

function countClasses(labels) {
  const counts = {
    transparent: 0,
    coat: 0,
    eye: 0,
    innerEar: 0,
    line: 0,
    prop: 0,
  };
  for (let i = 0; i < labels.length; i++) {
    switch (labels[i]) {
      case MASK_TRANSPARENT:
        counts.transparent++;
        break;
      case MASK_COAT:
        counts.coat++;
        break;
      case MASK_EYE:
        counts.eye++;
        break;
      case MASK_INNER_EAR:
        counts.innerEar++;
        break;
      case MASK_LINE:
        counts.line++;
        break;
      case MASK_PROP:
        counts.prop++;
        break;
      default:
        break;
    }
  }
  return counts;
}

const maskApi = {
  MASK_TRANSPARENT,
  MASK_COAT,
  MASK_EYE,
  MASK_INNER_EAR,
  MASK_LINE,
  MASK_PROP,
  MASK_CLASS_NAMES,
  familyFromAssetPath,
  maskPathForSource,
  buildSemanticMask,
  maskLabelsToRgba,
  readMaskClass,
  recolorWithMask,
  countClasses,
  hexToRgb,
  mix,
};

if (typeof module !== "undefined" && module.exports) module.exports = maskApi;
if (typeof window !== "undefined") window.CatCodeV6SkinMask = maskApi;
