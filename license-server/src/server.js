"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const { Pool } = require("pg");
const { loadConfig } = require("./config");
const { canonicalizeLicenseKey, generateLicenseKey, generateRefreshToken, hmacHex } = require("./keys");
const { createRateLimiter } = require("./rate-limiter");
const { StoreError, createStore } = require("./store");
const { issueEntitlement } = require("./token");

const JSON_LIMIT_BYTES = 16 * 1024;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function loadLocalEnv() {
  if (process.env.NODE_ENV === "production") return;
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > JSON_LIMIT_BYTES) throw new HttpError(413, "payload_too_large");
    chunks.push(chunk);
  }
  if (bytes === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("invalid");
    return value;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function readString(value, { min = 1, max = 320, optional = false } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return null;
  if (typeof value !== "string") throw new HttpError(400, "invalid_request");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new HttpError(400, "invalid_request");
  return normalized;
}

function readOptionalInteger(value, fallback, { min, max }) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new HttpError(400, "invalid_request");
  return number;
}

function normalizeEmail(value) {
  const email = readString(value, { max: 320, optional: true });
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "invalid_request");
  return email.toLowerCase();
}

function readOptionalDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(readString(value, { max: 40 }));
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new HttpError(400, "invalid_request");
  return date.toISOString();
}

function secureEqual(left, right) {
  const leftBytes = Buffer.from(left || "", "utf8");
  const rightBytes = Buffer.from(right || "", "utf8");
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createServer({ config, store, limiter }) {
  function isSecure(request) {
    if (config.allowInsecureHttp) return true;
    if (config.trustProxy) return String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
    return Boolean(request.socket.encrypted);
  }

  function clientIp(request) {
    if (config.trustProxy) {
      const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
      if (forwarded) return forwarded;
    }
    return request.socket.remoteAddress || "unknown";
  }

  function ipHmac(request) {
    return hmacHex(config.eventHmacSecret, clientIp(request));
  }

  function requireAdmin(request) {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!secureEqual(token, config.adminApiToken)) throw new HttpError(401, "admin_unauthorized");
  }

  function issue({ license, device }) {
    return issueEntitlement({
      privateKey: config.entitlementPrivateKey,
      keyId: config.entitlementKeyId,
      license: { id: license.id, product_code: license.productCode },
      device,
      ttlSeconds: config.entitlementTtlSeconds,
    });
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const path = url.pathname;
      const method = request.method || "GET";
      if (method === "GET" && path === "/healthz") return sendJson(response, 200, { ok: true });
      if (!isSecure(request)) throw new HttpError(400, "https_required");

      if (method === "POST" && path === "/v1/licenses/activate") {
        if (!limiter.take(`${clientIp(request)}:activate`, config.activationRateLimit)) throw new HttpError(429, "rate_limited");
        const body = await readJson(request);
        const key = canonicalizeLicenseKey(readString(body.licenseKey, { max: 80 }));
        const installationId = readString(body.installationId, { min: 16, max: 128 });
        const deviceName = readString(body.deviceName, { min: 1, max: 80 });
        const appVersion = readString(body.appVersion, { min: 1, max: 48 });
        if (!key || !/^[A-Za-z0-9_-]+$/.test(installationId)) throw new HttpError(400, "invalid_request");
        const refreshToken = generateRefreshToken();
        const activation = await store.activate({
          keyHmac: hmacHex(config.licenseKeyHmacSecret, key),
          installationIdHmac: hmacHex(config.deviceHmacSecret, installationId),
          refreshTokenHmac: hmacHex(config.deviceHmacSecret, refreshToken),
          deviceName,
          appVersion,
          ipHmac: ipHmac(request),
        });
        const entitlement = issue(activation);
        return sendJson(response, 200, {
          entitlement: entitlement.token,
          entitlementExpiresAt: entitlement.expiresAt,
          refreshToken,
          license: activation.license,
          device: activation.device,
        });
      }

      if (method === "POST" && path === "/v1/licenses/refresh") {
        if (!limiter.take(`${clientIp(request)}:refresh`, config.refreshRateLimit)) throw new HttpError(429, "rate_limited");
        const body = await readJson(request);
        const deviceId = readString(body.deviceId, { min: 36, max: 36 });
        const refreshToken = readString(body.refreshToken, { min: 32, max: 128 });
        const appVersion = readString(body.appVersion, { min: 1, max: 48 });
        if (!isUuid(deviceId)) throw new HttpError(400, "invalid_request");
        const refreshed = await store.refresh({
          deviceId,
          refreshTokenHmac: hmacHex(config.deviceHmacSecret, refreshToken),
          appVersion,
          ipHmac: ipHmac(request),
        });
        const entitlement = issue(refreshed);
        return sendJson(response, 200, {
          entitlement: entitlement.token,
          entitlementExpiresAt: entitlement.expiresAt,
          license: refreshed.license,
          device: refreshed.device,
        });
      }

      if (method === "POST" && path === "/v1/licenses/deactivate") {
        const body = await readJson(request);
        const deviceId = readString(body.deviceId, { min: 36, max: 36 });
        if (!isUuid(deviceId)) throw new HttpError(400, "invalid_request");
        const result = await store.deactivate({
          deviceId,
          refreshTokenHmac: hmacHex(config.deviceHmacSecret, readString(body.refreshToken, { min: 32, max: 128 })),
          ipHmac: ipHmac(request),
        });
        return sendJson(response, 200, result);
      }

      if (method === "GET" && path === "/admin/licenses") {
        requireAdmin(request);
        const limit = readOptionalInteger(url.searchParams.get("limit"), 50, { min: 1, max: 200 });
        return sendJson(response, 200, { licenses: await store.listLicenses(limit) });
      }

      if (method === "POST" && path === "/admin/licenses") {
        requireAdmin(request);
        const body = await readJson(request);
        const key = generateLicenseKey();
        const license = await store.createLicense({
          key,
          keyHmac: hmacHex(config.licenseKeyHmacSecret, key),
          buyerEmail: normalizeEmail(body.buyerEmail),
          paymentReference: readString(body.paymentReference, { max: 160, optional: true }),
          notes: readString(body.notes, { max: 1000, optional: true }),
          productCode: readString(body.productCode || "catcode-desktop", { max: 48 }),
          maxDevices: readOptionalInteger(body.maxDevices, 1, { min: 1, max: 10 }),
          expiresAt: readOptionalDate(body.expiresAt),
          ipHmac: ipHmac(request),
        });
        return sendJson(response, 201, {
          license: {
            id: license.id,
            key,
            keyPrefix: license.keyPrefix,
            productCode: license.productCode,
            maxDevices: license.maxDevices,
            expiresAt: license.expiresAt,
          },
        });
      }

      const revokeMatch = path.match(/^\/admin\/licenses\/([0-9a-f-]{36})\/revoke$/i);
      if (method === "POST" && revokeMatch) {
        requireAdmin(request);
        return sendJson(response, 200, await store.revokeLicense(revokeMatch[1], ipHmac(request)));
      }

      const deviceMatch = path.match(/^\/admin\/licenses\/([0-9a-f-]{36})\/devices\/([0-9a-f-]{36})\/deactivate$/i);
      if (method === "POST" && deviceMatch) {
        requireAdmin(request);
        return sendJson(response, 200, await store.deactivateDeviceForAdmin(deviceMatch[1], deviceMatch[2], ipHmac(request)));
      }

      throw new HttpError(404, "not_found");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof StoreError ? 400 : 500;
      const code = error instanceof HttpError || error instanceof StoreError ? error.code : "internal_error";
      if (status >= 500) console.error("license-api error", error);
      sendJson(response, status, { error: code });
    }
  });
}

async function main() {
  loadLocalEnv();
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: true } : false });
  await pool.query("SELECT 1");
  const server = createServer({ config, store: createStore(pool), limiter: createRateLimiter() });
  server.listen(config.port, "127.0.0.1", () => console.log(`CatCode license API listening on 127.0.0.1:${config.port}`));
  const shutdown = async () => {
    server.close();
    await pool.end();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createServer };
