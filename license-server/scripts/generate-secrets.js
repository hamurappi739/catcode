"use strict";

const crypto = require("node:crypto");

function envPem(value) {
  return value.replace(/\n/g, "\\n");
}

function secret() {
  return crypto.randomBytes(32).toString("base64url");
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });

console.log("# Put these values in the server .env file. Never commit that file.");
console.log(`LICENSE_KEY_HMAC_SECRET=${secret()}`);
console.log(`DEVICE_HMAC_SECRET=${secret()}`);
console.log(`EVENT_HMAC_SECRET=${secret()}`);
console.log(`ADMIN_API_TOKEN=${secret()}`);
console.log("ENTITLEMENT_KEY_ID=catcode-license-2026-01");
console.log(`ENTITLEMENT_PRIVATE_KEY_PEM=${envPem(privatePem)}`);
console.log(`ENTITLEMENT_PUBLIC_KEY_PEM=${envPem(publicPem)}`);
console.log("\n# Pin this public key in the CatCode desktop client during integration:");
console.log(publicPem);
