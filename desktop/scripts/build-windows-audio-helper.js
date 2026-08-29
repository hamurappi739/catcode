"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const optional = process.argv.includes("--optional");
const projectDir = path.resolve(__dirname, "..");
const sourcePath = path.join(projectDir, "native", "windows", "audio-meter.cs");
const outputPath = path.join(projectDir, "native", "windows", "audio-meter.exe");

function fail(message) {
  const logger = optional ? console.warn : console.error;
  logger(`[CatCode] ${message}`);
  process.exit(optional ? 0 : 1);
}

if (process.platform !== "win32") process.exit(0);
if (!fs.existsSync(sourcePath))
  fail(`Windows audio meter source is missing: ${sourcePath}`);

const windowsDir = process.env.WINDIR || "C:\\Windows";
const compilerPath = [
  path.join(windowsDir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
  path.join(windowsDir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
].find((candidate) => fs.existsSync(candidate));
if (!compilerPath)
  fail("The Windows C# compiler required for the audio meter was not found.");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const result = spawnSync(
  compilerPath,
  ["/nologo", "/optimize+", "/target:exe", `/out:${outputPath}`, sourcePath],
  { cwd: projectDir, encoding: "utf8", windowsHide: true },
);
if (result.status !== 0 || !fs.existsSync(outputPath)) {
  const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  fail(`Failed to compile the Windows audio meter${details ? `:\n${details}` : "."}`);
}
console.log(`[CatCode] Windows audio meter ready: ${outputPath}`);
