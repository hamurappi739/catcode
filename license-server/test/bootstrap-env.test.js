"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnvironmentFile } = require("../scripts/bootstrap-env");

test("bootstrap writes a new production environment without replacing an existing file", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catcode-license-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.copyFileSync(path.join(__dirname, "..", ".env.example"), path.join(directory, ".env.example"));

  const { target, publicKeyPem } = createEnvironmentFile({ directory });
  const env = fs.readFileSync(target, "utf8");
  assert.match(env, /^LICENSE_KEY_HMAC_SECRET=(?!replace-me).+$/m);
  assert.match(env, /^ENTITLEMENT_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\\n/m);
  assert.match(publicKeyPem, /^-----BEGIN PUBLIC KEY-----/);
  assert.throws(() => createEnvironmentFile({ directory }), /already exists/);
});
