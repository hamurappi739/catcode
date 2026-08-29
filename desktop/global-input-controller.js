"use strict";

/**
 * V6-INPUT-M0/M6: global keyboard/wheel availability controller.
 * State: idle -> starting -> available | unavailable
 * No background setInterval retry. Manual retry only.
 *
 * Windows (M6): packaged native-input-bridge.exe over ACL'd named pipe.
 * Non-Windows: existing uiohook-napi path (unchanged).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  createNativeBridgeSession,
  resolveNativeBridgeExePath,
  PROTOCOL_VERSION: BRIDGE_PROTOCOL_VERSION,
  PRIVACY_CONTRACT_VERSION: BRIDGE_PRIVACY_CONTRACT_VERSION,
} = require("./native-input-bridge-client");

const STATES = Object.freeze({
  IDLE: "idle",
  STARTING: "starting",
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
});

const DIAG_FLAG = "--catcode-input-hook-diagnostics";
const DIAG_MAX_BYTES = 256 * 1024;
const DIAG_KEEP_BYTES = 128 * 1024;
const DIAG_HISTORY_CAP = 40;

const SENSITIVE_FIELD_DENYLIST = [
  "keycode",
  "keyCode",
  "rawcode",
  "key",
  "code",
  "text",
  "typed",
  "clipboard",
  "title",
  "windowTitle",
  "cursor",
  "clientX",
  "clientY",
  "screenX",
  "screenY",
  "token",
];

function isEscapeKeyInput(t = {}) {
  const e = String(t.key || t.code || "").toLowerCase();
  const r = Number(t.keycode || t.rawcode || t.keyCode);
  return e === "escape" || e === "esc" || r === 1 || r === 53 || r === 27;
}

function isInputHookDiagnosticsEnabled(argv = process.argv, commandLine) {
  if (Array.isArray(argv) && argv.includes(DIAG_FLAG)) return true;
  try {
    if (
      commandLine &&
      typeof commandLine.hasSwitch === "function" &&
      commandLine.hasSwitch("catcode-input-hook-diagnostics")
    ) {
      return true;
    }
  } catch (_) {}
  return false;
}

function sanitizeError(err) {
  if (!err) return { message: null, code: null };
  const message =
    typeof err.message === "string"
      ? err.message.slice(0, 240)
      : String(err).slice(0, 240);
  const code =
    err && typeof err.code === "string"
      ? err.code.slice(0, 120)
      : err && err.code != null
        ? String(err.code).slice(0, 120)
        : null;
  return { message, code };
}

function resolveUiohookNodePath() {
  try {
    const pkgRoot = path.dirname(require.resolve("uiohook-napi/package.json"));
    const nodePath = path.join(
      pkgRoot,
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "uiohook-napi.node",
    );
    return {
      packageRoot: pkgRoot,
      nodePath,
      nodeExists: fs.existsSync(nodePath),
    };
  } catch (err) {
    return {
      packageRoot: null,
      nodePath: null,
      nodeExists: false,
      resolveError: sanitizeError(err).message,
    };
  }
}

function createDiagnosticsWriter({
  enabled,
  app,
  fsModule = fs,
  pathModule = path,
  now = () => Date.now(),
}) {
  if (!enabled) {
    return {
      enabled: false,
      write() {},
      path: null,
    };
  }

  let filePath = null;
  try {
    const userData =
      app && typeof app.getPath === "function"
        ? app.getPath("userData")
        : pathModule.join(os.homedir(), "AppData", "Roaming", "CatCode");
    const logsDir = pathModule.join(userData, "logs");
    fsModule.mkdirSync(logsDir, { recursive: true });
    filePath = pathModule.join(logsDir, "v6-input-hook-diagnostics.jsonl");
  } catch (_) {
    filePath = null;
  }

  function rotateIfNeeded() {
    if (!filePath) return;
    try {
      if (!fsModule.existsSync(filePath)) return;
      const st = fsModule.statSync(filePath);
      if (st.size <= DIAG_MAX_BYTES) return;
      const raw = fsModule.readFileSync(filePath);
      const kept = raw.slice(Math.max(0, raw.length - DIAG_KEEP_BYTES));
      const start = kept.indexOf(0x0a);
      const trimmed = start >= 0 ? kept.slice(start + 1) : kept;
      fsModule.writeFileSync(filePath, trimmed);
    } catch (_) {}
  }

  function write(record) {
    if (!filePath) return;
    try {
      for (const bad of SENSITIVE_FIELD_DENYLIST) {
        if (Object.prototype.hasOwnProperty.call(record, bad)) {
          delete record[bad];
        }
      }
      rotateIfNeeded();
      fsModule.appendFileSync(
        filePath,
        `${JSON.stringify({ ts: new Date(now()).toISOString(), ...record })}\n`,
        "utf8",
      );
    } catch (_) {}
  }

  return { enabled: true, write, path: filePath };
}

function resolveInputBackend({
  platform = process.platform,
  inputBackend = null,
} = {}) {
  if (inputBackend === "uiohook" || inputBackend === "native-bridge") {
    return inputBackend;
  }
  return platform === "win32" ? "native-bridge" : "uiohook";
}

function createGlobalInputController({
  isMac,
  appIconPath,
  globalShortcut,
  shell,
  systemPreferences,
  dialog,
  nativeImage,
  logInfo,
  logWarn,
  t,
  releaseBuildExcludesDevOptions,
  triggerJumpSequence,
  cancelCoveringMotion,
  cancelPlayfulMovement,
  getPetWindow,
  onGlobalActivity,
  dismissOutsideClickMenus = null,
  isPointInsideBounds = null,
  app = null,
  diagnosticsEnabled = false,
  requireUiohook = () => require("uiohook-napi"),
  onAvailabilityChanged = null,
  resourcesPath = process.resourcesPath || null,
  platform = process.platform,
  inputBackend = null,
  createBridgeSession = createNativeBridgeSession,
  appDir = null,
} = {}) {
  const backend = resolveInputBackend({ platform, inputBackend });
  let uIOhook = null;
  let moduleLoadError = null;
  let state = STATES.IDLE;
  let listenersAttached = false;
  let sessionWarningShown = false;
  let lastError = { message: null, code: null };
  let attemptNumber = 0;
  const attemptHistory = [];
  let bridgeSession = null;
  let bridgeStartGeneration = 0;
  let uiohookStartedOnWindows = false;

  const diagnostics = createDiagnosticsWriter({
    enabled: !!diagnosticsEnabled,
    app,
  });

  // Windows production path must not start uiohook-napi.
  if (backend === "uiohook") {
    try {
      ({ uIOhook } = requireUiohook());
    } catch (err) {
      moduleLoadError = sanitizeError(err);
      if (typeof logWarn === "function") {
        logWarn(
          "[CatCode] uiohook-napi is unavailable:",
          moduleLoadError.message,
        );
      }
    }
  }

  function emitAvailabilityChanged() {
    if (typeof onAvailabilityChanged === "function") {
      try {
        onAvailabilityChanged(state);
      } catch (_) {}
    }
  }

  function setState(next) {
    if (state === next) return;
    state = next;
    emitAvailabilityChanged();
  }

  function recordAttempt(source, outcome, err, extra = {}) {
    attemptNumber += 1;
    const sanitized = sanitizeError(err);
    if (outcome === "failure") lastError = sanitized;
    if (outcome === "success") lastError = { message: null, code: null };
    attemptHistory.push({
      n: attemptNumber,
      source,
      outcome,
      code: sanitized.code,
      message: sanitized.message,
      backend,
    });
    while (attemptHistory.length > DIAG_HISTORY_CAP) attemptHistory.shift();

    const resolved = backend === "uiohook" ? resolveUiohookNodePath() : {
      packageRoot: null,
      nodePath: null,
      nodeExists: false,
    };
    const bridgePath =
      backend === "native-bridge"
        ? resolveNativeBridgeExePath({ resourcesPath, appDir })
        : null;
    diagnostics.write({
      event: "attempt",
      source,
      state,
      outcome,
      attemptNumber,
      errorCode: sanitized.code,
      errorMessage: sanitized.message,
      platform,
      arch: process.arch,
      electronVersion: process.versions && process.versions.electron,
      nodeVersion: process.versions && process.versions.node,
      resourcesPath: resourcesPath || null,
      inputBackend: backend,
      bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
      bridgePrivacyContractVersion: BRIDGE_PRIVACY_CONTRACT_VERSION,
      bridgeExePath: bridgePath,
      bridgeExeExists: !!(bridgePath && fs.existsSync(bridgePath)),
      uiohookPackageRoot: resolved.packageRoot,
      uiohookNodePath: resolved.nodePath,
      uiohookNodeExists: resolved.nodeExists,
      moduleLoaded: !!uIOhook,
      uiohookStartedOnWindows,
      startSucceeded: outcome === "success",
      ...extra,
    });
  }

  function registerGlobalShortcuts() {
    globalShortcut.unregister("CommandOrControl+-");
    globalShortcut.unregister("CommandOrControl+=");
    globalShortcut.unregister("CommandOrControl+0");
    globalShortcut.unregister("CommandOrControl+J");
    const pairs = [
      ...(typeof releaseBuildExcludesDevOptions === "function" &&
      releaseBuildExcludesDevOptions()
        ? []
        : [["CommandOrControl+J", () => triggerJumpSequence()]]),
    ];
    for (const [accel, fn] of pairs) {
      if (!globalShortcut.register(accel, fn)) {
        console.warn(`[CatCode] failed to register shortcut: ${accel}`);
      }
    }
  }

  function openMacPrivacy(pane) {
    if (!isMac) return;
    shell
      .openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`)
      .catch(() => {});
  }

  function isTrustedAccessibility() {
    if (!isMac) return true;
    try {
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch (err) {
      console.warn(
        "[CatCode] accessibility permission check failed:",
        err && err.message,
      );
      return false;
    }
  }

  function showMacAccessibilityDialog() {
    if (!isMac || sessionWarningShown) return;
    sessionWarningShown = true;
    setTimeout(async () => {
      try {
        const result = await dialog.showMessageBox({
          type: "info",
          title: t("accessibilityPermissionTitle"),
          message: t("accessibilityPermissionMessage"),
          detail: t("accessibilityPermissionDetail"),
          buttons: [t("openAccessibility"), t("later")],
          defaultId: 0,
          cancelId: 1,
        });
        if (result.response === 0) openMacPrivacy("Privacy_Accessibility");
      } catch (_) {}
    }, 800);
  }

  function showMacInputMonitoringDialog() {
    if (!isMac || sessionWarningShown) return;
    sessionWarningShown = true;
    setTimeout(async () => {
      try {
        const result = await dialog.showMessageBox({
          type: "info",
          title: t("inputPermissionTitle"),
          message: t("inputPermissionMessage"),
          detail: t("inputPermissionDetail"),
          buttons: [t("openInputMonitoring"), t("later")],
          defaultId: 0,
          cancelId: 1,
        });
        if (result.response === 0) openMacPrivacy("Privacy_ListenEvent");
      } catch (_) {}
    }, 800);
  }

  function showWindowsUnavailableDialog() {
    if (isMac || sessionWarningShown) return;
    sessionWarningShown = true;
    setTimeout(async () => {
      try {
        const result = await dialog.showMessageBox({
          type: "info",
          title: t("globalInputPermissionTitle"),
          message: t("globalInputPermissionMessage"),
          detail: t("globalInputPermissionDetail"),
          buttons: [t("retryInputMonitoring"), t("later")],
          defaultId: 0,
          cancelId: 1,
          icon: nativeImage.createFromPath(appIconPath),
        });
        if (result.response === 0) retryKeyHook();
      } catch (_) {}
    }, 800);
  }

  function showSessionUnavailableUi() {
    if (isMac) {
      if (isTrustedAccessibility()) showMacInputMonitoringDialog();
      else showMacAccessibilityDialog();
    } else {
      showWindowsUnavailableDialog();
    }
  }

  function emitKeyPressed() {
    if (typeof onGlobalActivity === "function") onGlobalActivity("keyboard");
    const win = getPetWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send("key-pressed");
  }

  function emitWheel(rotation) {
    if (typeof onGlobalActivity === "function") onGlobalActivity("wheel");
    const win = getPetWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send("mouse-wheel", {
      rotation: typeof rotation === "number" ? rotation : 0,
    });
  }

  function onWheel(event) {
    emitWheel(event && typeof event.rotation === "number" ? event.rotation : 0);
  }

  function onMouseUp(event) {
    if (typeof onGlobalActivity === "function") onGlobalActivity("mouse");
    if (
      dismissOutsideClickMenus &&
      typeof dismissOutsideClickMenus.dismissSoon === "function"
    ) {
      dismissOutsideClickMenus.dismissSoon();
    }
    const win = getPetWindow();
    if (!win || win.isDestroyed()) return;
    let bounds;
    try {
      bounds = win.getBounds();
    } catch (_) {
      return;
    }
    let inside = false;
    if (typeof isPointInsideBounds === "function") {
      inside = !!isPointInsideBounds(event, bounds);
    } else if (
      event &&
      typeof event.x === "number" &&
      typeof event.y === "number"
    ) {
      inside =
        event.x >= bounds.x &&
        event.y >= bounds.y &&
        event.x < bounds.x + bounds.width &&
        event.y < bounds.y + bounds.height;
    }
    if (!inside) win.webContents.send("dismiss-transient-ui");
  }

  function attachListenersOnce() {
    if (listenersAttached || !uIOhook) return;
    uIOhook.on("keydown", (event) => {
      if (isEscapeKeyInput(event)) {
        if (typeof cancelCoveringMotion === "function") cancelCoveringMotion();
        if (typeof cancelPlayfulMovement === "function") cancelPlayfulMovement();
        return;
      }
      emitKeyPressed();
    });
    uIOhook.on("input", (event) => {
      if (event && event.type === 11) onWheel(event);
    });
    uIOhook.on("mouseup", onMouseUp);
    listenersAttached = true;
  }

  function markUnavailable(source, err, { showUi } = { showUi: true }) {
    const sanitized = sanitizeError(err);
    lastError = sanitized;
    setState(STATES.UNAVAILABLE);
    if (typeof logWarn === "function") {
      logWarn("[CatCode] global key hook unavailable:", {
        message: sanitized.message,
        code: sanitized.code,
        source,
        backend,
      });
    } else {
      console.warn(
        "[CatCode] global key hook unavailable:",
        sanitized.message,
      );
    }
    if (showUi) showSessionUnavailableUi();
    diagnostics.write({
      event: "state",
      source,
      state: STATES.UNAVAILABLE,
      errorCode: sanitized.code,
      errorMessage: sanitized.message,
      inputBackend: backend,
    });
  }

  function ensureBridgeSession() {
    if (bridgeSession) return bridgeSession;
    bridgeSession = createBridgeSession({
      resourcesPath,
      appDir: appDir || path.join(__dirname),
      logWarn,
      onKeyPulse: () => {
        if (state !== STATES.AVAILABLE) return;
        emitKeyPressed();
      },
      onWheelPulse: (direction) => {
        if (state !== STATES.AVAILABLE) return;
        emitWheel(direction);
      },
      onDisconnected: (err) => {
        if (state === STATES.AVAILABLE || state === STATES.STARTING) {
          recordAttempt("bridge-disconnect", "failure", err || {
            message: "bridge disconnected",
            code: "BRIDGE_DISCONNECTED",
          });
          markUnavailable("bridge-disconnect", err || {
            message: "bridge disconnected",
            code: "BRIDGE_DISCONNECTED",
          });
        }
      },
    });
    return bridgeSession;
  }

  async function startNativeBridge(source) {
    const generation = ++bridgeStartGeneration;
    const session = ensureBridgeSession();
    try {
      // Tear down any prior helper before a new epoch.
      await session.stop({ silent: true });
      if (generation !== bridgeStartGeneration) return false;

      const info = await session.start();
      if (generation !== bridgeStartGeneration) {
        await session.stop({ silent: true });
        return false;
      }

      // Do not claim available until hello + hooks succeeded (session.start).
      setState(STATES.AVAILABLE);
      recordAttempt(source, "success", null, {
        bridgeHelperVersion: info.helperVersion || null,
        bridgeKeyboardOk: !!info.keyboardOk,
        bridgeMouseOk: !!info.mouseOk,
        pipeNameRecorded: false,
      });
      if (typeof logInfo === "function") {
        logInfo("[CatCode] native input bridge started");
      } else {
        console.log("[CatCode] native input bridge started");
      }
      diagnostics.write({
        event: "state",
        source,
        state: STATES.AVAILABLE,
        attemptNumber,
        inputBackend: backend,
        bridgeHelperVersion: info.helperVersion || null,
        startSucceeded: true,
        uiohookStartedOnWindows: false,
      });
      return true;
    } catch (err) {
      if (generation !== bridgeStartGeneration) return false;
      recordAttempt(source, "failure", err);
      markUnavailable(source, err);
      return false;
    }
  }

  function startKeyHook(source = "startup") {
    if (state === STATES.AVAILABLE || state === STATES.STARTING) {
      return state === STATES.AVAILABLE;
    }

    setState(STATES.STARTING);
    diagnostics.write({
      event: "state",
      source,
      state: STATES.STARTING,
      attemptNumber: attemptNumber + 1,
      inputBackend: backend,
    });

    if (backend === "native-bridge") {
      // Async connect/handshake; availability flips when hello+hooks succeed.
      startNativeBridge(source);
      return false;
    }

    if (!uIOhook) {
      recordAttempt(source, "failure", moduleLoadError || {
        message: "uiohook-napi is not loaded",
        code: "MODULE_UNAVAILABLE",
      });
      markUnavailable(source, moduleLoadError || {
        message: "uiohook-napi is not loaded",
        code: "MODULE_UNAVAILABLE",
      });
      return false;
    }

    if (isMac) {
      if (!isTrustedAccessibility()) showMacAccessibilityDialog();
    }

    try {
      attachListenersOnce();
      uIOhook.start();
      if (platform === "win32") uiohookStartedOnWindows = true;
      setState(STATES.AVAILABLE);
      recordAttempt(source, "success", null);
      if (typeof logInfo === "function") {
        logInfo("[CatCode] global input hook started");
      } else {
        console.log("[CatCode] global input hook started");
      }
      diagnostics.write({
        event: "state",
        source,
        state: STATES.AVAILABLE,
        attemptNumber,
        moduleLoaded: true,
        startSucceeded: true,
        inputBackend: backend,
      });
      return true;
    } catch (err) {
      recordAttempt(source, "failure", err);
      markUnavailable(source, err);
      return false;
    }
  }

  function retryKeyHook() {
    if (state === STATES.STARTING) return false;
    if (state === STATES.AVAILABLE) return true;
    // Clear only transient attempt posture; keep sessionWarningShown so UI
    // is not spammed. Allow another start from unavailable/idle.
    if (state === STATES.UNAVAILABLE || state === STATES.IDLE) {
      state = STATES.IDLE;
    }
    return startKeyHook("manual-retry");
  }

  function stopKeyHook() {
    bridgeStartGeneration += 1;
    if (backend === "native-bridge" && bridgeSession) {
      bridgeSession.stop({ silent: true }).catch(() => {});
    }
    if (state === STATES.AVAILABLE && uIOhook && backend === "uiohook") {
      try {
        uIOhook.stop();
      } catch (_) {}
    }
    setState(STATES.IDLE);
    diagnostics.write({
      event: "state",
      source: "stop",
      state: STATES.IDLE,
      inputBackend: backend,
    });
  }

  return {
    STATES,
    registerGlobalShortcuts,
    startKeyHook: () => startKeyHook("startup"),
    retryKeyHook,
    stopKeyHook,
    getState: () => state,
    getAvailabilityState: () => state,
    isAvailable: () => state === STATES.AVAILABLE,
    isUnavailable: () => state === STATES.UNAVAILABLE,
    getLastError: () => ({ ...lastError }),
    getAttemptHistory: () => attemptHistory.slice(),
    getInputBackend: () => backend,
    diagnosticsEnabled: diagnostics.enabled,
    diagnosticsPath: diagnostics.path,
  };
}

module.exports = {
  STATES,
  DIAG_FLAG,
  DIAG_MAX_BYTES,
  SENSITIVE_FIELD_DENYLIST,
  isEscapeKeyInput,
  isInputHookDiagnosticsEnabled,
  sanitizeError,
  resolveUiohookNodePath,
  resolveInputBackend,
  createDiagnosticsWriter,
  createGlobalInputController,
};
