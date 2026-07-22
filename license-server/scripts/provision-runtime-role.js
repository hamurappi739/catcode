"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { databasePoolOptions } = require("../src/database");

const RUNTIME_ROLE = "catcode_api";
const MIGRATION_KEYS = ["DATABASE_URL", "DATABASE_SSL", "DATABASE_CA_CERT_PEM"];

function loadLocalEnv() {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function replaceEnvironmentValue(environment, name, value) {
  const expression = new RegExp(`^${name}=.*$`, "m");
  if (!expression.test(environment)) throw new Error(`Missing ${name} in .env`);
  return environment.replace(expression, `${name}=${value}`);
}

function environmentLine(environment, name) {
  const match = environment.match(new RegExp(`^${name}=.*$`, "m"));
  if (!match) throw new Error(`Missing ${name} in .env`);
  return match[0];
}

function runtimeConnectionString(adminConnectionString, password) {
  const url = new URL(adminConnectionString);
  url.username = RUNTIME_ROLE;
  url.password = password;
  return url.toString();
}

function migrationEnvironment(environment) {
  return `${MIGRATION_KEYS.map((name) => environmentLine(environment, name)).join("\n")}\n`;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function configureRole(client, databaseName, password) {
  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [RUNTIME_ROLE]);
  const roleOptions = `LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10`;
  if (existing.rowCount > 0) {
    await client.query(`ALTER ROLE ${RUNTIME_ROLE} WITH ${roleOptions}`);
  } else {
    await client.query(`CREATE ROLE ${RUNTIME_ROLE} WITH ${roleOptions}`);
  }

  await client.query(`REVOKE ALL PRIVILEGES ON DATABASE ${quoteIdentifier(databaseName)} FROM ${RUNTIME_ROLE}`);
  await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${RUNTIME_ROLE}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${RUNTIME_ROLE}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${RUNTIME_ROLE}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${RUNTIME_ROLE}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE public.licenses, public.license_devices, public.license_events TO ${RUNTIME_ROLE}`);
}

async function provisionRuntimeRole({ directory = process.cwd() } = {}) {
  loadLocalEnv();
  const adminConnectionString = String(process.env.DATABASE_URL || "").trim();
  if (!adminConnectionString) throw new Error("DATABASE_URL is required");
  const databaseSsl = String(process.env.DATABASE_SSL || "true").toLowerCase() !== "false";
  const databaseCaCertPem = String(process.env.DATABASE_CA_CERT_PEM || "").trim().replace(/\\n/g, "\n") || null;
  const adminUrl = new URL(adminConnectionString);
  const databaseName = decodeURIComponent(adminUrl.pathname.replace(/^\//, ""));
  if (!databaseName) throw new Error("DATABASE_URL must include a database name");

  const pool = new Pool(databasePoolOptions({ databaseUrl: adminConnectionString, databaseSsl, databaseCaCertPem }));
  const password = crypto.randomBytes(32).toString("base64url");
  try {
    const client = await pool.connect();
    try {
      await configureRole(client, databaseName, password);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  const environmentPath = path.join(directory, ".env");
  const environment = fs.readFileSync(environmentPath, "utf8");
  const runtimeEnvironment = replaceEnvironmentValue(environment, "DATABASE_URL", runtimeConnectionString(adminConnectionString, password));
  fs.writeFileSync(path.join(directory, ".migration.env"), migrationEnvironment(environment), { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(environmentPath, runtimeEnvironment, { encoding: "utf8", mode: 0o600 });
}

if (require.main === module) {
  provisionRuntimeRole().then(
    () => console.log("Configured the restricted catcode_api database role."),
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}

module.exports = { migrationEnvironment, replaceEnvironmentValue, runtimeConnectionString };
