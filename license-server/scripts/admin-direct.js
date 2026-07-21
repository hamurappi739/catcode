"use strict";

const { Pool } = require("pg");
const { loadConfig } = require("../src/config");
const { generateLicenseKey, hmacHex } = require("../src/keys");
const { createStore } = require("../src/store");

function loadLocalEnv() {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function optionalString(value, max) {
  if (value === undefined || value === "") return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > max) throw new Error("Invalid command argument");
  return normalized;
}

function optionalEmail(value) {
  const email = optionalString(value, 320);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid --email");
  return email.toLowerCase();
}

function positiveInteger(value, fallback, { min, max }) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error("Invalid command argument");
  return number;
}

function optionalFutureDate(value) {
  const raw = optionalString(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Invalid --expires");
  return date.toISOString();
}

function uuid(value, option) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "")) {
    throw new Error(`${option} must be a UUID`);
  }
  return value;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  loadLocalEnv();
  const { command, options } = parseArguments(process.argv.slice(2));
  const config = loadConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
  });
  const store = createStore(pool);

  try {
    if (command === "issue") {
      const key = generateLicenseKey();
      const license = await store.createLicense({
        key,
        keyHmac: hmacHex(config.licenseKeyHmacSecret, key),
        buyerEmail: optionalEmail(options.email),
        paymentReference: optionalString(options.payment, 160),
        notes: optionalString(options.note, 1000),
        productCode: optionalString(options.product, 48) || "catcode-desktop",
        maxDevices: positiveInteger(options.devices, 1, { min: 1, max: 10 }),
        expiresAt: optionalFutureDate(options.expires),
      });
      print({
        license: {
          id: license.id,
          key,
          keyPrefix: license.keyPrefix,
          productCode: license.productCode,
          maxDevices: license.maxDevices,
          expiresAt: license.expiresAt,
        },
      });
      return;
    }

    if (command === "list") {
      print({ licenses: await store.listLicenses(positiveInteger(options.limit, 50, { min: 1, max: 200 })) });
      return;
    }

    if (command === "devices") {
      print({ devices: await store.listDevices(uuid(options.license, "--license")) });
      return;
    }

    if (command === "revoke") {
      print(await store.revokeLicense(uuid(options.license, "--license")));
      return;
    }

    if (command === "reset-device") {
      print(await store.deactivateDeviceForAdmin(
        uuid(options.license, "--license"),
        uuid(options.device, "--device"),
      ));
      return;
    }

    throw new Error("Commands: issue, list, devices, revoke, reset-device");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
