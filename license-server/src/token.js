"use strict";

const crypto = require("node:crypto");

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseBase64urlJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function issueEntitlement({ privateKey, keyId, license, device, ttlSeconds, now = Date.now }) {
  const issuedAt = Math.floor(now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT", kid: keyId };
  const payload = {
    iss: "catcode-license-api",
    aud: "catcode-desktop",
    sub: license.id,
    device_id: device.id,
    product: license.product_code,
    iat: issuedAt,
    nbf: issuedAt - 30,
    exp: issuedAt + ttlSeconds,
    jti: crypto.randomUUID(),
  };
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const content = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign(null, Buffer.from(content, "utf8"), privateKey).toString("base64url");
  return {
    token: `${content}.${signature}`,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    payload,
  };
}

function verifyEntitlement(token, publicKey, now = Date.now) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = parseBase64urlJson(encodedHeader);
    const payload = parseBase64urlJson(encodedPayload);
    if (header.alg !== "EdDSA" || payload.iss !== "catcode-license-api" || payload.aud !== "catcode-desktop") return null;
    const signature = Buffer.from(encodedSignature, "base64url");
    const valid = crypto.verify(null, Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"), publicKey, signature);
    if (!valid || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  issueEntitlement,
  verifyEntitlement,
};
