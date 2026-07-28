"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const API_BASE_URL = "https://catcode-license-739.duckdns.org";
const ENTITLEMENT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAQeCKmDE0RR3SbC+Q1UVFPbpdGUnfrPpZM9HHddI3AgQ=
-----END PUBLIC KEY-----`;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), { mode: 0o600 });
}

function removeFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function verifyEntitlement(token, now = Date.now(), publicKey = ENTITLEMENT_PUBLIC_KEY) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (header.alg !== "EdDSA" || payload.iss !== "catcode-license-api" || payload.aud !== "catcode-desktop") return null;
    const signed = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
    const signature = Buffer.from(encodedSignature, "base64url");
    if (!crypto.verify(null, signed, publicKey, signature)) return null;
    if (!Number.isInteger(payload.nbf) || !Number.isInteger(payload.exp) || payload.nbf > Math.floor(now / 1000) + 30 || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function createLicenseService({ app, isMac, isWindows, logWarn, t, fetchImpl = global.fetch, safeStorage } = {}) {
  const storage = safeStorage || require("electron").safeStorage;
  const translate = typeof t === "function" ? t : (key) => key;
  const licensePath = () => path.join(app.getPath("userData"), "license.json");
  const installationPath = () => path.join(app.getPath("userData"), "installation.json");

  function deviceName() {
    return `CatCode ${isMac ? "macOS" : isWindows ? "Windows" : process.platform}`;
  }

  function installationId() {
    const saved = readJson(installationPath());
    if (saved && typeof saved.id === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(saved.id)) return saved.id;
    const id = crypto.randomUUID().replace(/-/g, "");
    writeJson(installationPath(), { v: 1, id });
    return id;
  }

  function loadStoredLicense() {
    const value = readJson(licensePath());
    return value && value.v === 2 && typeof value.deviceId === "string" && typeof value.refreshToken === "string" && typeof value.entitlement === "string" ? value : null;
  }

  function encryptRefreshToken(value) {
    if (!storage || !storage.isEncryptionAvailable || !storage.isEncryptionAvailable()) {
      const error = new Error("Secure operating-system storage is unavailable");
      error.code = "LICENSE_SECURE_STORAGE_UNAVAILABLE";
      throw error;
    }
    return storage.encryptString(value).toString("base64");
  }

  function decryptRefreshToken(value) {
    try {
      if (!storage || !storage.isEncryptionAvailable || !storage.isEncryptionAvailable()) return null;
      return storage.decryptString(Buffer.from(value, "base64"));
    } catch {
      return null;
    }
  }

  async function request(endpoint, body) {
    let response;
    try {
      response = await fetchImpl(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      const error = new Error(translate("licenseNetworkFailed"));
      error.code = "LICENSE_NETWORK_FAILED";
      error.cause = cause;
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    const error = new Error(typeof payload.error === "string" ? payload.error : `license_http_${response.status}`);
    error.code = error.message;
    error.statusCode = response.status;
    throw error;
  }

  function entitlementFor(response, expectedDeviceId) {
    const payload = verifyEntitlement(response && response.entitlement);
    if (!payload || !response || !response.device || payload.device_id !== response.device.id || (expectedDeviceId && payload.device_id !== expectedDeviceId)) {
      const error = new Error("invalid_entitlement");
      error.code = "invalid_entitlement";
      throw error;
    }
    return payload;
  }

  function saveResponse(response, refreshToken) {
    const entitlement = entitlementFor(response);
    const record = {
      v: 2,
      deviceId: response.device.id,
      refreshToken: encryptRefreshToken(refreshToken),
      entitlement: response.entitlement,
      entitlementExpiresAt: response.entitlementExpiresAt,
      productName: response.license && response.license.productCode ? response.license.productCode : null,
      activatedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
      licenseId: entitlement.sub,
    };
    writeJson(licensePath(), record);
    return record;
  }

  function publicLicense(record) {
    if (!record) return null;
    return { productName: record.productName, activatedAt: record.activatedAt, lastValidatedAt: record.lastValidatedAt, entitlementExpiresAt: record.entitlementExpiresAt };
  }

  function licenseRecoveryReasonFromMessage(value) {
    const reason = String(value || "").toLowerCase();
    if (reason.includes("device_limit")) return "limit";
    if (/license_(invalid|revoked|expired)|invalid_entitlement/.test(reason)) return "disabled";
    return "";
  }

  async function activateLicenseKey(key) {
    const licenseKey = String(key || "").trim();
    if (!licenseKey) throw new Error(translate("licenseMissingKey"));
    const response = await request("/v1/licenses/activate", {
      licenseKey,
      installationId: installationId(),
      deviceName: deviceName(),
      appVersion: String(app.getVersion()),
    });
    if (typeof response.refreshToken !== "string") throw new Error("invalid_activation_response");
    return publicLicense(saveResponse(response, response.refreshToken));
  }

  async function validateSavedLicense({ allowOffline = true } = {}) {
    const record = loadStoredLicense();
    if (!record) return { ok: false, reason: "missing" };
    const localEntitlement = verifyEntitlement(record.entitlement);
    const refreshToken = decryptRefreshToken(record.refreshToken);
    if (!localEntitlement || localEntitlement.device_id !== record.deviceId || !refreshToken) return { ok: false, reason: "invalid-device" };
    try {
      const response = await request("/v1/licenses/refresh", { deviceId: record.deviceId, refreshToken, appVersion: String(app.getVersion()) });
      entitlementFor(response, record.deviceId);
      const updated = { ...record, entitlement: response.entitlement, entitlementExpiresAt: response.entitlementExpiresAt, productName: response.license && response.license.productCode ? response.license.productCode : record.productName, lastValidatedAt: new Date().toISOString() };
      writeJson(licensePath(), updated);
      return { ok: true, license: publicLicense(updated) };
    } catch (error) {
      if (error.statusCode >= 400 && error.statusCode < 500) {
        removeFile(licensePath());
        return { ok: false, reason: error.code || "invalid" };
      }
      if (allowOffline) return { ok: true, license: publicLicense(record), offline: true };
      logWarn && logWarn("[CatCode] license refresh failed:", error && error.message ? error.message : error);
      return { ok: false, reason: "network", network: true };
    }
  }

  return {
    loadLicense: () => publicLicense(loadStoredLicense()),
    removeLicense: () => removeFile(licensePath()),
    licenseRecoveryReasonFromMessage,
    licenseActivatePayload: (reason = "") => ({ view: "license-activate", reason: licenseRecoveryReasonFromMessage(reason) }),
    activateLicenseKey,
    validateSavedLicense,
  };
}

module.exports = { API_BASE_URL, createLicenseService, verifyEntitlement };
