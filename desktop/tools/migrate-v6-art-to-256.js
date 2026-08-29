"use strict";

// Installs the owner-approved 256px V6 masters into the runtime asset tree.
// This is intentionally a Node-only tool: it never launches Electron.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

if (process.versions.electron) throw new Error("Run this migration with Node, not Electron.");

const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..");
const handoffRoot = path.join(desktopDir, "art-handoff", "V6_CURRENT_POSES_FOR_PISKEL");
const assetsRoot = path.join(desktopDir, "renderer", "pet", "assets", "v6");
const evidenceRoot = path.join(desktopDir, "docs", "design", "v6-art-256-migration");
const { PNG } = require(path.join(
  desktopDir,
  "docs",
  "design",
  "v6-skin-rendering-forensic-audit",
  "vendor",
  "node_modules",
  "pngjs",
));

const DIRECT_FAMILIES = Object.freeze([
  ["02_sleep", "sleep", ["sleep-f0-closed.png", "sleep-f1-transition.png", "sleep-f2-peek.png"]],
  ["03_purr_gentle", "purr-smooth", [
    "purr-f0-rest.png", "purr-f1-gentle-left.png", "purr-f2-gentle-rise.png",
    "purr-f3-gentle-peak.png", "purr-f4-centered.png", "purr-f5-gentle-right.png",
    "purr-f6-gentle-return.png", "purr-f7-loop-settle.png", "purr-f8-rest.png",
  ]],
  ["04_typing", "typing", [
    "typing-f0-ready.png", "typing-f1-left.png", "typing-f2-right.png",
    "typing-f3-fast.png", "typing-f4-tense.png",
  ]],
  ["05_scroll", "scroll", [
    "scroll-f0-ready.png", "scroll-f1-reach.png", "scroll-f2-unroll.png",
    "scroll-f3-pull.png", "scroll-f4-recover.png",
  ]],
  ["06_hunt", "hunt-smooth", [
    "hunt-f0-alert.png", "hunt-f1-shoulder-drop.png", "hunt-f2-forelegs-lower.png",
    "hunt-f3-half-crouch.png", "hunt-f4-low-crouch.png", "hunt-f5-deep-stalk.png",
    "hunt-f6-near-hold.png", "hunt-f7-watch-hold.png", "hunt-f8-watch-hold.png",
  ]],
  ["08_cursor_theft", "tease", [
    "tease-f0-stalk.png", "tease-f1-reach.png", "tease-f2-catch.png",
    "tease-f3-hold.png", "tease-f4-release.png",
  ]],
  ["09_celebrate", "celebrate", [
    "celebrate-f0-ready.png", "celebrate-f1-jump.png", "celebrate-f2-return.png",
  ]],
  ["10_angry", "angry", ["angry-idle.png"]],
  ["12_edge_peek", "edge-peek", ["peek-from-left-looking-right.png", "peek-from-right-looking-left.png"]],
]);

const DANCE_FAMILIES = Object.freeze([
  ["drill", "drill", [
    "drill-f00-ready.png", "drill-f01-left-bounce.png", "drill-f02-left-punch.png",
    "drill-f03-center-bounce.png", "drill-f04-right-bounce.png", "drill-f05-right-punch.png",
    "drill-f06-bounce-up.png", "drill-f07-shoulder-pop.png", "drill-f08-settle.png",
    "drill-f09-loop-return.png",
  ]],
  ["hip_hop", "hip-hop", [
    "hiphop-f00-ready.png", "hiphop-f01-left-forward.png", "hiphop-f02-left-knee.png",
    "hiphop-f03-center-downbeat.png", "hiphop-f04-right-forward.png", "hiphop-f05-right-knee.png",
    "hiphop-f06-center-rise.png", "hiphop-f07-left-recover.png", "hiphop-f08-settle.png",
    "hiphop-f09-loop-return.png",
  ]],
  ["paw_groove", "paw-groove", ["paw-groove-f0-ready.png", "paw-groove-f1-left-lean.png", "paw-groove-f2-right-lean.png"]],
]);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function assert256(filePath) {
  const image = readPng(filePath);
  if (image.width !== 256 || image.height !== 256) {
    throw new Error(`Expected 256 x 256: ${filePath} is ${image.width} x ${image.height}.`);
  }
  return image;
}

function sourceToTargetMappings() {
  const mappings = [{
    source: path.join(handoffRoot, "01_idle", "256", "idle-master (2).png"),
    target: path.join(assetsRoot, "idle-master.png"),
  }];
  for (const [handoffFolder, targetFolder, files] of DIRECT_FAMILIES) {
    for (const fileName of files) mappings.push({
      source: path.join(handoffRoot, handoffFolder, "256", fileName),
      target: path.join(assetsRoot, targetFolder, fileName),
    });
  }
  for (const side of ["left", "right"]) {
    for (let index = 0; index < 5; index += 1) {
      const fileName = `walk-${side}-f${index}.png`;
      mappings.push({
        source: path.join(handoffRoot, "07_walk", side, "256", fileName),
        target: path.join(assetsRoot, "walk", fileName),
      });
    }
  }
  for (const [handoffFolder, targetFolder, files] of DANCE_FAMILIES) {
    for (const fileName of files) mappings.push({
      source: path.join(handoffRoot, "11_dance", handoffFolder, "256", fileName),
      target: path.join(assetsRoot, "dance", targetFolder, fileName),
    });
  }
  return mappings;
}

function alphaAt(image, x, y) {
  return image.data[(y * image.width + x) * 4 + 3] / 255;
}

function maxAlphaForLogicalPixel(image, x, y) {
  let max = 0;
  for (let dy = 0; dy < 4; dy += 1) for (let dx = 0; dx < 4; dx += 1) {
    max = Math.max(max, alphaAt(image, x * 4 + dx, y * 4 + dy));
  }
  return max;
}

function rgbaAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]];
}

function writeRgba(image, x, y, rgba) {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = rgba[0];
  image.data[offset + 1] = rgba[1];
  image.data[offset + 2] = rgba[2];
  image.data[offset + 3] = rgba[3];
}

function deriveIdleHeadLayers() {
  const master256 = assert256(path.join(handoffRoot, "01_idle", "256", "idle-master (2).png"));
  const body1024 = readPng(path.join(assetsRoot, "head-layers", "idle-body-under-head-1024.png"));
  const head1024 = readPng(path.join(assetsRoot, "head-layers", "idle-head-with-neck-underlap-1024.png"));
  if (body1024.width !== 1024 || body1024.height !== 1024 || head1024.width !== 1024 || head1024.height !== 1024) {
    throw new Error("The accepted 1024 idle technical layers are required to derive their 256 equivalents.");
  }
  const body256 = new PNG({ width: 256, height: 256 });
  const head256 = new PNG({ width: 256, height: 256 });
  let uncovered = 0;
  let maxAlphaError = 0;
  for (let y = 0; y < 256; y += 1) for (let x = 0; x < 256; x += 1) {
    const target = rgbaAt(master256, x, y);
    const targetAlpha = target[3] / 255;
    const bodyAlpha = maxAlphaForLogicalPixel(body1024, x, y);
    const headAlpha = maxAlphaForLogicalPixel(head1024, x, y);
    const combinedAlpha = headAlpha + bodyAlpha * (1 - headAlpha);
    if (!targetAlpha) continue;
    if (!combinedAlpha) {
      uncovered += 1;
      continue;
    }
    // Preserve the authored split/underlap ratio, then rebuild both layers
    // from the 256 master so their resting composite is the exact new art.
    const nextHeadAlpha = Math.min(targetAlpha, (headAlpha / combinedAlpha) * targetAlpha);
    const nextBodyAlpha = nextHeadAlpha >= 1 ? 0 : Math.max(0, Math.min(1, (targetAlpha - nextHeadAlpha) / (1 - nextHeadAlpha)));
    writeRgba(body256, x, y, [target[0], target[1], target[2], Math.round(nextBodyAlpha * 255)]);
    writeRgba(head256, x, y, [target[0], target[1], target[2], Math.round(nextHeadAlpha * 255)]);
    const rebuiltAlpha = (Math.round(nextHeadAlpha * 255) / 255) + (Math.round(nextBodyAlpha * 255) / 255) * (1 - Math.round(nextHeadAlpha * 255) / 255);
    maxAlphaError = Math.max(maxAlphaError, Math.abs(rebuiltAlpha - targetAlpha));
  }
  if (uncovered) throw new Error(`The current idle technical layers do not cover ${uncovered} opaque 256 master pixels.`);
  if (maxAlphaError > (2 / 255)) throw new Error(`256 idle layer composite differs by ${maxAlphaError} alpha.`);
  return { body256, head256, maxAlphaError };
}

function deriveHuntGazeReady() {
  const master1024 = readPng(path.join(handoffRoot, "06_hunt", "hunt-f8-watch-hold.png"));
  const ready1024 = readPng(path.join(
    repoRoot,
    "art-handoff",
    "owner-masters",
    "v6",
    "hunt-final-gaze-ready-owner-edit-1024",
    "hunt-f8-gaze-ready.png",
  ));
  const master256 = assert256(path.join(handoffRoot, "06_hunt", "256", "hunt-f8-watch-hold.png"));
  if (master1024.width !== 1024 || ready1024.width !== 1024 || master1024.height !== 1024 || ready1024.height !== 1024) {
    throw new Error("The accepted 1024 hunt hold and gaze-ready derivative are required to derive their 256 equivalent.");
  }
  const output = PNG.sync.read(PNG.sync.write(master256));
  let changedPixels = 0;
  for (let y = 0; y < 256; y += 1) for (let x = 0; x < 256; x += 1) {
    let changedSamples = 0;
    for (let dy = 0; dy < 4; dy += 1) for (let dx = 0; dx < 4; dx += 1) {
      const a = rgbaAt(master1024, x * 4 + dx, y * 4 + dy);
      const b = rgbaAt(ready1024, x * 4 + dx, y * 4 + dy);
      if (a.some((value, index) => value !== b[index])) changedSamples += 1;
    }
    if (!changedSamples) continue;
    const readySample = rgbaAt(ready1024, x * 4 + 2, y * 4 + 2);
    writeRgba(output, x, y, readySample);
    changedPixels += 1;
  }
  if (!changedPixels) throw new Error("The hunt gaze-ready derivative did not identify any pupil-clear pixels.");
  return { output, changedPixels };
}

function updateManifestDimensions() {
  const handoffPath = "art-handoff/V6_CURRENT_POSES_FOR_PISKEL";
  const sourceDirectories = {
    "scroll/manifest.json": `${handoffPath}/05_scroll/256`,
    "hunt-smooth/manifest.json": `${handoffPath}/06_hunt/256`,
    "walk/manifest.json": `${handoffPath}/07_walk/{left,right}/256`,
    "tease/manifest.json": `${handoffPath}/08_cursor_theft/256`,
  };
  for (const relative of ["scroll/manifest.json", "hunt-smooth/manifest.json", "walk/manifest.json", "tease/manifest.json"]) {
    const filePath = path.join(assetsRoot, relative);
    if (!fs.existsSync(filePath)) continue;
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (json.dimensions) json.dimensions = { width: 256, height: 256 };
    if (json.masterCanvas) json.masterCanvas = { width: 256, height: 256 };
    if (json.masterSize) json.masterSize = "256x256";
    if (json.sourceDrop) json.sourceDrop = sourceDirectories[relative];
    if (json.source) json.source = sourceDirectories[relative];
    for (const frame of json.frames || []) {
      const fileName = frame.fileName || frame.file;
      if (!fileName) continue;
      const runtimePath = path.join(path.dirname(filePath), fileName);
      if (!fs.existsSync(runtimePath)) continue;
      if (Object.hasOwn(frame, "ownerSource")) frame.ownerSource = fileName;
      if (Object.hasOwn(frame, "sha256")) frame.sha256 = sha256(runtimePath);
    }
    fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
  }
}

function run({ apply = false } = {}) {
  const mappings = sourceToTargetMappings();
  const manifest = {
    schema: "catcode.v6.art-migration.v1",
    status: apply ? "installed" : "preflight-only",
    sourceRoot: handoffRoot,
    targetRoot: assetsRoot,
    pixelCanvas: { width: 256, height: 256 },
    entries: mappings.map(({ source, target }) => {
      assert256(source);
      return {
        source: path.relative(desktopDir, source).replaceAll("\\\\", "/"),
        target: path.relative(desktopDir, target).replaceAll("\\\\", "/"),
        sourceSha256: sha256(source),
      };
    }),
  };
  if (!apply) return manifest;
  // Build every derived asset before touching the live copies so a missing
  // authoring reference can never leave a partial migration behind.
  const idleLayers = deriveIdleHeadLayers();
  const huntGaze = deriveHuntGazeReady();
  for (const { source, target } of mappings) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const headLayerRoot = path.join(assetsRoot, "head-layers");
  fs.writeFileSync(path.join(headLayerRoot, "idle-body-under-head-256.png"), PNG.sync.write(idleLayers.body256));
  fs.writeFileSync(path.join(headLayerRoot, "idle-head-with-neck-underlap-256.png"), PNG.sync.write(idleLayers.head256));
  fs.writeFileSync(path.join(assetsRoot, "hunt-smooth", "hunt-f8-gaze-ready.png"), PNG.sync.write(huntGaze.output));
  updateManifestDimensions();
  manifest.technicalDerivatives = {
    idleHeadLayers: { width: 256, height: 256, maxAlphaError: idleLayers.maxAlphaError },
    huntGazeReady: { width: 256, height: 256, pupilClearPixels: huntGaze.changedPixels },
  };
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, "migration-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (require.main === module) {
  const manifest = run({ apply: process.argv.includes("--apply") });
  console.log(JSON.stringify({ status: manifest.status, frameCount: manifest.entries.length, technicalDerivatives: manifest.technicalDerivatives || null }, null, 2));
}

module.exports = { run, sourceToTargetMappings };
