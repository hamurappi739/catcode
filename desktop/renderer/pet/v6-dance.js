"use strict";

// V6 rotates the three owner-approved dance families. This controller owns
// only pose timing; audio detection remains in music-dance.js.

// `v6-walk.js` is loaded before this classic script and owns `FRAME_KEYS`.
// Keep dance constants uniquely named so a duplicate top-level lexical binding
// can never prevent the entire controller from executing.
const DANCE_VARIANT_FRAMES = Object.freeze({
  drill: Object.freeze(["f00", "f01", "f02", "f03", "f04", "f05", "f06", "f07", "f08", "f09"]),
  "hip-hop": Object.freeze(["f00", "f01", "f02", "f03", "f04", "f05", "f06", "f07", "f08", "f09"]),
  "paw-groove": Object.freeze(["f0", "f1", "f2"]),
});
const VARIANTS = Object.freeze(Object.keys(DANCE_VARIANT_FRAMES));
const DANCE_VARIANT_FPS = Object.freeze({ drill: 7, "hip-hop": 6, "paw-groove": 6 });
const CYCLES_PER_VARIANT = 3;
const READY_RETRY_MS = 160;
// Audio-meter updates can briefly dip between samples. Keep one continuous
// music session through that tiny gap so a dance does not reset to Drill.
const MUSIC_DROP_GRACE_MS = 150;
const V6_MODEL = "v6-idle-preview";

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function frameDurationMs(variant) {
  const fps = DANCE_VARIANT_FPS[variant];
  return Math.round(1000 / (fps || 6));
}

function wireV6Dance({
  win = window,
  document: doc = win && win.document,
  now = Date.now,
  scheduleTimeout = setTimeout,
  cancelTimeout = clearTimeout,
} = {}) {
  let musicActive = false;
  let energy = 0;
  let running = false;
  let variantIndex = 0;
  let frameIndex = 0;
  let completedCycles = 0;
  let frameTimer = null;
  let readyRetryTimer = null;
  let musicEndTimer = null;
  let finishingCurrentCycle = false;
  let danceSession = 0;
  let forensicEnabled = false;
  let rotationForensicEnabled = false;
  const electronAPI = win && win.electronAPI;

  function logForensic(source, payload) {
    if (!forensicEnabled) return;
    try {
      if (electronAPI && typeof electronAPI.danceForensicLog === "function") {
        electronAPI.danceForensicLog({ source, ...payload });
      }
    } catch (_) {}
  }

  function logRotation(source, payload, force = true) {
    if (!rotationForensicEnabled) return;
    try {
      if (electronAPI && typeof electronAPI.danceRotationForensicLog === "function") {
        electronAPI.danceRotationForensicLog({ source, force, ...payload });
      }
    } catch (_) {}
  }

  function snapshotBody() {
    const body = bodyEl();
    if (!body || !body.dataset) return {};
    const hasAttr =
      typeof body.hasAttribute === "function"
        ? (name) => body.hasAttribute(name)
        : () => false;
    return {
      model: body.dataset.catcodeModel || "",
      latched: body.dataset.catcodeModelLatched === "1",
      pose: body.dataset.v6Pose || "",
      danceVariant: body.dataset.v6DanceVariant || "",
      danceFrame: body.dataset.v6DanceFrame || "",
      danceStatus: body.dataset.v6DanceStatus || "",
      musicActiveAttr: hasAttr("data-music-active"),
      musicDanceAttr: hasAttr("data-music-dance"),
    };
  }

  function visibleDanceHostId() {
    if (!doc || typeof doc.querySelectorAll !== "function") return "";
    try {
      const hosts = doc.querySelectorAll('img[id^="v6-dance-"]');
      for (const host of hosts) {
        if (!host || !host.id) continue;
        if (host.hidden) continue;
        if (typeof win.getComputedStyle === "function") {
          const style = win.getComputedStyle(host);
          if (style && style.display === "none") continue;
        }
        return String(host.id).slice(0, 48);
      }
    } catch (_) {}
    return "";
  }

  function recordDanceHostAssets() {
    if (!rotationForensicEnabled || !doc || typeof doc.querySelectorAll !== "function") return;
    const pose = win && win.CatCodeV6VisualPose;
    const hosts = doc.querySelectorAll('img[id^="v6-dance-"]');
    const ready = [];
    const missing = [];
    const errored = [];
    const pending = [];
    for (const el of hosts) {
      const id = el && el.id ? String(el.id) : "";
      if (!id) continue;
      if (el.complete && el.naturalWidth > 0) ready.push(id);
      else if (el.complete && el.naturalWidth === 0) errored.push(id);
      else pending.push(id);
    }
    logRotation(
      "assets",
      {
        assetsReady: !!(pose && pose.areDanceAssetsReady && pose.areDanceAssetsReady()),
        hostCount: hosts.length,
        readyCount: ready.length,
        pendingCount: pending.length,
        errorCount: errored.length,
        errored: errored.slice(0, 8),
        pending: pending.slice(0, 8),
      },
      true,
    );
  }

  function bodyEl() {
    return doc && doc.body ? doc.body : null;
  }

  function clearFrameTimer() {
    if (frameTimer) cancelTimeout(frameTimer);
    frameTimer = null;
  }

  function clearReadyRetry() {
    if (readyRetryTimer) cancelTimeout(readyRetryTimer);
    readyRetryTimer = null;
  }

  function clearMusicEndTimer() {
    if (musicEndTimer) cancelTimeout(musicEndTimer);
    musicEndTimer = null;
  }

  function resetRoutine(reason) {
    if (rotationForensicEnabled) {
      logRotation("reset", {
        reason: reason || "reset",
        fromVariant: VARIANTS[variantIndex],
        fromFrameIndex: frameIndex,
        running: !!running,
        ...snapshotBody(),
      });
    }
    variantIndex = 0;
    frameIndex = 0;
    completedCycles = 0;
  }

  function waitForAssets() {
    if (!musicActive || readyRetryTimer) return;
    readyRetryTimer = scheduleTimeout(() => {
      readyRetryTimer = null;
      if (musicActive && !running) step();
    }, READY_RETRY_MS);
  }

  function isBlocked(pose) {
    const body = bodyEl();
    if (!body || !body.dataset || !pose) return true;
    if (body.classList && body.classList.contains("dragging")) return true;
    const d = body.dataset;
    return !!(
      d.purring === "1" || d.press || d.scroll || d.jump || d.reminderPanel === "1" ||
      d.reminderForm === "1" || d.reminderJump === "1" || d.petPeek || d.cursorStolen === "1" ||
      d.stretching === "1" || d.drinking === "1" || d.sharing === "1"
    );
  }

  function stop(reason) {
    clearFrameTimer();
    clearReadyRetry();
    const pose = win && win.CatCodeV6VisualPose;
    if (rotationForensicEnabled) {
      logRotation("stop", {
        reason: reason || "stop",
        variant: VARIANTS[variantIndex],
        frameIndex,
        running: !!running,
        visibleHost: visibleDanceHostId(),
        ...snapshotBody(),
      });
    }
    if (pose && pose.leaveDance && pose.getPose && pose.getPose() === "dance") {
      pose.leaveDance(reason || "music-ended");
    }
    running = false;
    finishingCurrentCycle = false;
  }

  function cancel(reason) {
    clearMusicEndTimer();
    // A Return Cat command must leave the current visual synchronously. The
    // next genuine meter update may start a fresh music session later.
    musicActive = false;
    stop(reason || "dance-cancel");
  }

  function endMusicSession() {
    musicEndTimer = null;
    musicActive = false;
    finishingCurrentCycle = false;
    danceSession += 1;
    stop("music-ended");
    resetRoutine("music-ended");
  }

  function beginGracefulMusicEnd() {
    musicEndTimer = null;
    if (!musicActive) return;
    // The meter stayed quiet past its debounce period. Finish the current
    // authored cycle instead of cutting the cat off mid-step. Mark finishing
    // before any family/cycle advance can run.
    musicActive = false;
    finishingCurrentCycle = running;
    if (!running) endMusicSession();
  }

  function scheduleMusicEnd() {
    if (!musicActive || musicEndTimer) return;
    musicEndTimer = scheduleTimeout(beginGracefulMusicEnd, MUSIC_DROP_GRACE_MS);
  }

  function preemptWalk() {
    const walk = win && win.CatCodeV6Walk;
    if (walk && typeof walk.isRunning === "function" && walk.isRunning() && typeof walk.cancel === "function") {
      walk.cancel("music-dance");
    }
  }

  function step() {
    const pose = win && win.CatCodeV6VisualPose;
    if ((!musicActive && !finishingCurrentCycle) || !pose || !pose.isLatched || !pose.isLatched() || isBlocked(pose)) {
      logForensic("v6-dance-step", {
        musicActive: !!musicActive,
        latched: !!(pose && pose.isLatched && pose.isLatched()),
        blocked: !!(pose && isBlocked(pose)),
        assetsReady: !!(pose && pose.areDanceAssetsReady && pose.areDanceAssetsReady()),
        poseName: pose && pose.getPose ? pose.getPose() : "",
        running: !!running,
        outcome: "dance-blocked",
      });
      logRotation("step", {
        outcome: "dance-blocked",
        variant: VARIANTS[variantIndex],
        frameIndex,
        ...snapshotBody(),
      });
      stop("dance-blocked");
      return;
    }
    if (!pose.areDanceAssetsReady || !pose.areDanceAssetsReady()) {
      logForensic("v6-dance-step", {
        musicActive: true,
        assetsReady: false,
        poseName: pose.getPose ? pose.getPose() : "",
        outcome: "wait-assets",
      });
      logRotation("step", {
        outcome: "wait-assets",
        variant: VARIANTS[variantIndex],
        frameIndex,
        ...snapshotBody(),
      });
      // The audio meter may become active while the sixteen V6 PNGs are still
      // loading. Keep the active signal and retry at low frequency instead of
      // requiring the user to stop and restart their music.
      waitForAssets();
      return;
    }
    const currentPose = pose.getPose && pose.getPose();
    if (currentPose !== "idle" && currentPose !== "walk" && currentPose !== "dance") {
      logForensic("v6-dance-step", {
        musicActive: true,
        assetsReady: true,
        poseName: currentPose || "",
        outcome: "pose-blocked",
      });
      logRotation("step", {
        outcome: "pose-blocked",
        poseName: currentPose || "",
        variant: VARIANTS[variantIndex],
        frameIndex,
      });
      stop("pose-blocked");
      return;
    }
    if (pose.isReducedMotion && pose.isReducedMotion()) {
      logForensic("v6-dance-step", {
        musicActive: true,
        assetsReady: true,
        poseName: currentPose || "",
        outcome: "reduced-motion",
      });
      logRotation("step", { outcome: "reduced-motion", variant: VARIANTS[variantIndex] });
      stop("reduced-motion");
      return;
    }
    preemptWalk();
    const variant = VARIANTS[variantIndex];
    const frameKeys = DANCE_VARIANT_FRAMES[variant];
    const frame = frameKeys[frameIndex];
    const ok = pose.enterDance(variant, frame);
    if (!ok) {
      logForensic("v6-dance-step", {
        musicActive: true,
        assetsReady: true,
        poseName: currentPose || "",
        variant,
        frame,
        outcome: "enter-failed",
      });
      logRotation("step", {
        outcome: "enter-failed",
        variant,
        frame,
        ...snapshotBody(),
      });
      waitForAssets();
      return;
    }
    running = true;
    logForensic("v6-dance-step", {
      musicActive: true,
      assetsReady: true,
      poseName: "dance",
      variant,
      frame,
      running: true,
      outcome: "enter-ok",
    });
    logRotation("step", {
      outcome: "enter-ok",
      variant,
      frame,
      variantIndex,
      frameIndex,
      visibleHost: visibleDanceHostId(),
      ...snapshotBody(),
    });
    logRotation("visible-host", {
      visibleHost: visibleDanceHostId(),
      variant,
      frame,
    });
    frameIndex += 1;
    // Finish each complete routine before changing to the other dance family.
    if (frameIndex >= frameKeys.length) {
      frameIndex = 0;
      if (finishingCurrentCycle) {
        clearFrameTimer();
        // Do not schedule another family/cycle after silence — end this session.
        if (!musicActive) endMusicSession();
        return;
      }
      completedCycles += 1;
      if (completedCycles >= CYCLES_PER_VARIANT) {
        completedCycles = 0;
        variantIndex = (variantIndex + 1) % VARIANTS.length;
      }
      logRotation("step", {
        outcome: completedCycles === 0 ? "family-advance" : "cycle-repeat",
        completedCycles,
        nextVariant: VARIANTS[variantIndex],
      });
    }
    clearFrameTimer();
    const sessionAtSchedule = danceSession;
    frameTimer = scheduleTimeout(() => {
      frameTimer = null;
      if (sessionAtSchedule !== danceSession) return;
      step();
    }, frameDurationMs(variant));
  }

  function syncMusicState(state = {}) {
    const nextActive = !!state.active;
    energy = clamp(Number(state.energy) || 0, 0, 1);
    logForensic("v6-dance-sync", {
      musicActive: !!nextActive,
      energyBucket:
        !musicActive ? "0" : energy >= 0.5 ? "high" : energy >= 0.15 ? "mid" : "low",
      running: !!running,
    });
    if (rotationForensicEnabled) {
      logRotation("sync-music", {
        active: !!nextActive,
        energyBucket:
          !nextActive ? "0" : energy >= 0.5 ? "high" : energy >= 0.15 ? "mid" : "low",
        running: !!running,
        variant: VARIANTS[variantIndex],
        frameIndex,
        willReset: !!nextActive && !running,
      });
    }
    if (!nextActive) {
      if (finishingCurrentCycle) return false;
      // Do not restart the dance sequence merely because the meter missed one
      // update. Hard visual-state blockers still stop synchronously below.
      scheduleMusicEnd();
      return false;
    }
    // Resumed audio cancels a finishing/orphan timer and starts a fresh session.
    clearMusicEndTimer();
    if (finishingCurrentCycle || !running) {
      danceSession += 1;
      finishingCurrentCycle = false;
    }
    musicActive = true;
    if (!running) {
      resetRoutine("reactivate");
      step();
    }
    return running;
  }

  // The detector owns these attributes. This is a durable fallback for the
  // first event arriving while the V6 dance images are still loading.
  function syncFromBody() {
    const body = bodyEl();
    if (!body || !body.dataset || body.dataset.catcodeModel !== V6_MODEL) return false;
    return syncMusicState({
      active: body.hasAttribute("data-music-active") && body.hasAttribute("data-music-dance"),
    });
  }

  if (win && typeof win.addEventListener === "function") {
    win.addEventListener("catcode-music-activity", (event) => syncMusicState(event.detail || {}));
  }
  const body = bodyEl();
  if (body && typeof MutationObserver === "function") {
    new MutationObserver((records) => {
      if (rotationForensicEnabled) {
        for (const record of records) {
          const name = record.attributeName || "";
          if (
            name === "data-music-active" ||
            name === "data-music-dance" ||
            name === "data-v6-pose" ||
            name === "data-v6-dance-variant" ||
            name === "data-v6-dance-frame" ||
            name === "data-v6-dance-status"
          ) {
            logRotation("attr", {
              attribute: name,
              ...snapshotBody(),
              visibleHost: visibleDanceHostId(),
            });
          }
        }
      }
      if (records.some((record) => record.attributeName === "data-music-active" || record.attributeName === "data-music-dance")) {
        try {
          syncFromBody();
        } catch (error) {
          logForensic("v6-dance-sync", {
            outcome: "syncFromBody-throw",
            errorName: error && error.name ? String(error.name).slice(0, 32) : "Error",
          });
          logRotation("window-error", {
            errorName: error && error.name ? String(error.name).slice(0, 32) : "Error",
            where: "syncFromBody",
          });
        }
      }
      if (musicActive && !running) step();
      else if (running && isBlocked(win && win.CatCodeV6VisualPose)) {
        clearMusicEndTimer();
        stop("state-blocked");
      }
    }).observe(body, {
      attributes: true,
      attributeFilter: ["class", "data-music-active", "data-music-dance", "data-purring", "data-press", "data-scroll", "data-jump", "data-reminder-panel", "data-reminder-form", "data-reminder-jump", "data-pet-peek", "data-cursor-stolen", "data-stretching", "data-drinking", "data-sharing", "data-v6-pose", "data-v6-dance-variant", "data-v6-dance-frame", "data-v6-dance-status"],
    });
  }

  if (electronAPI && typeof electronAPI.danceForensicEnabled === "function") {
    Promise.resolve(electronAPI.danceForensicEnabled())
      .then((info) => {
        forensicEnabled = !!(info && info.enabled);
      })
      .catch(() => {
        forensicEnabled = false;
      });
  }

  if (electronAPI && typeof electronAPI.danceRotationForensicEnabled === "function") {
    Promise.resolve(electronAPI.danceRotationForensicEnabled())
      .then((info) => {
        rotationForensicEnabled = !!(info && info.enabled);
        if (!rotationForensicEnabled) return;
        logRotation("controller-loaded", {
          hasCatCodeV6Dance: !!(win && win.CatCodeV6Dance),
          variants: VARIANTS.join(","),
          musicDanceEnabled: !!(info && info.musicDanceEnabled),
          musicMeterAvailable: !!(info && info.musicMeterAvailable),
          ...snapshotBody(),
        });
        recordDanceHostAssets();
        if (win && typeof win.addEventListener === "function") {
          win.addEventListener("error", (event) => {
            const file = event && event.filename ? String(event.filename).split(/[/\\]/).pop() : "";
            logRotation("window-error", {
              errorName: event && event.error && event.error.name
                ? String(event.error.name).slice(0, 32)
                : "Error",
              file: String(file).slice(0, 64),
            });
          });
          win.addEventListener("unhandledrejection", (event) => {
            const reason = event && event.reason;
            logRotation("window-error", {
              errorName:
                reason && reason.name
                  ? String(reason.name).slice(0, 32)
                  : "UnhandledRejection",
            });
          });
        }
      })
      .catch(() => {
        rotationForensicEnabled = false;
      });
  }

  return {
    syncMusicState,
    syncFromBody,
    stop,
    cancel,
    isRunning: () => running,
    getVariant: () => VARIANTS[variantIndex],
    getFrame: () => DANCE_VARIANT_FRAMES[VARIANTS[variantIndex]][frameIndex],
    FRAME_KEYS: DANCE_VARIANT_FRAMES.drill,
    VARIANT_FRAMES: DANCE_VARIANT_FRAMES,
    VARIANTS,
    VARIANT_FPS: DANCE_VARIANT_FPS,
    CYCLES_PER_VARIANT,
    READY_RETRY_MS,
    MUSIC_DROP_GRACE_MS,
    frameDurationMs,
  };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6Dance = wireV6Dance();
}

if (typeof module === "object" && module.exports) {
  module.exports = { FRAME_KEYS: DANCE_VARIANT_FRAMES.drill, VARIANT_FRAMES: DANCE_VARIANT_FRAMES, VARIANTS, VARIANT_FPS: DANCE_VARIANT_FPS, CYCLES_PER_VARIANT, MUSIC_DROP_GRACE_MS, frameDurationMs, wireV6Dance };
}
