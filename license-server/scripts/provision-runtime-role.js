"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { databasePoolOptions } = require("../src/database");

const RUNTIME_ROLE = "catcode_api";
const MIGRATION_KEYS = ["DATABASE_URL", "DATABASE_SSL", "DATABASE_CA_CERT_PEM"];

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

function environmentValue(environment, name) {
  const value = environmentLine(environment, name).slice(name.length + 1);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  return value;
}

function runtimeConnectionString(adminConnectionString, password) {
  const url = new URL(adminConnectionString);
  // Supabase's shared pooler identifies a tenant through `role.<project-ref>`.
  // Keep that suffix while swapping administrative access for the runtime role.
  const tenantSuffix = url.username.includes(".") ? url.username.slice(url.username.indexOf(".")) : "";
  url.username = `${RUNTIME_ROLE}${tenantSuffix}`;
  url.password = password;
  return url.toString();
}

function migrationEnvironment(environment) {
  return `${MIGRATION_KEYS.map((name) => environmentLine(environment, name)).join("\n")}\n`;
}

function adminEnvironment(maintenanceEnvironment, runtimeEnvironment) {
  const values = [
    ...MIGRATION_KEYS.map((name) => environmentLine(maintenanceEnvironment, name)),
    environmentLine(runtimeEnvironment, "LICENSE_KEY_HMAC_SECRET"),
  ];
  return `${values.join("\n")}\n`;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function configureRole(client, databaseName, password) {
  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [RUNTIME_ROLE]);
  const roleIdentifier = quoteIdentifier(RUNTIME_ROLE);
  const mutableRoleOptions = `LOGIN PASSWORD '${password}' NOINHERIT CONNECTION LIMIT 10`;
  if (existing.rowCount > 0) {
    // Supabase deliberately blocks external changes to replication and RLS-bypass
    // flags. They are safe defaults on the role created below and do not need
    // to be touched when the runtime password is rotated.
    await client.query(`ALTER ROLE ${roleIdentifier} WITH ${mutableRoleOptions}`);
  } else {
    await client.query(`CREATE ROLE ${roleIdentifier} WITH ${mutableRoleOptions} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  }

  await client.query(`REVOKE ALL PRIVILEGES ON DATABASE ${quoteIdentifier(databaseName)} FROM ${roleIdentifier}`);
  await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${roleIdentifier}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${roleIdentifier}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${roleIdentifier}`);
  await client.query(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${roleIdentifier}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE public.licenses, public.license_devices, public.license_events TO ${roleIdentifier}`);
}

async function provisionRuntimeRole({ directory = process.cwd() } = {}) {
  const environmentPath = path.join(directory, ".env");
  const migrationEnvironmentPath = path.join(directory, ".migration.env");
  const adminEnvironmentPath = path.join(directory, ".admin.env");
  const environment = fs.readFileSync(environmentPath, "utf8");
  // After initial provisioning, .env deliberately holds a restricted user. The
  // separate maintenance file retains administrative access for future rotation.
  const maintenanceEnvironment = fs.existsSync(migrationEnvironmentPath)
    ? fs.readFileSync(migrationEnvironmentPath, "utf8")
    : migrationEnvironment(environment);
  const adminConnectionString = environmentValue(maintenanceEnvironment, "DATABASE_URL").trim();
  if (!adminConnectionString) throw new Error("DATABASE_URL is required");
  const databaseSsl = environmentValue(maintenanceEnvironment, "DATABASE_SSL").toLowerCase() !== "false";
  const databaseCaCertPem = environmentValue(maintenanceEnvironment, "DATABASE_CA_CERT_PEM").trim().replace(/\\n/g, "\n") || null;
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

  const runtimeEnvironment = replaceEnvironmentValue(environment, "DATABASE_URL", runtimeConnectionString(adminConnectionString, password));
  fs.writeFileSync(migrationEnvironmentPath, maintenanceEnvironment, { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(adminEnvironmentPath, adminEnvironment(maintenanceEnvironment, environment), { encoding: "utf8", mode: 0o600 });
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

module.exports = { adminEnvironment, configureRole, environmentValue, migrationEnvironment, replaceEnvironmentValue, runtimeConnectionString };
