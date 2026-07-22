"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { configureRole, environmentValue, migrationEnvironment, replaceEnvironmentValue, runtimeConnectionString } = require("../scripts/provision-runtime-role");

const environment = [
  "DATABASE_URL=postgresql://postgres:admin@example.com:5432/postgres?sslmode=require",
  "DATABASE_SSL=true",
  "DATABASE_CA_CERT_PEM=certificate",
  "LICENSE_KEY_HMAC_SECRET=secret",
].join("\n");

test("runtime role receives an encoded, dedicated database connection string", () => {
  const runtimeUrl = new URL(runtimeConnectionString("postgresql://postgres:admin@example.com:5432/postgres", "runtime-password"));
  assert.equal(runtimeUrl.username, "catcode_api");
  assert.equal(runtimeUrl.password, "runtime-password");
});

test("runtime role preserves the Supabase pooler tenant suffix", () => {
  const runtimeUrl = new URL(runtimeConnectionString("postgresql://postgres.project-ref:admin@aws-0-eu-west-3.pooler.supabase.com:5432/postgres", "runtime-password"));
  assert.equal(runtimeUrl.username, "catcode_api.project-ref");
  assert.equal(runtimeUrl.password, "runtime-password");
});

test("migration environment contains only database credentials", () => {
  assert.equal(
    migrationEnvironment(environment),
    "DATABASE_URL=postgresql://postgres:admin@example.com:5432/postgres?sslmode=require\nDATABASE_SSL=true\nDATABASE_CA_CERT_PEM=certificate\n",
  );
});

test("environment values remove dotenv quotes around a PEM certificate", () => {
  assert.equal(environmentValue(environment, "DATABASE_CA_CERT_PEM"), "certificate");
  assert.equal(environmentValue('DATABASE_CA_CERT_PEM="line-one\\nline-two"', "DATABASE_CA_CERT_PEM"), "line-one\\nline-two");
});

test("runtime role rotation does not alter Supabase-restricted role flags", async () => {
  const statements = [];
  const client = {
    query: async (statement) => {
      statements.push(statement);
      return statement.startsWith("SELECT") ? { rowCount: 1 } : { rowCount: 0 };
    },
  };

  await configureRole(client, "postgres", "runtime-password");

  const alter = statements.find((statement) => statement.startsWith("ALTER ROLE"));
  assert.match(alter, /NOINHERIT/);
  assert.doesNotMatch(alter, /NOREPLICATION|NOBYPASSRLS/);
  assert.equal(statements.some((statement) => statement.startsWith("GRANT \"catcode_api\" TO postgres")), false);
});

test("new runtime roles are created without elevated privileges", async () => {
  const statements = [];
  const client = {
    query: async (statement) => {
      statements.push(statement);
      return statement.startsWith("SELECT") ? { rowCount: 0 } : { rowCount: 0 };
    },
  };

  await configureRole(client, "postgres", "runtime-password");

  const create = statements.find((statement) => statement.startsWith("CREATE ROLE"));
  assert.match(create, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
});

test("environment replacement preserves unrelated application secrets", () => {
  const updated = replaceEnvironmentValue(environment, "DATABASE_URL", "postgresql://catcode_api:runtime@example.com:5432/postgres");
  assert.match(updated, /^DATABASE_URL=postgresql:\/\/catcode_api:runtime@example.com:5432\/postgres$/m);
  assert.match(updated, /^LICENSE_KEY_HMAC_SECRET=secret$/m);
});
