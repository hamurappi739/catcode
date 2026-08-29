"use strict";

// V6-M3: route the existing completion jump and a saved cat name to the
// complete V6 celebrate frames. The legacy jump can still manage its timers,
// but its SVG hosts remain hidden by the V6 model latch.

function wireV6Celebrate({ win = window, electronAPI = win && win.electronAPI } = {}) {
  if (!electronAPI) return { trigger: () => false };

  function trigger() {
    const pose = win && win.CatCodeV6VisualPose;
    return !!(pose && pose.isLatched && pose.isLatched() && pose.enterCelebrate());
  }

  if (typeof electronAPI.onDoJump === "function") {
    electronAPI.onDoJump(() => trigger());
  }
  if (typeof electronAPI.onCatNameChanged === "function") {
    electronAPI.onCatNameChanged((payload) => {
      const name = typeof payload === "string" ? payload : payload && payload.name;
      if (typeof name === "string" && name.trim()) trigger();
    });
  }
  if (typeof electronAPI.onAiTaskComplete === "function") {
    electronAPI.onAiTaskComplete(() => trigger());
  }

  return { trigger };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6Celebrate = wireV6Celebrate();
}

if (typeof module === "object" && module.exports) {
  module.exports = { wireV6Celebrate };
}
