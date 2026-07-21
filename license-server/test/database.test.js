"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { databasePoolOptions } = require("../src/database");

test("database pool options retain non-SSL URL parameters and use the supplied CA", () => {
  const options = databasePoolOptions({
    databaseUrl: "postgresql://user:pass@example.com:5432/db?sslmode=require&application_name=catcode",
    databaseSsl: true,
    databaseCaCertPem: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
  });
  assert.equal(options.connectionString, "postgresql://user:pass@example.com:5432/db?application_name=catcode");
  assert.deepEqual(options.ssl, {
    rejectUnauthorized: true,
    ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
  });
});

test("database pool options disable SSL explicitly for local databases", () => {
  const options = databasePoolOptions({
    databaseUrl: "postgresql://localhost:5432/catcode?sslmode=require",
    databaseSsl: false,
  });
  assert.equal(options.connectionString, "postgresql://localhost:5432/catcode");
  assert.equal(options.ssl, false);
});
