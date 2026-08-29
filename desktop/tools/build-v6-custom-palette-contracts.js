"use strict";

// Compiles the reviewed Black Canonical editor contracts into the compact
// browser payload used by the palette-only V6 editor. Landmark-local material
// roles are included for global palette paint; their locality only constrains
// future marking transfer, not a whole-coat colour change.
const fs = require("fs");
const path = require("path");

const desktopRoot = path.resolve(__dirname, "..");
const handoffRoot = path.join(
  desktopRoot,
  "art-handoff",
  "V6_SKIN_EDITOR_BLACK_CANONICAL_INPUT_256",
);
const outputsRoot = path.join(handoffRoot, "NEURAL_NET_OUTPUTS");
const coveragePath = path.join(
  outputsRoot,
  "16_black_editor_global_readiness",
  "stage-16-black-editor-global-coverage.v1.json",
);
const outputPath = path.join(
  desktopRoot,
  "renderer",
  "pet",
  "v6-custom-palette-contracts.js",
);
const idleUnderlapRunsPath = path.join(
  desktopRoot,
  "docs",
  "design",
  "v6-idle-neck-underlap-repair",
  "custom-palette-black-underlap-runs.v1.json",
);

const tokenForPaintRole = Object.freeze({
  "coat-base": "coatBase",
  "coat-shadow": "coatShadow",
  "outline-external-thin": "outline",
  "separator-crisp": "separator",
  "ear-inner-base": "earInner",
  "iris-base": "iris",
  "nose-base": "nose",
  "nose-accent": "nose",
  "mouth-line": "mouth",
  "mouth-left-line": "mouth",
  "mouth-centre-line": "mouth",
  "mouth-right-line": "mouth",
});

const runtimePathOverrides = Object.freeze({
  "idle/idle-master.png": "idle-master.png",
  "idle/idle-body-under-head-256.png": "head-layers/idle-body-under-head-256.png",
  "idle/idle-head-with-neck-underlap-256.png": "head-layers/idle-head-with-neck-underlap-256.png",
});

// The final hunt frame owns a runtime gaze surface. Its iris receives the
// live gaze treatment, so a palette-only skin must not paint over it.
const protectedTokensByRuntimePath = Object.freeze({
  "hunt-smooth/hunt-f8-gaze-ready.png": new Set(["iris"]),
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveContractPath(host) {
  const resolution = host && host.resolution;
  if (!resolution) return null;
  if (host.hostType === "physical-mirror-derived") return resolution.ownerAtlasContract || null;
  return resolution.stageContract || resolution.ownerStageContract || null;
}

function contractPathFromCoverage(relativePath) {
  const prefix = "NEURAL_NET_OUTPUTS/";
  return relativePath && relativePath.startsWith(prefix)
    ? relativePath.slice(prefix.length)
    : relativePath;
}

function runtimePathFor(sourcePath) {
  return runtimePathOverrides[sourcePath] || sourcePath;
}

function mirrorRuns(runs) {
  return runs.map(([start, end, y]) => [255 - end, 255 - start, y]);
}

function entryRunsByToken(contract, mirror, runtimePath, idleUnderlapRuns) {
  const tokens = {};
  const protectedTokens = protectedTokensByRuntimePath[runtimePath] || new Set();
  for (const entry of contract.pixelOwnership || []) {
    const token = tokenForPaintRole[entry.paintRole];
    if (!token || protectedTokens.has(token) || !Array.isArray(entry.runs)) continue;
    // A protection owner can never be broadened by this compiler. Landmark
    // locality is safe here: the editor is applying a global material colour,
    // not copying a marking between poses.
    if (
      entry.paintProtectionOwner &&
      entry.paintProtectionOwner !== "global-palette-transferable" &&
      entry.paintProtectionOwner !== "landmark-local-transferable" &&
      entry.paintProtectionOwner !== "cat-editable-candidate"
    ) {
      continue;
    }
    const runs = mirror ? mirrorRuns(entry.runs) : entry.runs;
    if (!tokens[token]) tokens[token] = [];
    tokens[token].push(...runs);
  }
  if (runtimePath === "head-layers/idle-body-under-head-256.png" && idleUnderlapRuns) {
    for (const [token, runs] of Object.entries(idleUnderlapRuns)) {
      if (!Object.values(tokenForPaintRole).includes(token) || protectedTokens.has(token) || !Array.isArray(runs)) continue;
      if (!tokens[token]) tokens[token] = [];
      tokens[token].push(...runs);
    }
  }
  return tokens;
}

function makeEntry({ relativePath, contractSourcePath, contract, mirror, idleUnderlapRuns }) {
  const source = contract && contract.source ? contract.source : {};
  return {
    contractSourcePath,
    sourceSha256: source.sha256 || source.inventorySha256 || null,
    runsByToken: entryRunsByToken(contract, mirror, relativePath, idleUnderlapRuns),
  };
}

function main() {
  const coverage = readJson(coveragePath);
  const underlap = readJson(idleUnderlapRunsPath);
  const idleUnderlapRuns = underlap && underlap.runsByToken;
  if (!idleUnderlapRuns || typeof idleUnderlapRuns !== "object") {
    throw new Error("Custom palette contract build blocked: missing idle neck underlap runs");
  }
  const hosts = {};
  const diagnostics = [];

  for (const host of coverage.hosts || []) {
    const contractRelative = resolveContractPath(host);
    if (!contractRelative) {
      diagnostics.push({ id: host.logicalId, reason: "missing-contract" });
      continue;
    }
    const contractPath = path.join(outputsRoot, contractPathFromCoverage(contractRelative));
    if (!fs.existsSync(contractPath)) {
      diagnostics.push({ id: host.logicalId, reason: "contract-not-found", contractRelative });
      continue;
    }
    const contract = readJson(contractPath);
    const isMirror = host.hostType === "physical-mirror-derived";
    const targetPath = isMirror
      ? host.physicalSourcePath
      : host.hostType === "logical-alias"
        ? host.resolution.aliasTargetPath
        : host.physicalSourcePath;
    const basePath = isMirror
      ? host.resolution.mirrorSourcePath
      : host.hostType === "logical-alias"
        ? host.resolution.ownerSourcePath
        : host.physicalSourcePath;
    if (!targetPath || !basePath) {
      diagnostics.push({ id: host.logicalId, reason: "missing-runtime-path" });
      continue;
    }
    hosts[runtimePathFor(targetPath)] = makeEntry({
      relativePath: runtimePathFor(targetPath),
      contractSourcePath: runtimePathFor(basePath),
      contract,
      mirror: isMirror,
      idleUnderlapRuns,
    });
  }

  if (diagnostics.length) {
    throw new Error(`Custom palette contract build blocked: ${JSON.stringify(diagnostics)}`);
  }

  const payload = {
    schema: "catcode.v6.custom-palette-contracts.v1",
    authority: "Black Canonical Stage 16 readiness package",
    width: 256,
    height: 256,
    hostCount: Object.keys(hosts).length,
    hosts,
  };
  const source = `"use strict";\n\n// Generated by tools/build-v6-custom-palette-contracts.js. Do not edit by hand.\nconst CatCodeV6CustomPaletteContracts = Object.freeze(${JSON.stringify(payload)});\nif (typeof module !== "undefined" && module.exports) module.exports = CatCodeV6CustomPaletteContracts;\nif (typeof window !== "undefined") window.CatCodeV6CustomPaletteContracts = CatCodeV6CustomPaletteContracts;\n`;
  fs.writeFileSync(outputPath, source);
  process.stdout.write(`${outputPath}\n${payload.hostCount} hosts\n`);
}

main();
