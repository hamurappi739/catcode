"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const optional = process.argv.includes("--optional");
const projectDir = path.resolve(__dirname, "..");
const sourcePath = path.join(
  projectDir,
  "native",
  "windows",
  "fullscreen-detector.cs",
);
const outputPath = path.join(
  projectDir,
  "native",
  "windows",
  "fullscreen-detector.exe",
);

function fail(message) {
  if (optional) {
    console.warn(`[CatCode] ${message}`);
    process.exit(0);
  }

  console.error(`[CatCode] ${message}`);
  process.exit(1);
}

if (process.platform !== "win32") {
  process.exit(0);
}

if (!fs.existsSync(sourcePath)) {
  fail(`Windows fullscreen helper source is missing: ${sourcePath}`);
}

const windowsDir = process.env.WINDIR || "C:\\Windows";
const compilerCandidates = [
  path.join(
    windowsDir,
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
  ),
  path.join(
    windowsDir,
    "Microsoft.NET",
    "Framework",
    "v4.0.30319",
    "csc.exe",
  ),
];
const compilerPath = compilerCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

if (!compilerPath) {
  fail("The Windows C# compiler required for the fullscreen helper was not found.");
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const result = spawnSync(
  compilerPath,
  [
    "/nologo",
    "/optimize+",
    "/target:exe",
    `/out:${outputPath}`,
    sourcePath,
  ],
  {
    cwd: projectDir,
    encoding: "utf8",
    windowsHide: true,
  },
);

if (result.status !== 0 || !fs.existsSync(outputPath)) {
  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  fail(
    `Failed to compile the Windows fullscreen helper${details ? `:\n${details}` : "."}`,
  );
}

console.log(`[CatCode] Windows fullscreen helper ready: ${outputPath}`);
