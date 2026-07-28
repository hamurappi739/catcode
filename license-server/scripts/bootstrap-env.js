"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function envPem(value) {
  return value.replace(/\n/g, "\\n");
}

function secret() {
  return crypto.randomBytes(32).toString("base64url");
}

function replaceEnvironmentValue(template, name, value) {
  const expression = new RegExp(`^${name}=.*$`, "m");
  if (!expression.test(template)) throw new Error(`Missing ${name} in .env.example`);
  return template.replace(expression, `${name}=${value}`);
}

function createEnvironmentFile({ directory = process.cwd() } = {}) {
  const target = path.join(directory, ".env");
  if (fs.existsSync(target)) throw new Error(".env already exists; refusing to replace it");

  const template = fs.readFileSync(path.join(directory, ".env.example"), "utf8");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const replacements = {
    LICENSE_KEY_HMAC_SECRET: secret(),
    DEVICE_HMAC_SECRET: secret(),
    EVENT_HMAC_SECRET: secret(),
    ENTITLEMENT_PRIVATE_KEY_PEM: `"${envPem(privateKey.export({ type: "pkcs8", format: "pem" }))}"`,
    ENTITLEMENT_PUBLIC_KEY_PEM: `"${envPem(publicKey.export({ type: "spki", format: "pem" }))}"`,
    ENTITLEMENT_KEY_ID: `catcode-license-${new Date().getUTCFullYear()}-01`,
  };
  const contents = Object.entries(replacements).reduce(
    (environment, [name, value]) => replaceEnvironmentValue(environment, name, value),
    template,
  );
  fs.writeFileSync(target, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  return { target, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) };
}

if (require.main === module) {
  try {
    const result = createEnvironmentFile();
    console.log(`Created ${result.target}. Add DATABASE_URL before starting the service.`);
    console.log("Save this public entitlement key for the desktop integration:");
    console.log(result.publicKeyPem);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createEnvironmentFile };
