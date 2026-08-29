"use strict";

const fs = require("node:fs");
const { spawn } = require("node:child_process");

function createCursorWarpController({
  helperPath,
  fileExists = fs.existsSync,
  spawnProcess = spawn,
  logWarn = console.warn,
} = {}) {
  let helper = null;

  function isAvailable() {
    return !!helperPath && fileExists(helperPath);
  }

  function stop() {
    if (!helper) return;
    const process = helper;
    helper = null;
    try {
      process.stdin.end();
    } catch {}
    try {
      process.kill();
    } catch {}
  }

  function ensureHelper() {
    if (helper && !helper.killed && helper.stdin && !helper.stdin.destroyed) {
      return helper;
    }
    if (!isAvailable()) return null;

    try {
      const process = spawnProcess(helperPath, [], {
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
      helper = process;
      const clear = () => {
        if (helper === process) helper = null;
      };
      process.once("error", (error) => {
        clear();
        logWarn(
          "[CatCode] cursor helper failed:",
          error && error.message ? error.message : error,
        );
      });
      process.once("exit", clear);
      return process;
    } catch (error) {
      logWarn(
        "[CatCode] cursor helper could not start:",
        error && error.message ? error.message : error,
      );
      return null;
    }
  }

  function moveTo(x, y) {
    const process = ensureHelper();
    if (!process || !process.stdin || process.stdin.destroyed) return false;
    const safeX = Math.round(Number(x));
    const safeY = Math.round(Number(y));
    if (!Number.isFinite(safeX) || !Number.isFinite(safeY)) return false;
    try {
      process.stdin.write(`${safeX} ${safeY}\n`);
      return true;
    } catch (error) {
      stop();
      logWarn(
        "[CatCode] cursor helper write failed:",
        error && error.message ? error.message : error,
      );
      return false;
    }
  }

  return { isAvailable, moveTo, stop };
}

module.exports = { createCursorWarpController };
