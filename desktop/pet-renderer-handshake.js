"use strict";

/**
 * Per-webContents pet renderer readiness for cursor-pos delivery.
 * Main must not send cursor-pos until a matching V6 ready ack is stored.
 */

const PET_RENDERER_READY_CHANNEL = "pet-renderer-ready";
const PET_RENDERER_READY_PROTOCOL = 1;
const PET_RENDERER_READY_MODEL = "v6";

/** @type {Map<number, { model: string, protocol: number, at: number }>} */
const readyByWebContentsId = new Map();

function normalizeReadyPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const model = String(payload.model || "").slice(0, 16);
  const protocol = Number(payload.protocol);
  if (model !== PET_RENDERER_READY_MODEL) return null;
  if (!Number.isFinite(protocol) || protocol !== PET_RENDERER_READY_PROTOCOL) {
    return null;
  }
  return { model, protocol };
}

function markPetRendererReady(webContentsId, payload, now = Date.now) {
  const id = Number(webContentsId);
  if (!Number.isFinite(id)) return false;
  const normalized = normalizeReadyPayload(payload);
  if (!normalized) return false;
  readyByWebContentsId.set(id, { ...normalized, at: now() });
  return true;
}

function clearPetRendererReady(webContentsId) {
  const id = Number(webContentsId);
  if (!Number.isFinite(id)) return;
  readyByWebContentsId.delete(id);
}

function clearAllPetRendererReady() {
  readyByWebContentsId.clear();
}

function isPetRendererReady(webContentsId) {
  const id = Number(webContentsId);
  if (!Number.isFinite(id)) return false;
  const entry = readyByWebContentsId.get(id);
  return !!(
    entry &&
    entry.model === PET_RENDERER_READY_MODEL &&
    entry.protocol === PET_RENDERER_READY_PROTOCOL
  );
}

function getPetRendererReady(webContentsId) {
  const id = Number(webContentsId);
  if (!Number.isFinite(id)) return null;
  return readyByWebContentsId.get(id) || null;
}

module.exports = {
  PET_RENDERER_READY_CHANNEL,
  PET_RENDERER_READY_PROTOCOL,
  PET_RENDERER_READY_MODEL,
  normalizeReadyPayload,
  markPetRendererReady,
  clearPetRendererReady,
  clearAllPetRendererReady,
  isPetRendererReady,
  getPetRendererReady,
};
