"use strict";

const crypto = require("node:crypto");

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_GROUPS = 5;
const KEY_GROUP_LENGTH = 6;

function randomCrockford(length) {
  let result = "";
  while (result.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= 224) continue;
    result += CROCKFORD_BASE32[byte % CROCKFORD_BASE32.length];
  }
  return result;
}

function generateLicenseKey() {
  const groups = [];
  for (let index = 0; index < KEY_GROUPS; index += 1) {
    groups.push(randomCrockford(KEY_GROUP_LENGTH));
  }
  return `CAT-${groups.join("-")}`;
}

function canonicalizeLicenseKey(value) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const expectedLength = 3 + KEY_GROUPS * KEY_GROUP_LENGTH;
  if (compact.length !== expectedLength || !compact.startsWith("CAT")) return null;

  const body = compact.slice(3);
  if (![...body].every((character) => CROCKFORD_BASE32.includes(character))) return null;

  const groups = [];
  for (let index = 0; index < body.length; index += KEY_GROUP_LENGTH) {
    groups.push(body.slice(index, index + KEY_GROUP_LENGTH));
  }
  return `CAT-${groups.join("-")}`;
}

function hmacHex(secret, value) {
  return crypto.createHmac("sha256", secret).update(String(value), "utf8").digest("hex");
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

module.exports = {
  canonicalizeLicenseKey,
  generateLicenseKey,
  generateRefreshToken,
  hmacHex,
};
