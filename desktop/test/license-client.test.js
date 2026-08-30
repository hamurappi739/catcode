"use strict";

const crypto = require("crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createLicenseService, verifyEntitlement } = require("../license-client");

function tokenFor(payload, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: "test" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signed = `${header}.${body}`;
  return `${signed}.${crypto.sign(null, Buffer.from(signed), privateKey).toString("base64url")}`;
}

test("accepts a currently valid CatCode entitlement", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const now = 1_800_000_000_000;
  const payload = { iss: "catcode-license-api", aud: "catcode-desktop", device_id: "device-1", nbf: 1_799_999_900, exp: 1_800_000_100 };
  assert.deepEqual(verifyEntitlement(tokenFor(payload, privateKey), now, publicKey), payload);
});

test("rejects expired and modified entitlements", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const payload = { iss: "catcode-license-api", aud: "catcode-desktop", device_id: "device-1", nbf: 1, exp: 2 };
  const token = tokenFor(payload, privateKey);
  assert.equal(verifyEntitlement(token, 3_000, publicKey), null);
  assert.equal(verifyEntitlement(`${token}x`, 1_500, publicKey), null);
});

test("records a safe diagnostic when a license request cannot reach the server", async () => {
  const warnings = [];
  const tempDirectory = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "catcode-license-"));
  const service = createLicenseService({
    app: { getPath: () => tempDirectory, getVersion: () => "0.2.6" },
    isWindows: true,
    logWarn: (message) => warnings.push(message),
    t: (key) => key,
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value) },
    fetchImpl: async () => {
      const error = new Error("socket closed");
      error.code = "ECONNRESET";
      throw error;
    },
  });

  await assert.rejects(() => service.activateLicenseKey("CAT-SECRET-DO-NOT-LOG"), { code: "LICENSE_NETWORK_FAILED" });
  assert.match(warnings[0], /license request failed for \/v1\/licenses\/activate/);
  assert.match(warnings[0], /ECONNRESET/);
  assert.doesNotMatch(warnings[0], /CAT-SECRET/);
});

function storedLicenseFixture() {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "catcode-license-refresh-"));
  const licensePath = path.join(tempDirectory, "license.json");
  const token = "expired-or-unavailable-entitlement";
  fs.writeFileSync(licensePath, JSON.stringify({
    v: 2,
    deviceId: "device-1",
    refreshToken: Buffer.from("refresh-secret").toString("base64"),
    entitlement: token,
    productName: "catcode-desktop",
    entitlementExpiresAt: "2026-01-01T00:00:00.000Z",
  }));
  return { tempDirectory, licensePath };
}

function refreshService({ response, onFetch }) {
  const fixture = storedLicenseFixture();
  const service = createLicenseService({
    app: { getPath: () => fixture.tempDirectory, getVersion: () => "0.2.31" },
    isWindows: true,
    t: (key) => key,
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString("utf8"),
    },
    fetchImpl: async (...args) => {
      onFetch && onFetch(...args);
      return response;
    },
  });
  return { fixture, service };
}

test("transient refresh responses do not erase the saved license", async () => {
  let calls = 0;
  const { fixture, service } = refreshService({
    response: new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json" } }),
    onFetch: () => { calls += 1; },
  });
  const result = await service.validateSavedLicense({ allowOffline: true });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.network, true);
  assert.equal(fs.existsSync(fixture.licensePath), true);
});

test("expired local cache still gets a chance to recover through refresh", async () => {
  let calls = 0;
  const { fixture, service } = refreshService({
    response: new Response(JSON.stringify({ error: "temporary_failure" }), { status: 400, headers: { "content-type": "application/json" } }),
    onFetch: () => { calls += 1; },
  });
  const result = await service.validateSavedLicense({ allowOffline: true });
  assert.equal(calls, 1);
  assert.equal(result.network, true);
  assert.equal(fs.existsSync(fixture.licensePath), true);
});

test("authoritative session failures still clear a revoked local session", async () => {
  const { fixture, service } = refreshService({
    response: new Response(JSON.stringify({ error: "session_invalid" }), { status: 400, headers: { "content-type": "application/json" } }),
  });
  const result = await service.validateSavedLicense({ allowOffline: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "session_invalid");
  assert.equal(fs.existsSync(fixture.licensePath), false);
});
