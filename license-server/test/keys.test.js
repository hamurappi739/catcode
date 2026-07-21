"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalizeLicenseKey, generateLicenseKey, hmacHex } = require("../src/keys");

test("generated keys use a stable, human-readable format", () => {
  const key = generateLicenseKey();
  assert.match(key, /^CAT-(?:[0-9A-HJKMNP-TV-Z]{6}-){4}[0-9A-HJKMNP-TV-Z]{6}$/);
  assert.equal(canonicalizeLicenseKey(key.toLowerCase().replaceAll("-", " ")), key);
});

test("license key HMAC is deterministic but does not reveal the key", () => {
  const first = hmacHex("secret", "CAT-ABCDEF-ABCDEF-ABCDEF-ABCDEF-ABCDEF");
  assert.equal(first, hmacHex("secret", "CAT-ABCDEF-ABCDEF-ABCDEF-ABCDEF-ABCDEF"));
  assert.notEqual(first, hmacHex("other-secret", "CAT-ABCDEF-ABCDEF-ABCDEF-ABCDEF-ABCDEF"));
  assert.match(first, /^[a-f0-9]{64}$/);
});
