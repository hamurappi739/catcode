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
  return match[0].replace(/\r$/, "");
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
  // `FOR UPDATE` locks the selected license while a device is activated. PostgreSQL
  // requires UPDATE on one column for that lock even though the API never changes a license.
  await client.query(`GRANT SELECT (id, key_hmac, product_code, status, max_devices, expires_at), UPDATE (updated_at) ON TABLE public.licenses TO ${roleIdentifier}`);
  await client.query(`GRANT SELECT (id, license_id, installation_id_hmac, refresh_token_hmac, device_name, app_version, first_activated_at, last_seen_at, deactivated_at), INSERT (id, license_id, installation_id_hmac, refresh_token_hmac, device_name, app_version), UPDATE (refresh_token_hmac, device_name, app_version, last_seen_at, deactivated_at) ON TABLE public.license_devices TO ${roleIdentifier}`);
  await client.query(`GRANT INSERT (id, license_id, device_id, event_type, ip_hmac, metadata) ON TABLE public.license_events TO ${roleIdentifier}`);

  const policies = [
    ["licenses", "catcode_api_select_licenses", "FOR SELECT TO " + roleIdentifier + " USING (true)"],
    ["licenses", "catcode_api_lock_licenses", "FOR UPDATE TO " + roleIdentifier + " USING (true) WITH CHECK (true)"],
    ["license_devices", "catcode_api_select_devices", "FOR SELECT TO " + roleIdentifier + " USING (true)"],
    ["license_devices", "catcode_api_insert_devices", "FOR INSERT TO " + roleIdentifier + " WITH CHECK (true)"],
    ["license_devices", "catcode_api_update_devices", "FOR UPDATE TO " + roleIdentifier + " USING (true) WITH CHECK (true)"],
    ["license_events", "catcode_api_insert_events", "FOR INSERT TO " + roleIdentifier + " WITH CHECK (true)"],
  ];
  for (const [table, policy, definition] of policies) {
    await client.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    await client.query(`DROP POLICY IF EXISTS ${quoteIdentifier(policy)} ON public.${table}`);
    await client.query(`CREATE POLICY ${quoteIdentifier(policy)} ON public.${table} ${definition}`);
  }
}

async function provisionRuntimeRole({ directory = process.cwd() } = {}) {
  const environmentPath = path.join(directory, ".env");
  const migrationEnvironmentPath = path.join(directory, ".migration.env");
  const adminEnvironmentPath = path.join(directory, ".admin.env");
  // The configuration may have been created on Windows and copied to Linux.
  // Normalize line endings before deriving secret-bearing maintenance files so
  // an invisible CR cannot become part of one HMAC secret but not the other.
  const environment = fs.readFileSync(environmentPath, "utf8").replace(/\r\n/g, "\n");
  // After initial provisioning, .env deliberately holds a restricted user. The
  // separate maintenance file retains administrative access for future rotation.
  const maintenanceEnvironment = fs.existsSync(migrationEnvironmentPath)
    ? fs.readFileSync(migrationEnvironmentPath, "utf8").replace(/\r\n/g, "\n")
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
