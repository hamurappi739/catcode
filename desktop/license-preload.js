"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("licenseAPI", {
  activate: (key) => ipcRenderer.invoke("license-activate", String(key || "")),
});
