"use strict";

const fs = require("node:fs");
const { spawn } = require("node:child_process");

/** How long after the last audible peak the session stays "active". */
const AUDIBLE_HOLD_MS = 350;
/** Peak level treated as audible system audio (not silence). */
const AUDIBLE_PEAK = 0.012;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createSystemAudioActivityController({
  platform = process.platform,
  helperPath,
  fileExists = fs.existsSync,
  spawnProcess = spawn,
  onState = () => {},
  logWarn = () => {},
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  restartDelayMs = 3000,
} = {}) {
  let started = false;
  let helper = null;
  let outputBuffer = "";
  let restartTimer = null;
  let silenceTimer = null;
  let smoothedPeak = 0;
  let lastAudibleAt = Number.NEGATIVE_INFINITY;
  let lastBeatAt = Number.NEGATIVE_INFINITY;
  let lastEmitAt = Number.NEGATIVE_INFINITY;
  let lastActive = false;
  let lastState = { active: false, energy: 0, beat: false };

  function isAvailable() {
    return platform === "win32" && !!helperPath && fileExists(helperPath);
  }

  function emit(state) {
    lastState = {
      active: !!state.active,
      energy: clamp(Number(state.energy) || 0, 0, 1),
      beat: !!state.beat,
    };
    lastActive = lastState.active;
    lastEmitAt = now();
    onState({ ...lastState });
  }

  function clearSilenceWatchdog() {
    if (!silenceTimer) return;
    clearTimer(silenceTimer);
    silenceTimer = null;
  }

  /**
   * If peak samples stop while active (helper hang / pipe stall), force idle.
   * Continuous zero samples also clear via processPeak; this covers sample loss.
   */
  function armSilenceWatchdog() {
    clearSilenceWatchdog();
    if (!started) return;
    silenceTimer = setTimer(() => {
      silenceTimer = null;
      if (!started) return;
      const time = now();
      if (time - lastAudibleAt <= AUDIBLE_HOLD_MS) {
        armSilenceWatchdog();
        return;
      }
      if (!lastActive && smoothedPeak === 0) return;
      smoothedPeak = 0;
      if (lastActive) emit({ active: false, energy: 0, beat: false });
    }, AUDIBLE_HOLD_MS + 40);
  }

  function processPeak(value) {
    const peak = clamp(Number(value) || 0, 0, 1);
    const time = now();
    const previousSmooth = smoothedPeak;
    smoothedPeak = smoothedPeak * 0.76 + peak * 0.24;
    if (peak >= AUDIBLE_PEAK) {
      lastAudibleAt = time;
      armSilenceWatchdog();
    }
    const active = time - lastAudibleAt <= AUDIBLE_HOLD_MS;
    const energy = active ? clamp((smoothedPeak - 0.008) / 0.28, 0.08, 1) : 0;
    const beat =
      active &&
      peak >= 0.045 &&
      peak >= Math.max(0.05, previousSmooth * 1.34) &&
      time - lastBeatAt >= 220;
    if (beat) lastBeatAt = time;

    if (beat || active !== lastActive || time - lastEmitAt >= 160) {
      emit({ active, energy, beat });
    }
  }

  function consumeOutput(chunk) {
    outputBuffer += String(chunk || "");
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() || "";
    for (const line of lines) {
      const peak = Number.parseFloat(line.trim());
      if (Number.isFinite(peak)) processPeak(peak);
    }
  }

  function clearRestart() {
    if (!restartTimer) return;
    clearTimer(restartTimer);
    restartTimer = null;
  }

  function scheduleRestart() {
    clearRestart();
    if (!started || !isAvailable()) return;
    restartTimer = setTimer(() => {
      restartTimer = null;
      launch();
    }, restartDelayMs);
  }

  function clearProcess(process) {
    if (helper !== process) return;
    helper = null;
    outputBuffer = "";
    clearSilenceWatchdog();
    if (lastActive) emit({ active: false, energy: 0, beat: false });
    scheduleRestart();
  }

  function launch() {
    if (!started || helper || !isAvailable()) return false;
    try {
      const process = spawnProcess(helperPath, [], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      helper = process;
      process.stdout?.on("data", consumeOutput);
      process.once("error", (error) => {
        logWarn(
          "[CatCode] system audio meter failed:",
          error && error.message ? error.message : error,
        );
        clearProcess(process);
      });
      process.once("exit", () => clearProcess(process));
      return true;
    } catch (error) {
      logWarn(
        "[CatCode] system audio meter could not start:",
        error && error.message ? error.message : error,
      );
      scheduleRestart();
      return false;
    }
  }

  function start() {
    if (started) return isAvailable();
    started = true;
    return launch();
  }

  function stop() {
    started = false;
    clearRestart();
    clearSilenceWatchdog();
    const process = helper;
    helper = null;
    outputBuffer = "";
    smoothedPeak = 0;
    lastAudibleAt = Number.NEGATIVE_INFINITY;
    lastBeatAt = Number.NEGATIVE_INFINITY;
    if (process) {
      try {
        process.kill();
      } catch {}
    }
    emit({ active: false, energy: 0, beat: false });
  }

  return {
    consumeOutput,
    getState: () => ({ ...lastState }),
    isAvailable,
    processPeak,
    start,
    stop,
  };
}

module.exports = {
  AUDIBLE_HOLD_MS,
  AUDIBLE_PEAK,
  createSystemAudioActivityController,
};
