"use strict";

const crypto = require("crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyEntitlement } = require("../license-client");

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
