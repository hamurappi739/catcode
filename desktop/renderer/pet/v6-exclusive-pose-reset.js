// V6 exclusive-pose reset for the explicit "Return Cat to Screen" action.
// Each controller clears its own timers before the visual owner restores idle.

const V6_RETURN_CANCELLABLE_POSES = Object.freeze([
  "hunt",
  "dance",
  "scroll",
  "typing",
  "tease",
  "walk",
  "celebrate",
]);

function wireV6ExclusivePoseReset({
  win = window,
  electronAPI = win && win.electronAPI,
} = {}) {
  function cancelController(controller, reason) {
    try {
      if (controller && typeof controller.cancel === "function") {
        controller.cancel(reason);
      }
    } catch (_) {}
  }

  function resetForReturn(reason = "return-cat") {
    cancelController(win && win.CatCodeV6Hunt, reason);
    cancelController(win && win.CatCodeV6Dance, reason);
    cancelController(win && win.CatCodeV6Scroll, reason);
    cancelController(win && win.CatCodeV6Typing, reason);
    cancelController(win && win.CatCodeV6CursorTease, reason);
    cancelController(win && win.CatCodeV6Walk, reason);

    const pose = win && win.CatCodeV6VisualPose;
    if (
      pose &&
      typeof pose.getPose === "function" &&
      typeof pose.wakeToIdle === "function" &&
      V6_RETURN_CANCELLABLE_POSES.includes(pose.getPose())
    ) {
      pose.wakeToIdle(reason);
    }
  }

  if (electronAPI && typeof electronAPI.onPetReturnToScreen === "function") {
    electronAPI.onPetReturnToScreen((payload) => {
      const reason = payload && payload.reason ? String(payload.reason) : "return-cat";
      resetForReturn(reason);
    });
  }

  return { resetForReturn, V6_RETURN_CANCELLABLE_POSES };
}

if (typeof window === "object" && window.document) {
  window.CatCodeV6ExclusivePoseReset = wireV6ExclusivePoseReset();
}

if (typeof module === "object" && module.exports) {
  module.exports = { V6_RETURN_CANCELLABLE_POSES, wireV6ExclusivePoseReset };
}
