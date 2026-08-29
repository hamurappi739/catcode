"use strict";

(() => {
  const api = window.electronAPI;
  const body = document.body;
  const cat = document.getElementById("cat");
  const speech = document.getElementById("cat-speech-bubble");
  const theftCopy = document.getElementById("cursor-theft-copy");
  const wellnessCompleteButton = document.getElementById("cat-wellness-complete");
  const theftSpeech = window.CatCodePlayfulMovementSpeech;
  // Legacy V2 idle used a cropped resting viewBox. Authored V4 art is 0 0 64 64
  // and must never receive this value (Stage A crop bug).
  const legacyRestingViewBox = "-8 -10 50 50";
  let language = "ru";
  let latest = { active: false };
  let forensicEnabled = false;

  const copy = {
    ru: { caught: "Попался!", release: "Ладно, держи." },
    en: { caught: "Got it!", release: "Fine, take it back." },
  };

  function catDocumentRoot() {
    try {
      return cat && cat.contentDocument && cat.contentDocument.documentElement;
    } catch {
      return null;
    }
  }

  function isV4Model() {
    if (body.dataset.catcodeModel === "v4") return true;
    const root = catDocumentRoot();
    return !!(root && root.matches && root.matches("svg[data-catcode-model='v4']"));
  }

  function clearRoamingFlags() {
    delete body.dataset.petRoaming;
    delete body.dataset.petRoamingDirection;
    delete body.dataset.petMotionPhase;
    delete body.dataset.cursorStolen;
  }

  function syncEmbeddedAnimation() {
    const root = catDocumentRoot();
    if (!root) return;

    // Stage A: V4 keeps its authored viewBox and never gets playful-jump transforms.
    if (isV4Model() || root.matches("svg[data-catcode-model='v4']")) {
      root.classList.remove("playful-jump");
      return;
    }

    const jumping =
      !!latest.active &&
      (latest.mode === "jump" ||
        (latest.mode === "cursor" && latest.phase === "pounce"));
    root.classList.toggle("playful-jump", jumping);
    root.removeAttribute("preserveAspectRatio");
    root.setAttribute("viewBox", legacyRestingViewBox);
  }

  function clearPlayfulSpeech() {
    if (body.dataset.speech !== "playful") return;
    delete body.dataset.speech;
    if (speech) {
      speech.textContent = "";
      speech.removeAttribute("aria-label");
    }
  }

  function forensicLog(source, payload = {}) {
    if (!forensicEnabled || !api || typeof api.cursorTheftCopyForensicLog !== "function") {
      return;
    }
    try {
      api.cursorTheftCopyForensicLog({ source, ...payload });
    } catch (_) {}
  }

  function sampleTheftCopyVisibility(reason) {
    if (!forensicEnabled) return;
    const payload = {
      reason: reason || "",
      hasHost: !!theftCopy,
      attrSpeech: body.dataset.speech || "",
      attrTheft: body.dataset.cursorTheftCopy || "",
      attrPose: body.dataset.v6Pose || "",
      attrStolen: body.dataset.cursorStolen || "",
    };
    if (theftCopy && typeof window.getComputedStyle === "function") {
      try {
        const cs = window.getComputedStyle(theftCopy);
        const rect = theftCopy.getBoundingClientRect();
        payload.display = cs.display || "";
        payload.visibility = cs.visibility || "";
        payload.opacity = Number(cs.opacity);
        payload.rectW = Math.round(rect.width);
        payload.rectH = Math.round(rect.height);
        payload.zIndex = String(cs.zIndex || "");
      } catch (_) {}
    }
    forensicLog("chip-sample", payload);
  }

  function clearTheftCopy() {
    const had = !!body.dataset.cursorTheftCopy;
    delete body.dataset.cursorTheftCopy;
    if (theftCopy) {
      theftCopy.textContent = "";
      theftCopy.removeAttribute("aria-label");
    }
    if (had) {
      forensicLog("chip-clear", {
        attrPose: body.dataset.v6Pose || "",
        attrSpeech: body.dataset.speech || "",
      });
      sampleTheftCopyVisibility("cleared");
    }
  }

  function showTheftCopy(text) {
    if (!theftCopy || !text) {
      forensicLog("chip-show", { hasHost: !!theftCopy, copyKind: "none", reason: "missing-host-or-text" });
      return;
    }
    body.dataset.cursorTheftCopy = "1";
    theftCopy.textContent = text;
    theftCopy.setAttribute("aria-label", text);
    forensicLog("chip-show", {
      hasHost: true,
      attrTheft: "1",
      attrPose: body.dataset.v6Pose || "",
      copyKind: text.includes("\u041f\u043e\u0439\u043c\u0430\u043b") || /gotcha/i.test(text)
        ? "caught"
        : "restored",
    });
    sampleTheftCopyVisibility("shown");
  }

  function showPlayfulSpeech(text) {
    if (!speech) return;
    const current = body.dataset.speech;
    if (current && current !== "playful") return;
    body.dataset.speech = "playful";
    speech.textContent = text;
    speech.setAttribute("aria-label", text);
  }

  function isV6Latched() {
    return (
      body.dataset.catcodeModel === "v6-idle-preview" ||
      body.dataset.catcodeModelLatched === "1"
    );
  }

  function wellnessCompleteVisible() {
    return !!(
      wellnessCompleteButton &&
      wellnessCompleteButton.hidden === false
    );
  }

  function applyState(state = {}) {
    forensicLog("renderer-recv", {
      listener: "playful-movement",
      phase: state && state.phase ? String(state.phase) : state && state.active ? "active" : "inactive",
      active: !!(state && state.active),
      mode: state && state.mode ? String(state.mode) : "",
      warpedFlag: !!(state && state.cursorWarped),
      attrPose: body.dataset.v6Pose || "",
      attrSpeech: body.dataset.speech || "",
    });

    // The retired V4 object can remain loaded behind the V6 PNG. A latched V6
    // model must win this decision or V6 cursor-theft copy never receives a
    // chance to render.
    if (!isV6Latched() && isV4Model()) {
      latest = { active: false };
      clearRoamingFlags();
      clearPlayfulSpeech();
      syncEmbeddedAnimation();
      return;
    }

    // V6-M9: CatCodeV6Walk owns walk pixels; never fall back to V4 sprite/viewBox.
    if (isV6Latched()) {
      latest = state || { active: false };
      if (theftSpeech && typeof theftSpeech.applyV6CursorTheftSpeech === "function") {
        theftSpeech.applyV6CursorTheftSpeech(state, {
          body,
          language,
          showSpeech: showPlayfulSpeech,
          clearSpeech: clearPlayfulSpeech,
          showTheftCopy,
          clearTheftCopy,
          wellnessCompleteVisible: wellnessCompleteVisible(),
          forensicLog,
        });
      } else if (!state || !state.active) {
        clearRoamingFlags();
        clearPlayfulSpeech();
        clearTheftCopy();
        delete body.dataset.cursorStolen;
      } else if (state.mode === "cursor") {
        if (state.phase === "caught" || state.phase === "carry") {
          body.dataset.cursorStolen = "true";
          clearPlayfulSpeech();
        } else {
          delete body.dataset.cursorStolen;
          clearPlayfulSpeech();
        }
      }
      return;
    }

    latest = state;
    if (!state.active) {
      clearRoamingFlags();
      clearPlayfulSpeech();
      syncEmbeddedAnimation();
      return;
    }

    delete body.dataset.press;
    delete body.dataset.scroll;
    body.dataset.petRoaming = state.mode || "walk";
    body.dataset.petMotionPhase = state.phase || "moving";
    if (state.direction) body.dataset.petRoamingDirection = state.direction;
    if (
      state.mode === "cursor" &&
      (state.phase === "caught" || state.phase === "carry")
    ) {
      body.dataset.cursorStolen = "true";
      if (state.phase === "caught" && state.cursorWarped) {
        showPlayfulSpeech((copy[language] || copy.ru).caught);
      }
    } else {
      delete body.dataset.cursorStolen;
      if (state.mode === "cursor" && state.phase === "restored") {
        showPlayfulSpeech((copy[language] || copy.ru).release);
      }
    }
    syncEmbeddedAnimation();
  }

  cat?.addEventListener("load", syncEmbeddedAnimation);
  api?.languageGet?.().then((value) => {
    language = value === "en" ? "en" : "ru";
  });
  api?.onLanguageChanged?.((value) => {
    language = value === "en" ? "en" : "ru";
  });
  api?.onPetPlayfulMovement?.(applyState);

  if (api && typeof api.cursorTheftCopyForensicEnabled === "function") {
    Promise.resolve(api.cursorTheftCopyForensicEnabled())
      .then((info) => {
        forensicEnabled = !!(info && info.enabled);
        if (forensicEnabled) {
          forensicLog("renderer-recv", {
            listener: "playful-movement",
            phase: "startup",
            hasHost: !!theftCopy,
            attrPose: body.dataset.v6Pose || "",
          });
          sampleTheftCopyVisibility("startup");
        }
      })
      .catch(() => {
        forensicEnabled = false;
      });
  }
})();
