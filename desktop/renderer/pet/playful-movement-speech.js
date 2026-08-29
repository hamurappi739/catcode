"use strict";

const V6_THEFT_COPY = {
  ru: { caught: "Поймал!", restored: "На, держи!" },
  en: { caught: "Gotcha!", restored: "Here you go!" },
};

function explainTheftSpeechBlock(body, options = {}) {
  if (!body || !body.dataset) return "missing-body";
  const speech = body.dataset.speech || "";
  const v6Pose = body.dataset.v6Pose || "";
  const v6ExclusivePose =
    v6Pose === "purr" ||
    v6Pose === "celebrate" ||
    v6Pose === "typing" ||
    v6Pose === "scroll" ||
    v6Pose === "hunt" ||
    v6Pose === "tease" ||
    v6Pose === "walk" ||
    v6Pose === "dance" ||
    v6Pose === "edge-peek";
  const theftTeaseIsAllowed = options.allowTease && v6Pose === "tease";
  if (options.wellnessCompleteVisible) return "wellness-ack";
  if (body.dataset.petPeek) return "peek";
  if (body.classList && body.classList.contains("dragging")) return "drag";
  if (body.dataset.purring) return "purr";
  if (body.dataset.stretching) return "stretch";
  if (body.dataset.drinking) return "drink";
  if (body.dataset.hunting || body.dataset.huntingReturn) return "hunt";
  if (body.dataset.musicDance || body.dataset.musicActive) return "music";
  if (body.dataset.press) return "typing";
  if (body.dataset.scroll) return "scroll";
  if (body.dataset.jump) return "jump";
  if (v6ExclusivePose && !theftTeaseIsAllowed) return `pose:${v6Pose || "unknown"}`;
  if (
    ["reminder", "agent-notification", "update", "timer", "break", "complete"].includes(
      speech,
    )
  ) {
    return `speech:${speech}`;
  }
  return "";
}

function canShowTheftSpeech(body, options = {}) {
  return explainTheftSpeechBlock(body, options) === "";
}

function resolveV6TheftSpeech(state, language = "ru") {
  const copy = V6_THEFT_COPY[language] || V6_THEFT_COPY.ru;
  if (!state || state.mode !== "cursor") return null;
  if (state.phase === "caught" && state.cursorWarped) return copy.caught;
  if (state.phase === "restored") return copy.restored;
  return null;
}

function resolveV6TheftCopyKind(state) {
  if (!state || state.mode !== "cursor") return "none";
  if (state.phase === "caught" && state.cursorWarped) return "caught";
  if (state.phase === "restored") return "restored";
  return "none";
}

function applyV6CursorTheftSpeech(state, context = {}) {
  const {
    body,
    language = "ru",
    showSpeech,
    clearSpeech,
    showTheftCopy,
    clearTheftCopy,
    wellnessCompleteVisible = false,
    forensicLog,
  } = context;
  if (!body) return { copyKind: "none", guard: "missing-body" };
  if (!state || !state.active) {
    clearSpeech && clearSpeech();
    clearTheftCopy && clearTheftCopy();
    delete body.dataset.cursorStolen;
    forensicLog &&
      forensicLog("speech-apply", {
        phase: "inactive",
        active: false,
        copyKind: "none",
        reason: "inactive",
      });
    return { copyKind: "none", guard: "inactive" };
  }
  if (state.mode !== "cursor") return { copyKind: "none", guard: "non-cursor" };
  if (state.phase === "caught" || state.phase === "carry") {
    body.dataset.cursorStolen = "true";
  } else {
    delete body.dataset.cursorStolen;
  }
  const copyKind = resolveV6TheftCopyKind(state);
  const text = resolveV6TheftSpeech(state, language);
  if (!text) {
    clearSpeech && clearSpeech();
    clearTheftCopy && clearTheftCopy();
    forensicLog &&
      forensicLog("speech-apply", {
        phase: state.phase || "",
        active: true,
        mode: "cursor",
        copyKind: "none",
        reason: "no-resolved-text",
        attrPose: body.dataset.v6Pose || "",
        attrSpeech: body.dataset.speech || "",
      });
    return { copyKind: "none", guard: "no-resolved-text" };
  }
  const allowTease = state.phase === "caught" || state.phase === "restored";
  const guard = explainTheftSpeechBlock(body, {
    wellnessCompleteVisible,
    allowTease,
  });
  if (guard) {
    clearSpeech && clearSpeech();
    clearTheftCopy && clearTheftCopy();
    forensicLog &&
      forensicLog("speech-guard", {
        phase: state.phase || "",
        active: true,
        mode: "cursor",
        copyKind,
        guard,
        attrPose: body.dataset.v6Pose || "",
        attrSpeech: body.dataset.speech || "",
        attrStolen: body.dataset.cursorStolen || "",
        wellnessBtn: !!wellnessCompleteVisible,
      });
    return { copyKind, guard };
  }
  clearSpeech && clearSpeech();
  showTheftCopy && showTheftCopy(text);
  forensicLog &&
    forensicLog("speech-apply", {
      phase: state.phase || "",
      active: true,
      mode: "cursor",
      copyKind,
      guard: "",
      attrPose: body.dataset.v6Pose || "",
      attrSpeech: body.dataset.speech || "",
      attrTheft: body.dataset.cursorTheftCopy || "",
    });
  return { copyKind, guard: "" };
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    V6_THEFT_COPY,
    applyV6CursorTheftSpeech,
    canShowTheftSpeech,
    explainTheftSpeechBlock,
    resolveV6TheftSpeech,
    resolveV6TheftCopyKind,
  };
}

if (typeof window === "object") {
  window.CatCodePlayfulMovementSpeech = {
    V6_THEFT_COPY,
    applyV6CursorTheftSpeech,
    canShowTheftSpeech,
    explainTheftSpeechBlock,
    resolveV6TheftSpeech,
    resolveV6TheftCopyKind,
  };
}
