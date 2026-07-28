"use strict";

const crypto = require("node:crypto");

function required(env, name) {
  const value = String(env[name] || "").trim();
  if (!value || value === "replace-me") throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function boolean(env, name, fallback) {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() === "true" || String(value) === "1";
}

function positiveInteger(env, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = env[name] === undefined || env[name] === "" ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

function pem(value) {
  return value.replace(/\\n/g, "\n");
}

function optionalPem(env, name) {
  const value = String(env[name] || "").trim();
  return value ? pem(value) : null;
}

function loadDatabaseConfig(env = process.env) {
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    databaseSsl: boolean(env, "DATABASE_SSL", true),
    databaseCaCertPem: optionalPem(env, "DATABASE_CA_CERT_PEM"),
  };
}

function loadAdminConfig(env = process.env) {
  return {
    ...loadDatabaseConfig(env),
    licenseKeyHmacSecret: required(env, "LICENSE_KEY_HMAC_SECRET"),
  };
}

function loadConfig(env = process.env) {
  const privateKeyPem = pem(required(env, "ENTITLEMENT_PRIVATE_KEY_PEM"));
  const publicKeyPem = pem(required(env, "ENTITLEMENT_PUBLIC_KEY_PEM"));
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKey = crypto.createPublicKey(publicKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Entitlement keys must be Ed25519 keys");
  }

  return {
    port: positiveInteger(env, "PORT", 3000, { max: 65535 }),
    ...loadDatabaseConfig(env),
    licenseKeyHmacSecret: required(env, "LICENSE_KEY_HMAC_SECRET"),
    deviceHmacSecret: required(env, "DEVICE_HMAC_SECRET"),
    eventHmacSecret: required(env, "EVENT_HMAC_SECRET"),
    entitlementPrivateKey: privateKey,
    entitlementPublicKey: publicKey,
    entitlementPublicKeyPem: publicKeyPem,
    entitlementKeyId: required(env, "ENTITLEMENT_KEY_ID"),
    entitlementTtlSeconds: positiveInteger(env, "ENTITLEMENT_TTL_SECONDS", 604800, { min: 3600, max: 1209600 }),
    activationRateLimit: positiveInteger(env, "ACTIVATION_RATE_LIMIT", 12, { max: 1000 }),
    refreshRateLimit: positiveInteger(env, "REFRESH_RATE_LIMIT", 60, { max: 10000 }),
    allowInsecureHttp: boolean(env, "ALLOW_INSECURE_HTTP", false),
    trustProxy: boolean(env, "TRUST_PROXY", true),
  };
}

module.exports = { loadAdminConfig, loadConfig };
