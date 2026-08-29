"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const desktopDir = path.resolve(__dirname, "..");
const packageJson = require("../package.json");
const unsignedConfig = require("../electron-builder.mac-unsigned.cjs");

test("production macOS packaging is hardened, notarized, and architecture-specific", () => {
  const { mac, dmg, artifactName } = packageJson.build;

  assert.equal(mac.minimumSystemVersion, "12.0");
  assert.equal(mac.hardenedRuntime, true);
  assert.equal(mac.notarize, true);
  assert.deepEqual(mac.target, ["dmg", "zip"]);
  assert.match(artifactName, /\$\{arch\}/);
  assert.equal(dmg.contents[1].path, "/Applications");
  assert.deepEqual(mac.binaries, [
    "Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg",
    "Contents/Resources/app.asar.unpacked/native/macos/cursor-warp",
  ]);
});

test("beta macOS packaging disables identity and notarization explicitly", () => {
  assert.equal(unsignedConfig.mac.identity, null);
  assert.equal(unsignedConfig.mac.hardenedRuntime, false);
  assert.equal(unsignedConfig.mac.notarize, false);
});

test("macOS entitlements are limited to Electron runtime requirements", () => {
  for (const fileName of [
    "entitlements.mac.plist",
    "entitlements.mac.inherit.plist",
  ]) {
    const source = fs.readFileSync(
      path.join(desktopDir, "build", fileName),
      "utf8",
    );
    assert.match(source, /com\.apple\.security\.cs\.allow-jit/);
    assert.match(
      source,
      /com\.apple\.security\.cs\.allow-unsigned-executable-memory/,
    );
    assert.doesNotMatch(source, /disable-library-validation/);
    assert.doesNotMatch(source, /com\.apple\.security\.app-sandbox/);
  }
});

test("uiohook includes native binaries for Intel and Apple Silicon", () => {
  for (const arch of ["x64", "arm64"]) {
    assert.equal(
      fs.existsSync(
        path.join(
          desktopDir,
          "node_modules",
          "uiohook-napi",
          "prebuilds",
          `darwin-${arch}`,
          "uiohook-napi.node",
        ),
      ),
      true,
      `missing uiohook prebuild for darwin-${arch}`,
    );
  }
});
