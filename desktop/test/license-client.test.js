"use strict";

const crypto = require("crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
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
