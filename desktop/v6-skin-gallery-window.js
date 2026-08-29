"use strict";

function createSkinGalleryWindowController({
  BrowserWindow,
  runtimePath,
  preloadPath,
  appIconPath,
  t,
  updateDockVisibility,
  getSkinGalleryWindow,
  setSkinGalleryWindow,
} = {}) {
  function bringSkinGalleryToFront() {
    const window = getSkinGalleryWindow();
    if (!window || window.isDestroyed()) return;
    try {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      if (typeof window.moveTop === "function") window.moveTop();
      window.setAlwaysOnTop(true, "floating");
      window.setAlwaysOnTop(false);
      window.focus();
    } catch (_) {}
  }

  function openSkinGallery() {
    const existing = getSkinGalleryWindow();
    if (existing && !existing.isDestroyed()) {
      if (typeof updateDockVisibility === "function") updateDockVisibility();
      bringSkinGalleryToFront();
      return existing;
    }
    const window = new BrowserWindow({
      width: 760,
      height: 640,
      minWidth: 560,
      minHeight: 480,
      title: t("catSkinsTitle"),
      backgroundColor: "#141820",
      icon: appIconPath,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    setSkinGalleryWindow(window);
    if (typeof updateDockVisibility === "function") updateDockVisibility();
    window.setMenu(null);
    window.loadFile(runtimePath("renderer", "skins", "index.html"));
    window.once("ready-to-show", bringSkinGalleryToFront);
    window.on("closed", () => {
      if (getSkinGalleryWindow() === window) setSkinGalleryWindow(null);
      if (typeof updateDockVisibility === "function") updateDockVisibility();
    });
    return window;
  }

  return { bringSkinGalleryToFront, openSkinGallery };
}

module.exports = { createSkinGalleryWindowController };
