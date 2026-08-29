"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectDir = path.resolve(__dirname, "..");
const sourcePath = path.join(projectDir, "native", "macos", "cursor-warp.m");
const outputPath = path.join(projectDir, "native", "macos", "cursor-warp");

if (process.platform !== "darwin") process.exit(0);
if (!fs.existsSync(sourcePath)) {
  console.error(`[CatCode] macOS cursor helper source is missing: ${sourcePath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const result = spawnSync(
  "/usr/bin/xcrun",
  ["clang", "-O2", "-framework", "Foundation", "-framework", "ApplicationServices", sourcePath, "-o", outputPath],
  { cwd: projectDir, encoding: "utf8" },
);
if (result.status !== 0 || !fs.existsSync(outputPath)) {
  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  console.error(`[CatCode] Failed to compile the macOS cursor helper${details ? `:\n${details}` : "."}`);
  process.exit(1);
}
fs.chmodSync(outputPath, 0o755);
console.log(`[CatCode] macOS cursor helper ready: ${outputPath}`);
