"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  privacyPaneUrl,
  createMacOsSupport,
} = require("../macos-support");

test("macOS privacy settings only accept known panes", () => {
  assert.equal(
    privacyPaneUrl("accessibility"),
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  );
  assert.equal(
    privacyPaneUrl("inputMonitoring"),
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
  );
  assert.equal(
    privacyPaneUrl("screenRecording"),
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  );
  assert.equal(privacyPaneUrl("anything-else"), "");
});

test("macOS permission status delegates to Electron systemPreferences", () => {
  const support = createMacOsSupport({
    platform: "darwin",
    shell: {},
    systemPreferences: {
      isTrustedAccessibilityClient: (prompt) => {
        assert.equal(prompt, false);
        return true;
      },
      getMediaAccessStatus: (mediaType) => {
        assert.equal(mediaType, "screen");
        return "denied";
      },
    },
  });

  assert.deepEqual(support.getStatus(), {
    isMac: true,
    accessibility: "granted",
    inputMonitoring: "unknown",
    screenRecording: "denied",
  });
});

test("privacy settings are opened only on macOS", async () => {
  const opened = [];
  const macSupport = createMacOsSupport({
    platform: "darwin",
    shell: {
      openExternal: async (url) => opened.push(url),
    },
    systemPreferences: {},
  });
  const windowsSupport = createMacOsSupport({
    platform: "win32",
    shell: {
      openExternal: async (url) => opened.push(url),
    },
    systemPreferences: {},
  });

  assert.deepEqual(await macSupport.openPrivacyPane("accessibility"), {
    ok: true,
  });
  assert.equal(opened.length, 1);
  assert.deepEqual(await macSupport.openPrivacyPane("invalid"), {
    ok: false,
    reason: "invalid-pane",
  });
  assert.deepEqual(await windowsSupport.openPrivacyPane("accessibility"), {
    ok: false,
    reason: "not-macos",
  });
  assert.equal(opened.length, 1);
});
