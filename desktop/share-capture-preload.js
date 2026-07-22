"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shareCaptureOverlay", {
  onCropUpdate: (listener) => {
    if (typeof listener !== "function") return () => {};

    const handler = (_event, crop) => listener(crop);
    ipcRenderer.on("share-crop-update", handler);
    return () => ipcRenderer.removeListener("share-crop-update", handler);
  },
  cancel: () => ipcRenderer.send("share-capture-cancel"),
});
