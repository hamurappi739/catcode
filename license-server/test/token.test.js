"use strict";

const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { issueEntitlement, verifyEntitlement } = require("../src/token");

test("Ed25519 entitlement verifies with the pinned public key", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const issued = issueEntitlement({
    privateKey,
    keyId: "test-key",
    license: { id: "4a7ab90a-a2c4-466a-a35f-a3152f813dee", product_code: "catcode-desktop" },
    device: { id: "3f62b228-4123-49d1-b2c6-73fd1897574a" },
    ttlSeconds: 3600,
    now: () => 1_700_000_000_000,
  });
  const verified = verifyEntitlement(issued.token, publicKey, () => 1_700_000_000_100);
  assert.equal(verified.sub, "4a7ab90a-a2c4-466a-a35f-a3152f813dee");
  assert.equal(verified.device_id, "3f62b228-4123-49d1-b2c6-73fd1897574a");
});

test("modified or expired entitlements are rejected", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const issued = issueEntitlement({
    privateKey,
    keyId: "test-key",
    license: { id: "4a7ab90a-a2c4-466a-a35f-a3152f813dee", product_code: "catcode-desktop" },
    device: { id: "3f62b228-4123-49d1-b2c6-73fd1897574a" },
    ttlSeconds: 3600,
    now: () => 1_700_000_000_000,
  });
  assert.equal(verifyEntitlement(`${issued.token}x`, publicKey, () => 1_700_000_000_100), null);
  assert.equal(verifyEntitlement(issued.token, publicKey, () => 1_700_010_000_000), null);
});
