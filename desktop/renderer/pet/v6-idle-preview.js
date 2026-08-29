"use strict";

// V6-M0: opt-in idle preview with a one-shot model latch. Main decides via
// query (?v6IdlePreview=1). This script latches data-catcode-model before later
// V4 palette/pose work can run, and rejects silent V6→V4 overwrites.
(() => {
  const MODEL_V6 = "v6-idle-preview";
  const previewEnabled =
    new URLSearchParams(window.location.search).get("v6IdlePreview") === "1";
  if (!previewEnabled) return;

  const body = document.body;
  if (!body) return;

  const preview = document.getElementById("v6-idle-preview");
  if (!preview || !preview.dataset.src) return;

  let alphaPixels = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let latchObserver = null;

  function setStatus(status) {
    body.dataset.v6IdleStatus = status;
  }

  function latchModel() {
    body.dataset.catcodeModel = MODEL_V6;
    body.dataset.v6IdlePreview = "1";
    body.dataset.catcodeModelLatched = "1";
    if (!body.dataset.v6Pose) body.dataset.v6Pose = "idle";
  }

  function installLatchGuard() {
    if (latchObserver || typeof MutationObserver !== "function") return;
    latchObserver = new MutationObserver(() => {
      if (body.dataset.catcodeModelLatched !== "1") return;
      if (body.dataset.catcodeModel === MODEL_V6) return;
      // Reject silent fallback to V4 (or any other model) while latched.
      body.dataset.catcodeModel = MODEL_V6;
      body.dataset.v6IdlePreview = "1";
    });
    latchObserver.observe(body, {
      attributes: true,
      attributeFilter: ["data-catcode-model"],
    });
  }

  function cacheOpaquePixels() {
    if (!preview.naturalWidth || !preview.naturalHeight) return false;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = preview.naturalWidth;
      canvas.height = preview.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return false;

      context.drawImage(preview, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      alphaPixels = new Uint8Array(canvas.width * canvas.height);
      for (
        let sourceIndex = 3, targetIndex = 0;
        sourceIndex < rgba.length;
        sourceIndex += 4
      ) {
        alphaPixels[targetIndex] = rgba[sourceIndex];
        targetIndex += 1;
      }
      imageWidth = canvas.width;
      imageHeight = canvas.height;
      preview.dataset.v6HitReady = "1";
      return true;
    } catch (_) {
      return false;
    }
  }

  function isOpaqueHitPoint(clientX, clientY) {
    const pose =
      typeof window !== "undefined" ? window.CatCodeV6VisualPose : null;
    if (pose && typeof pose.isOpaqueHitPoint === "function") {
      return pose.isOpaqueHitPoint(clientX, clientY);
    }
    if (!alphaPixels || !imageWidth || !imageHeight) return false;
    const rect = preview.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      clientX < rect.left ||
      clientX >= rect.right ||
      clientY < rect.top ||
      clientY >= rect.bottom
    ) {
      return false;
    }
    const x = Math.min(
      imageWidth - 1,
      Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * imageWidth)),
    );
    const y = Math.min(
      imageHeight - 1,
      Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * imageHeight)),
    );
    return alphaPixels[y * imageWidth + x] >= 128;
  }

  // Latch immediately — before renderer.js can applyPalette / pose observers.
  latchModel();
  setStatus("loading");
  installLatchGuard();

  window.CatCodeV6IdlePreview = {
    isEnabled: () => true,
    isLatched: () => body.dataset.catcodeModelLatched === "1",
    getStatus: () => body.dataset.v6IdleStatus || "",
    isOpaqueHitPoint,
  };

  preview.addEventListener(
    "load",
    () => {
      latchModel();
      cacheOpaquePixels();
      setStatus("ready");
    },
    { once: true },
  );
  preview.addEventListener(
    "error",
    () => {
      // Keep V6 latched. Never fall back to the black V4 cat.
      latchModel();
      setStatus("error");
      preview.hidden = false;
    },
    { once: true },
  );

  if (window.CatCodeV6Skin && typeof window.CatCodeV6Skin.setHostSource === "function") {
    window.CatCodeV6Skin.setHostSource(preview);
  } else {
    preview.src = preview.dataset.src;
  }
  preview.hidden = false;
})();
