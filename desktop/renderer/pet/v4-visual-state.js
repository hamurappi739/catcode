"use strict";

// Single V4 visual-state owner: exactly one of idle / sleep / purr is authoritative.
// CSS keys off body[data-v4-pose]; callers never toggle object display ad hoc.
(() => {
  const POSES = Object.freeze({
    idle: "idle",
    sleep: "sleep",
    purr: "purr",
  });

  const WATCHED_ATTRIBUTES = [
    "data-idle-sleep",
    "data-purring",
    "data-catcode-model",
    "class",
  ];

  function isV4(body = document.body) {
    return !!(body && body.dataset && body.dataset.catcodeModel === "v4");
  }

  function resolveV4Pose(body = document.body) {
    if (!isV4(body)) return null;
    // Drag always restores the idle silhouette (Stage A). Sleep/purr must not
    // leave a second object visible underneath the drag path.
    if (body.classList.contains("dragging")) return POSES.idle;
    if (body.dataset.purring) return POSES.purr;
    if (body.dataset.idleSleep) return POSES.sleep;
    return POSES.idle;
  }

  function syncV4VisualState(body = document.body) {
    if (!body || !body.dataset) return null;
    if (!isV4(body)) {
      if (body.dataset.v4Pose) delete body.dataset.v4Pose;
      return null;
    }
    const pose = resolveV4Pose(body);
    if (body.dataset.v4Pose !== pose) body.dataset.v4Pose = pose;
    return pose;
  }

  function bind(body = document.body) {
    if (!body || body.dataset.v4VisualStateBound === "1") {
      return syncV4VisualState(body);
    }
    body.dataset.v4VisualStateBound = "1";
    const observer = new MutationObserver(() => {
      syncV4VisualState(body);
    });
    observer.observe(body, {
      attributes: true,
      attributeFilter: WATCHED_ATTRIBUTES,
    });
    return syncV4VisualState(body);
  }

  const api = {
    POSES,
    isV4,
    resolveV4Pose,
    syncV4VisualState,
    bind,
  };

  window.CatCodeV4VisualState = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bind(document.body), {
      once: true,
    });
  } else {
    bind(document.body);
  }
})();
