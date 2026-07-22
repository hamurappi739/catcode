"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { migrationEnvironment, replaceEnvironmentValue, runtimeConnectionString } = require("../scripts/provision-runtime-role");

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

test("migration environment contains only database credentials", () => {
  assert.equal(
    migrationEnvironment(environment),
    "DATABASE_URL=postgresql://postgres:admin@example.com:5432/postgres?sslmode=require\nDATABASE_SSL=true\nDATABASE_CA_CERT_PEM=certificate\n",
  );
});

test("environment replacement preserves unrelated application secrets", () => {
  const updated = replaceEnvironmentValue(environment, "DATABASE_URL", "postgresql://catcode_api:runtime@example.com:5432/postgres");
  assert.match(updated, /^DATABASE_URL=postgresql:\/\/catcode_api:runtime@example.com:5432\/postgres$/m);
  assert.match(updated, /^LICENSE_KEY_HMAC_SECRET=secret$/m);
});
