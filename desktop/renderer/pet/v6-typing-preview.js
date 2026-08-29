"use strict";

// QA-only: allows review of the five V6 typing frames when Windows blocks the
// global keyboard hook. It is inert unless main explicitly adds the query flag.

const V6_TYPING_PREVIEW_QUERY = "v6TypingPreview";
const PREVIEW_START_DELAY_MS = 3000;
const PREVIEW_STEP_MS = 150;

function isV6TypingPreviewEnabled(search) {
  try {
    return new URLSearchParams(search || "").get(V6_TYPING_PREVIEW_QUERY) === "1";
  } catch (_) {
    return false;
  }
}

function startV6TypingPreview({
  win = window,
  setTimeoutFn = setTimeout,
} = {}) {
  if (!win || !win.CatCodeV6Typing || !win.CatCodeV6VisualPose) return false;

  const pose = win.CatCodeV6VisualPose;
  const typing = win.CatCodeV6Typing;
  if (!pose.isLatched || !pose.isLatched() || !pose.areTypingAssetsReady()) return false;

  const frames = ["f0", "f1", "f2", "f3", "f4"];
  frames.forEach((frame, index) => {
    setTimeoutFn(() => pose.enterTyping(frame), index * PREVIEW_STEP_MS);
  });
  setTimeoutFn(() => typing.release(), frames.length * PREVIEW_STEP_MS + PREVIEW_STEP_MS);
  return true;
}

function armV6TypingPreview({
  win = window,
  setTimeoutFn = setTimeout,
} = {}) {
  if (!win || !isV6TypingPreviewEnabled(win.location && win.location.search)) return false;
  setTimeoutFn(() => startV6TypingPreview({ win, setTimeoutFn }), PREVIEW_START_DELAY_MS);
  return true;
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6TypingPreview = { armV6TypingPreview, startV6TypingPreview };
  armV6TypingPreview();
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    PREVIEW_START_DELAY_MS,
    PREVIEW_STEP_MS,
    V6_TYPING_PREVIEW_QUERY,
    armV6TypingPreview,
    isV6TypingPreviewEnabled,
    startV6TypingPreview,
  };
}
