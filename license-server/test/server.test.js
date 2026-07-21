"use strict";

const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../src/server");
const { createRateLimiter } = require("../src/rate-limiter");
const { verifyEntitlement } = require("../src/token");

function createTestConfig() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    allowInsecureHttp: true,
    trustProxy: false,
    entitlementPrivateKey: privateKey,
    entitlementPublicKey: publicKey,
    entitlementKeyId: "test-key",
    entitlementTtlSeconds: 3600,
    licenseKeyHmacSecret: "license-secret",
    deviceHmacSecret: "device-secret",
    eventHmacSecret: "event-secret",
    adminApiToken: "admin-token",
    activationRateLimit: 10,
    refreshRateLimit: 10,
  };
}

async function withServer(t, callback) {
  const config = createTestConfig();
  const calls = { activate: 0, createLicense: 0 };
  const store = {
    async activate() {
      calls.activate += 1;
      return {
        license: { id: "4a7ab90a-a2c4-466a-a35f-a3152f813dee", productCode: "catcode-desktop", status: "active", maxDevices: 1, expiresAt: null },
        device: { id: "3f62b228-4123-49d1-b2c6-73fd1897574a", name: "Test Windows", appVersion: "0.2.0", firstActivatedAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z" },
      };
    },
    async refresh() {
      throw new Error("not used");
    },
    async deactivate() {
      throw new Error("not used");
    },
    async listLicenses() {
      return [];
    },
    async createLicense(input) {
      calls.createLicense += 1;
      return {
        id: "07134cd2-48d3-4f3a-85f9-7958ea225968",
        key: input.key,
        keyPrefix: input.key.slice(0, 10),
        productCode: input.productCode,
        maxDevices: input.maxDevices,
        expiresAt: input.expiresAt,
      };
    },
    async revokeLicense() {
      throw new Error("not used");
    },
    async deactivateDeviceForAdmin() {
      throw new Error("not used");
    },
  };
  const server = createServer({ config, store, limiter: createRateLimiter() });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return callback({ baseUrl: `http://127.0.0.1:${port}`, config, calls });
}

test("activation returns a signed entitlement and opaque refresh token", async (t) => {
  await withServer(t, async ({ baseUrl, config, calls }) => {
    const response = await fetch(`${baseUrl}/v1/licenses/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenseKey: "cat-abcdef-abcdef-abcdef-abcdef-abcdef",
        installationId: "89c1d9a7-246e-48f7-8d35-2eb17100a5a9",
        deviceName: "Test Windows",
        appVersion: "0.2.0",
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(calls.activate, 1);
    assert.match(payload.refreshToken, /^[A-Za-z0-9_-]{40,}$/);
    assert.equal(verifyEntitlement(payload.entitlement, config.entitlementPublicKey).product, "catcode-desktop");
  });
});

test("admin key issuance requires a bearer token", async (t) => {
  await withServer(t, async ({ baseUrl, calls }) => {
    const denied = await fetch(`${baseUrl}/admin/licenses`, { method: "POST" });
    assert.equal(denied.status, 401);

    const response = await fetch(`${baseUrl}/admin/licenses`, {
      method: "POST",
      headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ buyerEmail: "buyer@example.ru", paymentReference: "transfer-1" }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(calls.createLicense, 1);
    assert.match(payload.license.key, /^CAT-(?:[0-9A-HJKMNP-TV-Z]{6}-){4}[0-9A-HJKMNP-TV-Z]{6}$/);
  });
});
