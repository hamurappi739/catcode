"use strict";

// The main process owns clipped edge bounds. This adapter gives that existing
// feature a V6-only visual without changing its window-placement behaviour.
(() => {
  const body = document.body;
  const api = window.electronAPI;
  let active = false;

  function poseOwner() {
    return window.CatCodeV6VisualPose || null;
  }

  function isV6() {
    return !!(
      body &&
      body.dataset &&
      body.dataset.catcodeModel === "v6-idle-preview" &&
      body.dataset.catcodeModelLatched === "1"
    );
  }

  function cancelCompetingV6Visuals() {
    const root = window;
    if (root.CatCodeV6Walk && typeof root.CatCodeV6Walk.cancel === "function") {
      root.CatCodeV6Walk.cancel("edge-peek");
    }
    if (root.CatCodeV6Hunt && typeof root.CatCodeV6Hunt.cancel === "function") {
      root.CatCodeV6Hunt.cancel("edge-peek");
    }
    if (root.CatCodeV6CursorTease && typeof root.CatCodeV6CursorTease.cancel === "function") {
      root.CatCodeV6CursorTease.cancel("edge-peek");
    }
    if (root.CatCodeV6Dance && typeof root.CatCodeV6Dance.stop === "function") {
      root.CatCodeV6Dance.stop("edge-peek");
    }
  }

  function apply(nextState) {
    const edge = nextState && nextState.edge === "right" ? "right" : nextState && nextState.edge === "left" ? "left" : "";
    if (!isV6()) return;
    const pose = poseOwner();
    if (!pose) return;

    if (edge) {
      cancelCompetingV6Visuals();
      active = !!pose.enterEdgePeek && pose.enterEdgePeek(edge);
      return;
    }

    if (active || pose.getPose && pose.getPose() === "edge-peek") {
      pose.leaveEdgePeek && pose.leaveEdgePeek("main-unpeek");
    }
    active = false;
  }

  if (api && typeof api.onPetPeekState === "function") {
    api.onPetPeekState(apply);
  }

  window.CatCodeV6EdgePeek = { apply };
})();
