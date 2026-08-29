"use strict";

const RELEASE_AFTER_MS = 280;
const SESSION_GAP_MS = 360;
const FAST_WINDOW_MS = 800;
const FAST_KEY_COUNT = 8;

function wireV6Typing({ win = window, electronAPI = win && win.electronAPI, now = Date.now } = {}) {
  let timestamps = [];
  let lastKeyAt = -Infinity;
  let normalIndex = 0;
  let fastIndex = 0;
  let releaseTimer = null;

  function clearReleaseTimer() {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = null;
  }

  function release() {
    releaseTimer = null;
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.leaveTyping) pose.leaveTyping("typing-idle");
  }

  function cancel(reason) {
    clearReleaseTimer();
    const pose = win && win.CatCodeV6VisualPose;
    if (pose && pose.leaveTyping && pose.getPose && pose.getPose() === "typing") {
      pose.leaveTyping(reason || "typing-cancel");
    }
  }

  function handleKeyPressed() {
    const pose = win && win.CatCodeV6VisualPose;
    if (!pose || !pose.isLatched || !pose.isLatched() || !pose.enterTyping) return;
    const current = now();
    const isNewSession = current - lastKeyAt > SESSION_GAP_MS;
    lastKeyAt = current;
    timestamps = timestamps.filter((time) => current - time <= FAST_WINDOW_MS);
    timestamps.push(current);

    let frame = "f0";
    if (!isNewSession && timestamps.length >= FAST_KEY_COUNT) {
      frame = fastIndex++ % 2 === 0 ? "f3" : "f4";
    } else if (!isNewSession) {
      frame = normalIndex++ % 2 === 0 ? "f1" : "f2";
    }
    pose.enterTyping(frame);
    clearReleaseTimer();
    releaseTimer = setTimeout(release, RELEASE_AFTER_MS);
  }

  if (electronAPI && typeof electronAPI.onKeyPressed === "function") {
    electronAPI.onKeyPressed(handleKeyPressed);
  }

  return { handleKeyPressed, release, cancel };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6Typing = wireV6Typing();
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    FAST_KEY_COUNT,
    FAST_WINDOW_MS,
    RELEASE_AFTER_MS,
    SESSION_GAP_MS,
    wireV6Typing,
  };
}
