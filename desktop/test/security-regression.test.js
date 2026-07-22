"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const desktopDir = path.resolve(__dirname, "..");
const mainSource = fs.readFileSync(path.join(desktopDir, "main.js"), "utf8");
const overlayPreload = fs.readFileSync(
  path.join(desktopDir, "share-capture-preload.js"),
  "utf8",
);

test("does not start the retired OAuth callback or protocol integration", () => {
  assert.doesNotMatch(mainSource, /\n\s*XE\(\),/);
  assert.doesNotMatch(mainSource, /\n\s*QE\(\),/);
  assert.doesNotMatch(mainSource, /\n\s*YE\(\),/);
  assert.doesNotMatch(mainSource, /\n\s*ZE\(\),/);
  assert.doesNotMatch(mainSource, /gm && iT\(\);/);
});

test("share capture overlays run without renderer Node access", () => {
  assert.equal((mainSource.match(/nodeIntegration: !0/g) || []).length, 0);
  assert.equal((mainSource.match(/sandbox: !1/g) || []).length, 0);
  assert.match(mainSource, /share-capture-preload\.js/);
  assert.match(overlayPreload, /contextBridge\.exposeInMainWorld/);
  assert.match(overlayPreload, /share-capture-cancel/);
});
