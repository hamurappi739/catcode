"use strict";

const fs = require("node:fs");
const { spawn } = require("node:child_process");

function createFullscreenVisibilityController({
  platform = process.platform,
  helperPath,
  getPetWindow,
  keepWindowOnTop = () => {},
  logInfo = () => {},
  logWarn = () => {},
  spawnProcess = spawn,
  helperExists = fs.existsSync,
  restartDelayMs = 3000,
}) {
  let enabled = true;
  let fullscreenActive = false;
  let hiddenPetWindow = null;
  let helperProcess = null;
  let helperOutputBuffer = "";
  let restartTimer = null;
  let stopping = false;

  function currentPetWindow() {
    const window = getPetWindow();
    return window && !window.isDestroyed() ? window : null;
  }

  function restorePetWindow() {
    const window = hiddenPetWindow;
    hiddenPetWindow = null;
    if (!window || window.isDestroyed()) {
      return;
    }

    try {
      window.showInactive();
      keepWindowOnTop(window);
    } catch (error) {
      logWarn(
        "[CatCode] failed to restore the pet after fullscreen mode:",
        error && error.message ? error.message : error,
      );
    }
  }

  function syncPetWindowVisibility() {
    if (!enabled || !fullscreenActive) {
      restorePetWindow();
      return;
    }

    const window = currentPetWindow();
    if (!window || hiddenPetWindow === window) {
      return;
    }

    if (hiddenPetWindow && hiddenPetWindow !== window) {
      hiddenPetWindow = null;
    }

    try {
      if (window.isVisible()) {
        hiddenPetWindow = window;
        window.hide();
      }
    } catch (error) {
      logWarn(
        "[CatCode] failed to hide the pet for fullscreen mode:",
        error && error.message ? error.message : error,
      );
    }
  }

  function setFullscreenActive(active) {
    fullscreenActive = !!active;
    syncPetWindowVisibility();
    return fullscreenActive;
  }

  function consumeHelperOutput(chunk) {
    helperOutputBuffer += String(chunk || "");
    const lines = helperOutputBuffer.split(/\r?\n/);
    helperOutputBuffer = lines.pop() || "";

    for (const line of lines) {
      const state = line.trim();
      if (state === "1") {
        setFullscreenActive(true);
      } else if (state === "0") {
        setFullscreenActive(false);
      }
    }
  }

  function clearRestartTimer() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function scheduleRestart() {
    clearRestartTimer();
    if (stopping || !enabled || platform !== "win32") {
      return;
    }

    restartTimer = setTimeout(() => {
      restartTimer = null;
      start();
    }, restartDelayMs);
  }

  function handleHelperExit(code, signal) {
    helperProcess = null;
    helperOutputBuffer = "";
    setFullscreenActive(false);
    if (!stopping && enabled) {
      logWarn("[CatCode] fullscreen helper stopped; restarting", {
        code,
        signal,
      });
      scheduleRestart();
    }
  }

  function start() {
    if (
      platform !== "win32" ||
      !enabled ||
      helperProcess ||
      restartTimer ||
      stopping
    ) {
      return false;
    }

    if (!helperPath || !helperExists(helperPath)) {
      logWarn("[CatCode] Windows fullscreen helper is unavailable", {
        helperPath,
      });
      return false;
    }

    try {
      const child = spawnProcess(
        helperPath,
        ["--parent-pid", String(process.pid)],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      helperProcess = child;
      child.stdout.on("data", consumeHelperOutput);
      child.once("error", (error) => {
        logWarn(
          "[CatCode] Windows fullscreen helper failed:",
          error && error.message ? error.message : error,
        );
      });
      child.once("close", handleHelperExit);
      logInfo("[CatCode] Windows fullscreen visibility monitor started");
      return true;
    } catch (error) {
      logWarn(
        "[CatCode] failed to start the Windows fullscreen helper:",
        error && error.message ? error.message : error,
      );
      scheduleRestart();
      return false;
    }
  }

  function stop() {
    stopping = true;
    clearRestartTimer();
    const child = helperProcess;
    helperProcess = null;
    helperOutputBuffer = "";
    setFullscreenActive(false);

    if (child) {
      try {
        child.removeAllListeners("close");
        child.kill();
      } catch {}
    }

    stopping = false;
  }

  function setEnabled(value) {
    enabled = !!value;
    if (!enabled) {
      stop();
    } else if (platform === "win32") {
      start();
      syncPetWindowVisibility();
    }
    return enabled;
  }

  return {
    isEnabled: () => enabled,
    isFullscreenActive: () => fullscreenActive,
    setEnabled,
    setFullscreenActive,
    start,
    stop,
    syncPetWindowVisibility,
  };
}

module.exports = { createFullscreenVisibilityController };
