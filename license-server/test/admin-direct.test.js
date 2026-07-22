"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { optionalEmail, optionalFutureDate, parseArguments, positiveInteger } = require("../scripts/admin-direct");

test("admin arguments support the owner overview and inspect workflows", () => {
  assert.deepEqual(parseArguments(["overview", "--limit", "20"]), { command: "overview", options: { limit: "20" } });
  assert.deepEqual(parseArguments(["inspect", "--license", "de5c7a22-2e3d-4496-8f9c-214a17d86a27"]), {
    command: "inspect",
    options: { license: "de5c7a22-2e3d-4496-8f9c-214a17d86a27" },
  });
  assert.deepEqual(parseArguments(["revoke-all", "--confirm", "REVOKE-ALL"]), {
    command: "revoke-all",
    options: { confirm: "REVOKE-ALL" },
  });
  assert.equal(positiveInteger("2", 1, { min: 1, max: 10 }), 2);
});

test("owner issue data remains validated before writing a license", () => {
  assert.equal(optionalEmail("Buyer@Example.ru"), "buyer@example.ru");
  assert.throws(() => optionalEmail("not-an-email"));
  assert.equal(optionalFutureDate(""), null);
  assert.throws(() => optionalFutureDate("2020-01-01"));
});
