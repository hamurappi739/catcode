"use strict";

const PRIVACY_PANES = Object.freeze({
  accessibility: "Privacy_Accessibility",
  inputMonitoring: "Privacy_ListenEvent",
  screenRecording: "Privacy_ScreenCapture",
});

function privacyPaneUrl(pane) {
  const paneId = PRIVACY_PANES[pane];
  return paneId
    ? `x-apple.systempreferences:com.apple.preference.security?${paneId}`
    : "";
}

function createMacOsSupport({
  platform = process.platform,
  shell,
  systemPreferences,
  logWarn = console.warn,
} = {}) {
  const isMac = platform === "darwin";

  function getStatus() {
    if (!isMac) {
      return {
        isMac: false,
        accessibility: "not-applicable",
        inputMonitoring: "not-applicable",
        screenRecording: "not-applicable",
      };
    }

    let accessibility = "unknown";
    let screenRecording = "unknown";

    try {
      accessibility = systemPreferences.isTrustedAccessibilityClient(false)
        ? "granted"
        : "denied";
    } catch (error) {
      logWarn("[CatCode] macOS Accessibility status check failed:", error);
    }

    try {
      screenRecording = systemPreferences.getMediaAccessStatus("screen");
    } catch (error) {
      logWarn("[CatCode] macOS Screen Recording status check failed:", error);
    }

    return {
      isMac: true,
      accessibility,
      // macOS does not expose a public status API for Input Monitoring.
      inputMonitoring: "unknown",
      screenRecording,
    };
  }

  async function openPrivacyPane(pane) {
    const url = isMac ? privacyPaneUrl(pane) : "";
    if (!url || !shell || typeof shell.openExternal !== "function") {
      return { ok: false, reason: isMac ? "invalid-pane" : "not-macos" };
    }

    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (error) {
      logWarn("[CatCode] failed to open macOS privacy settings:", error);
      return { ok: false, reason: "open-failed" };
    }
  }

  return {
    isMac,
    getStatus,
    openPrivacyPane,
  };
}

module.exports = {
  PRIVACY_PANES,
  privacyPaneUrl,
  createMacOsSupport,
};
