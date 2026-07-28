"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("onboardingAPI", {
  platform: process.platform,
  complete: () => ipcRenderer.invoke("onboarding-complete"),
  skip: () => ipcRenderer.invoke("onboarding-skip"),
  openCatEditor: () => ipcRenderer.invoke("onboarding-open-cat-editor"),
  macosPermissionsGet: () => ipcRenderer.invoke("macos-permissions-get"),
  macosPermissionsOpen: (pane) =>
    ipcRenderer.invoke("macos-permissions-open", pane),
});
