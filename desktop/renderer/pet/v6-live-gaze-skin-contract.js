"use strict";

/**
 * Fail-closed live-gaze asset contract for recolour-only V6 owner skins.
 * Full byte/pupil validation runs in Node tests; browser uses catalog flags.
 */

const LIVE_GAZE_CONTRACT_SCHEMA = "catcode.v6.live-gaze-skin.recolor-only.v1";

const LIVE_GAZE_REQUIRED_RUNTIME_PATHS = Object.freeze([
  "idle-master.png",
  "head-layers/idle-body-under-head-256.png",
  "head-layers/idle-head-with-neck-underlap-256.png",
  "hunt-smooth/hunt-f8-watch-hold.png",
  "hunt-smooth/hunt-f8-gaze-ready.png",
]);

const LIVE_GAZE_PUPIL_FREE_PATHS = Object.freeze([
  "head-layers/idle-head-with-neck-underlap-256.png",
  "hunt-smooth/hunt-f8-gaze-ready.png",
]);

function registerLiveGazeSkin(skin) {
  if (!skin || typeof skin !== "object") {
    return { ok: false, mode: "static-fallback", reason: "missing skin" };
  }
  if (!skin.liveGazeRecolorOnly) {
    return { ok: true, mode: "catalog-default", schema: null };
  }
  if (skin.idleGazeBaseWithoutPupils !== true) {
    return {
      ok: false,
      mode: "static-fallback",
      reason: "idleGazeBaseWithoutPupils must be true for live gaze",
    };
  }
  if (!skin.eyePalette || typeof skin.eyePalette.pupil !== "string") {
    return {
      ok: false,
      mode: "static-fallback",
      reason: "eyePalette with pupil token required",
    };
  }
  if (skin.stillEyes === true) {
    return {
      ok: false,
      mode: "static-fallback",
      reason: "stillEyes blocks live gaze overlay",
    };
  }
  return {
    ok: true,
    mode: "live-gaze",
    schema: LIVE_GAZE_CONTRACT_SCHEMA,
    requiredPaths: LIVE_GAZE_REQUIRED_RUNTIME_PATHS,
    pupilFreePaths: LIVE_GAZE_PUPIL_FREE_PATHS,
  };
}

function skinSupportsLiveGaze(skin) {
  return registerLiveGazeSkin(skin).ok;
}

const api = {
  LIVE_GAZE_CONTRACT_SCHEMA,
  LIVE_GAZE_REQUIRED_RUNTIME_PATHS,
  LIVE_GAZE_PUPIL_FREE_PATHS,
  registerLiveGazeSkin,
  skinSupportsLiveGaze,
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.CatCodeV6LiveGazeSkinContract = api;
