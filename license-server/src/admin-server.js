"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { Pool } = require("pg");
const { loadAdminConfig } = require("./config");
const { databasePoolOptions } = require("./database");
const { generateLicenseKey, hmacHex } = require("./keys");
const { StoreError, createStore } = require("./store");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSETS = {
  html: fs.readFileSync(path.join(__dirname, "admin-dashboard.html"), "utf8"),
  css: fs.readFileSync(path.join(__dirname, "admin-dashboard.css"), "utf8"),
  js: fs.readFileSync(path.join(__dirname, "admin-dashboard.js"), "utf8"),
};

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function send(response, status, contentType, body, extraHeaders = {}) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": contentType,
    "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; script-src 'self'; style-src 'self'",
    ...extraHeaders,
  });
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(value));
}

function sendText(response, status, value) {
  send(response, status, "text/plain; charset=utf-8", value);
}

function isSecure(request) {
  const forwarded = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return request.socket.encrypted || forwarded === "https";
}

function requireSameOrigin(request) {
  const origin = String(request.headers.origin || "");
  const host = String(request.headers.host || "");
  if (!host || origin !== `https://${host}`) throw new HttpError(403, "origin_required");
}

function readJson(request) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) return Promise.reject(new HttpError(415, "json_required"));
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 24_000) request.destroy(new HttpError(413, "payload_too_large"));
    });
    request.on("error", reject);
    request.on("end", () => {
      try {
        const value = JSON.parse(body || "{}");
        if (!value || Array.isArray(value) || typeof value !== "object") throw new HttpError(400, "invalid_request");
        resolve(value);
      } catch (error) {
        reject(error instanceof HttpError ? error : new HttpError(400, "invalid_json"));
      }
    });
  });
}

function optionalString(value, max) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > max) throw new HttpError(400, "invalid_request");
  return normalized;
}

function optionalEmail(value) {
  const email = optionalString(value, 320);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "invalid_email");
  return email.toLowerCase();
}

function maxDevices(value) {
  const parsed = Number(value === undefined || value === "" ? 1 : value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) throw new HttpError(400, "invalid_devices");
  return parsed;
}

function uuid(value) {
  if (!UUID_PATTERN.test(value || "")) throw new HttpError(400, "invalid_identifier");
  return value;
}

function limit(value) {
  const parsed = Number(value || 100);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) throw new HttpError(400, "invalid_limit");
  return parsed;
}

function parseIssue(body) {
  return {
    buyerEmail: optionalEmail(body.buyerEmail),
    paymentReference: optionalString(body.paymentReference, 160),
    notes: optionalString(body.notes, 1000),
    maxDevices: maxDevices(body.maxDevices),
  };
}

function createAdminServer({ config, store }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const { pathname } = url;
      const method = request.method || "GET";

      if (method === "GET" && pathname === "/healthz") return sendJson(response, 200, { ok: true });
      if (!isSecure(request)) throw new HttpError(400, "https_required");

      if (method === "GET" && (pathname === "/admin" || pathname === "/admin/")) {
        return send(response, 200, "text/html; charset=utf-8", ASSETS.html);
      }
      if (method === "GET" && pathname === "/admin/dashboard.css") {
        return send(response, 200, "text/css; charset=utf-8", ASSETS.css);
      }
      if (method === "GET" && pathname === "/admin/dashboard.js") {
        return send(response, 200, "application/javascript; charset=utf-8", ASSETS.js);
      }

      if (method === "GET" && pathname === "/admin/api/licenses") {
        return sendJson(response, 200, { licenses: await store.listLicenseOverview(limit(url.searchParams.get("limit"))) });
      }

      const detailMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)$/);
      if (method === "GET" && detailMatch) {
        const licenseId = uuid(detailMatch[1]);
        const license = await store.getLicenseOverview(licenseId);
        if (!license) throw new HttpError(404, "license_not_found");
        return sendJson(response, 200, {
          license,
          devices: await store.listDevices(licenseId),
          events: await store.listLicenseEvents(licenseId),
        });
      }

      if (method === "POST" && pathname === "/admin/api/licenses") {
        requireSameOrigin(request);
        const input = parseIssue(await readJson(request));
        if (!input.paymentReference) throw new HttpError(400, "payment_reference_required");
        const key = generateLicenseKey();
        const license = await store.createLicense({
          key,
          keyHmac: hmacHex(config.licenseKeyHmacSecret, key),
          productCode: "catcode-desktop",
          expiresAt: null,
          ...input,
        });
        return sendJson(response, 201, {
          license: {
            id: license.id,
            key,
            keyPrefix: license.keyPrefix,
            productCode: license.productCode,
            maxDevices: license.maxDevices,
          },
        });
      }

      const revokeMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)\/revoke$/);
      if (method === "POST" && revokeMatch) {
        requireSameOrigin(request);
        await readJson(request);
        return sendJson(response, 200, await store.revokeLicense(uuid(revokeMatch[1])));
      }

      const resetMatch = pathname.match(/^\/admin\/api\/licenses\/([^/]+)\/devices\/([^/]+)\/reset$/);
      if (method === "POST" && resetMatch) {
        requireSameOrigin(request);
        await readJson(request);
        return sendJson(response, 200, await store.deactivateDeviceForAdmin(uuid(resetMatch[1]), uuid(resetMatch[2])));
      }

      throw new HttpError(404, "not_found");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof StoreError ? 400 : 500;
      const code = error instanceof HttpError || error instanceof StoreError ? error.code : "internal_error";
      if (status >= 500) console.error("admin-dashboard error", error);
      sendJson(response, status, { error: code });
    }
  });
}

async function main() {
  const config = loadAdminConfig();
  const port = Number(process.env.ADMIN_DASHBOARD_PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid ADMIN_DASHBOARD_PORT");
  const pool = new Pool(databasePoolOptions(config));
  await pool.query("SELECT 1");
  const server = createAdminServer({ config, store: createStore(pool) });
  server.listen(port, "0.0.0.0", () => console.log(`CatCode admin dashboard listening on 0.0.0.0:${port}`));
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

module.exports = { createAdminServer, parseIssue };
