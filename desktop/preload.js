"use strict";
var { contextBridge: s, ipcRenderer: n } = require("electron");
var cursorPosListeners = [];
var huntCursorEnabledListeners = [];
var lastHuntCursorEnabled = null;
var huntOwnerForensicEnabledListeners = [];
var lastHuntOwnerForensicEnabled = null;
var petRendererReadySent = !1;
var bootLogged = Object.create(null);
var firstCursorPosLogged = !1;
var lastFanoutForensicAt = 0;

function bootOnce(key, payload) {
  if (bootLogged[key]) return;
  bootLogged[key] = !0;
  try {
    n.send("hunt-owner-forensic-boot", {
      process: "preload",
      source: "boot",
      event: key,
      ...payload,
    });
  } catch (_) {}
}

function forensicEvent(payload) {
  try {
    n.send("hunt-owner-forensic-event", {
      process: "preload",
      source: (payload && payload.source) || "preload",
      ...payload,
    });
  } catch (_) {}
}

function sendPetRendererReady(payload) {
  var body = {
    model: (payload && payload.model) || "v6",
    protocol: (payload && payload.protocol) || 1,
    cursorListener: cursorPosListeners.length > 0,
    via: (payload && payload.via) || "notify",
  };
  bootOnce("ready-send-attempt", {
    cursorListener: body.cursorListener,
    via: body.via,
  });
  try {
    n.send("pet-renderer-ready", body);
    bootOnce("ready-send-ok", { via: body.via, cursorListener: body.cursorListener });
    return !0;
  } catch (err) {
    bootOnce("ready-send-error", {
      via: body.via,
      errorClass: err && err.name ? String(err.name).slice(0, 32) : "Error",
    });
    return !1;
  }
}

n.on("cursor-pos", (t, o) => {
  if (!firstCursorPosLogged) {
    firstCursorPosLogged = !0;
    forensicEvent({
      source: "preload",
      event: "preload-cursor-pos-received",
      listenerCount: cursorPosListeners.length,
    });
  }
  var attempted = 0;
  var errors = 0;
  var list = cursorPosListeners.slice();
  for (let e of list) {
    attempted += 1;
    try {
      e(o);
    } catch (_) {
      errors += 1;
    }
  }
  var now = Date.now();
  if (now - lastFanoutForensicAt >= 220) {
    lastFanoutForensicAt = now;
    forensicEvent({
      source: "preload",
      event: "preload-cursor-pos-fanout",
      listenerCount: list.length,
      callbacksAttempted: attempted,
      callbackErrors: errors,
    });
  }
});

n.on("hunt-cursor-enabled", (t, o) => {
  lastHuntCursorEnabled = o;
  for (let e of huntCursorEnabledListeners.slice()) {
    try {
      e(o);
    } catch (_) {}
  }
});

n.on("hunt-owner-forensic-enabled", (t, o) => {
  lastHuntOwnerForensicEnabled = o;
  for (let e of huntOwnerForensicEnabledListeners.slice()) {
    try {
      e(o);
    } catch (_) {}
  }
});

bootOnce("bridge-exposed", { cursorChannel: "cursor-pos" });

s.exposeInMainWorld("electronAPI", {
  onCursorPos: (e) => {
    if (typeof e !== "function") return;
    cursorPosListeners.push(e);
    bootOnce("cursor-listener-registered", {
      listenerCount: cursorPosListeners.length,
    });
    if (!petRendererReadySent) {
      petRendererReadySent = !0;
      if (!sendPetRendererReady({ model: "v6", protocol: 1, via: "preload-auto" })) {
        petRendererReadySent = !1;
      }
    }
  },
  notifyPetRendererReady: (e) => {
    if (petRendererReadySent) {
      bootOnce("ready-send-duplicate", { via: "notify" });
      return !0;
    }
    petRendererReadySent = !0;
    if (!sendPetRendererReady({ ...(e || {}), via: "notify" })) {
      petRendererReadySent = !1;
      return !1;
    }
    return !0;
  },
  getHuntCursorEnabled: () => n.invoke("hunt-cursor-enabled-get"),
  onHuntCursorEnabled: (e) => {
    if (typeof e !== "function") return;
    huntCursorEnabledListeners.push(e);
    if (lastHuntCursorEnabled !== null) {
      try {
        e(lastHuntCursorEnabled);
      } catch (_) {}
    }
  },
  onHuntOwnerForensicEnabled: (e) => {
    if (typeof e !== "function") return;
    huntOwnerForensicEnabledListeners.push(e);
    if (lastHuntOwnerForensicEnabled !== null) {
      try {
        e(lastHuntOwnerForensicEnabled);
      } catch (_) {}
    }
  },
  reportV6HuntVisualFocus: (e) => {
    try {
      n.send("v6-hunt-visual-focus", e && typeof e === "object" ? e : {});
      return !0;
    } catch (_) {
      return !1;
    }
  },
  gazeDiagnosticsEnabled: () => n.invoke("gaze-diagnostics-enabled"),
  gazeDiagnosticsLog: (e) => n.invoke("gaze-diagnostics-log", e),
  v6SkinDiagnosticsEnabled: () => n.invoke("v6-skin-diagnostics-enabled"),
  v6SkinDiagnosticsLog: (e) => n.invoke("v6-skin-diagnostics-log", e),
  danceForensicEnabled: () => n.invoke("dance-forensic-enabled"),
  danceForensicLog: (e) => n.invoke("dance-forensic-log", e),
  danceRotationForensicEnabled: () => n.invoke("dance-rotation-forensic-enabled"),
  danceRotationForensicLog: (e) => n.invoke("dance-rotation-forensic-log", e),
  cursorTeaseForensicEnabled: () => n.invoke("cursor-tease-forensic-enabled"),
  cursorTeaseForensicLog: (e) => n.invoke("cursor-tease-forensic-log", e),
  huntOwnerForensicEnabled: () => n.invoke("hunt-owner-forensic-enabled"),
  huntOwnerForensicLog: (e) => n.invoke("hunt-owner-forensic-log", e),
  huntOwnerForensicEvent: (e) => {
    try {
      n.send("hunt-owner-forensic-event", {
        process: "renderer",
        ...(e && typeof e === "object" ? e : {}),
      });
      return !0;
    } catch (_) {
      return !1;
    }
  },
  cursorTheftCopyForensicEnabled: () =>
    n.invoke("cursor-theft-copy-forensic-enabled"),
  cursorTheftCopyForensicLog: (e) =>
    n.invoke("cursor-theft-copy-forensic-log", e),
  onKeyPressed: (e) => n.on("key-pressed", () => e()),
  onMouseWheel: (e) => n.on("mouse-wheel", (t, o) => e(o)),
  onDismissTransientUi: (e) => n.on("dismiss-transient-ui", () => e()),
  onDoStretch: (e) => n.on("do-stretch", () => e()),
  onCancelStretch: (e) => n.on("cancel-stretch", () => e()),
  onDoDrink: (e) => n.on("do-drink", () => e()),
  onCancelDrink: (e) => n.on("cancel-drink", () => e()),
  onWellnessNotification: (e) =>
    n.on("wellness-notification", (t, o) => e(o)),
  onWellnessPrompt: (e) => n.on("wellness-prompt", (t, o) => e(o)),
  wellnessComplete: (e) => n.invoke("wellness-complete", e),
  onWellnessStretchIgnored: (e) =>
    n.on("wellness-stretch-ignored", () => e()),
  onPreviewAngryReaction: (e) =>
    n.on("preview-angry-reaction", () => e()),
  onWellnessIntervalEdit: (e) =>
    n.on("wellness-interval-edit", (t, o) => e(o)),
  wellnessIntervalSet: (e) => n.invoke("wellness-interval-set", e),
  onDoJump: (e) => n.on("do-jump", () => e()),
  onShareRecord: (e) => n.on("share-record", () => e()),
  onShareCaptureCancel: (e) => n.on("share-capture-cancel", () => e()),
  onCatNameEdit: (e) => n.on("cat-name-edit", (t, o) => e(o)),
  onCatNameChanged: (e) => n.on("cat-name-changed", (t, o) => e(o)),
  onPetSizeChanged: (e) => n.on("pet-size-changed", (t, o) => e(o)),
  onAiTaskComplete: (e) => n.on("ai-task-complete", (t, o) => e(o)),
  onAiTaskState: (e) => n.on("ai-task-state", (t, o) => e(o)),
  onAiTaskNotification: (e) => n.on("ai-task-notification", (t, o) => e(o)),
  remindersGet: () => n.invoke("reminders-get"),
  reminderAdd: (e) => n.invoke("reminder-add", e),
  reminderUpdate: (e) => n.invoke("reminder-update", e),
  reminderDelete: (e) => n.invoke("reminder-delete", e),
  reminderEnabledSet: (e) => n.invoke("reminder-enabled-set", e),
  onRemindersChanged: (e) => n.on("reminders-changed", (t, o) => e(o)),
  onReminderTriggered: (e) => n.on("reminder-triggered", (t, o) => e(o)),
  onReminderPanelOpen: (e) => n.on("reminder-panel-open", () => e()),
  onReminderSettingsChanged: (e) =>
    n.on("reminder-settings-changed", (t, o) => e(o)),
  pomodoroGet: () => n.invoke("pomodoro-get"),
  pomodoroStart: () => n.invoke("pomodoro-start"),
  pomodoroPause: () => n.invoke("pomodoro-pause"),
  pomodoroReset: () => n.invoke("pomodoro-reset"),
  pomodoroFocusSet: (e) => n.invoke("pomodoro-focus-set", e),
  pomodoroRestSet: (e) => n.invoke("pomodoro-rest-set", e),
  onPomodoroFocusEdit: (e) => n.on("pomodoro-focus-edit", (t, o) => e(o)),
  onPomodoroRestEdit: (e) => n.on("pomodoro-rest-edit", (t, o) => e(o)),
  onPomodoroState: (e) => n.on("pomodoro-state", (t, o) => e(o)),
  onPomodoroComplete: (e) => n.on("pomodoro-complete", (t, o) => e(o)),
  onPomodoroFocusStart: (e) => n.on("pomodoro-focus-start", () => e()),
  onCancelPomodoroMotion: (e) => n.on("cancel-pomodoro-motion", () => e()),
  onUpdateState: (e) => n.on("update-state", (t, o) => e(o)),
  onTaskCompleteSoundVolume: (e) =>
    n.on("task-complete-sound-volume", (t, o) => e(o)),
  onSoundMuted: (e) => n.on("sound-muted", (t, o) => e(o)),
  onSoundPreview: (e) => n.on("sound-preview", (t, o) => e(o)),
  updateCheck: () => n.invoke("update-check"),
  updateDownload: () => n.invoke("update-download"),
  updateInstall: () => n.invoke("update-install"),
  dragWindow: (e, t) => n.send("drag-window", e, t),
  dragWindowTo: (e, t, o, a) => n.send("drag-window-to", e, t, o, a),
  dragWindowEnded: () => n.send("drag-window-ended"),
  peekPet: (e) => n.send("peek-pet", e),
  unpeekPet: () => n.send("unpeek-pet"),
  bringPetIntoView: () => n.send("bring-pet-into-view"),
  onPetPeekState: (e) => n.on("pet-peek-state", (t, o) => e(o)),
  onPetPlayfulMovement: (e) =>
    n.on("pet-playful-movement", (t, o) => e(o)),
  onV6CursorTease: (e) => n.on("v6-cursor-tease", (t, o) => e(o)),
  cancelPetPlayfulMovement: () => n.send("cancel-pet-playful-movement"),
  onPetReturnToScreen: (e) =>
    n.on("pet-return-to-screen", (t, o) => e(o)),
  onPetWakeForPlay: (e) => n.on("pet-wake-for-play", () => e()),
  onMusicActivity: (e) => n.on("music-activity", (t, o) => e(o)),
  getMusicActivity: () => n.invoke("music-activity-get"),
  setPetSleepState: (e) => n.send("pet-sleep-state", !!e),
  setMouseEventsEnabled: (e) => n.send("set-mouse-events-enabled", e),
  setPetFocusable: (e) => n.send("set-pet-focusable", e),
  showContextMenu: (e) => n.send("show-context-menu", e),
  setStretchMode: (e) => n.send("set-stretch-mode", e),
  setHuntingMode: (e) => n.send("set-hunting-mode", e),
  shareCaptureOptions: (e) => n.invoke("share-capture-options", e),
  shareCaptureStarted: () => n.invoke("share-capture-started"),
  shareCaptureOverlayHide: () => n.invoke("share-capture-overlay-hide"),
  shareVideoSave: (e) => n.invoke("share-video-save", e),
  sharePetSnapshotSave: () => n.invoke("share-pet-snapshot-save"),
  shareErrorDialog: (e) => n.invoke("share-error-dialog", e),
  userNameGet: () => n.invoke("user-name-get"),
  userNameSet: (e) => n.invoke("user-name-set", e),
  onUserNameEdit: (e) => n.on("user-name-edit", (t, o) => e(o)),
  onUserNameChanged: (e) => n.on("user-name-changed", (t, o) => e(o)),
  catNameGet: () => n.invoke("cat-name-get"),
  catNameSet: (e) => n.invoke("cat-name-set", e),
  catNameVisibleSet: (e) => n.invoke("cat-name-visible-set", e),
  fixedMessageGet: () => n.invoke("fixed-message-get"),
  fixedMessageSet: (e) => n.invoke("fixed-message-set", e),
  onFixedMessageEdit: (e) => n.on("fixed-message-edit", (t, o) => e(o)),
  onFixedMessageChanged: (e) => n.on("fixed-message-changed", (t, o) => e(o)),
  catNamePromptShown: () => n.invoke("cat-name-prompt-shown"),
  taskCompleteSoundVolumeGet: () => n.invoke("task-complete-sound-volume-get"),
  taskCompleteSoundVolumeSet: (e) =>
    n.invoke("task-complete-sound-volume-set", e),
  soundMutedGet: () => n.invoke("sound-muted-get"),
  soundMutedSet: (e) => n.invoke("sound-muted-set", e),
  attentionRequestsGet: () => n.invoke("attention-requests-get"),
  attentionRequestsSet: (e) => n.invoke("attention-requests-set", e),
  attentionRequestIntervalGet: () =>
    n.invoke("attention-requests-interval-get"),
  attentionRequestIntervalSet: (e) =>
    n.invoke("attention-requests-interval-set", e),
  onAttentionRequestsEnabled: (e) =>
    n.on("attention-requests-enabled", (t, o) => e(o)),
  onAttentionRequestInterval: (e) =>
    n.on("attention-requests-interval", (t, o) => e(o)),
  macosPermissionsGet: () => n.invoke("macos-permissions-get"),
  macosPermissionsOpen: (e) => n.invoke("macos-permissions-open", e),
  allowAnalysisGet: () => n.invoke("allow-analysis-get"),
  allowAnalysisSet: (e) => n.invoke("allow-analysis-set", e),
  agentMonitoringGet: (e) => n.invoke("agent-monitoring-get", e),
  agentMonitoringSet: (e, t) => n.invoke("agent-monitoring-set", e, t),
  networkOnline: () => n.send("network-online"),
  networkStatus: (e) => n.send("network-status", !!e),
  analyticsCapture: (e, t) => n.invoke("analytics-capture", e, t),
  patternGet: () => n.invoke("pattern-get"),
  patternPreview: (e) => n.send("pattern-preview", e),
  patternSet: (e) => n.send("pattern-set", e),
  patternPresetsGet: () => n.invoke("pattern-presets-get"),
  patternCustomPresetSave: (e) => n.invoke("pattern-custom-preset-save", e),
  patternCustomPresetDelete: (e) => n.invoke("pattern-custom-preset-delete", e),
  patternCustomPresetRename: (e) => n.invoke("pattern-custom-preset-rename", e),
  patternCustomPresetsExport: (e) =>
    n.invoke("pattern-custom-presets-export", e),
  patternCustomPresetsImport: () => n.invoke("pattern-custom-presets-import"),
  patternAiTemplateSave: () => n.invoke("pattern-ai-template-save"),
  patternConfirmClearAll: (e) => n.invoke("pattern-confirm-clear-all", e),
  patternConfirmDeletePreset: (e) =>
    n.invoke("pattern-confirm-delete-preset", e),
  patternConfirmDiscardChanges: (e) =>
    n.invoke("pattern-confirm-discard-changes", e),
  onPatternChanged: (e) => n.on("pattern-changed", (t, o) => e(o)),
  onPatternPresetsChanged: (e) => n.on("pattern-presets-changed", () => e()),
  openPatternEditor: () => n.send("open-pattern-editor"),
  openSkinGallery: () => n.send("open-skin-gallery"),
  openMappingEditor: () => n.send("open-mapping-editor"),
  mappingLoad: () => n.invoke("mapping-load"),
  mappingSave: (e) => n.invoke("mapping-save", e),
  svgLoad: (e) => n.invoke("svg-load", e),
  languageGet: () => n.invoke("language-get"),
  languageSet: (e) => n.invoke("language-set", e),
  onLanguageChanged: (e) => n.on("language-changed", (t, o) => e(o)),
});
