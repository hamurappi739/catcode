"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { setCertificate } = require("../scripts/set-ca-cert");

const certificate = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";

test("CA installer adds an escaped PEM value to the environment file", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catcode-license-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, ".env"), "DATABASE_URL=postgresql://example\n", "utf8");
  const certificatePath = path.join(directory, "database-ca.crt");
  fs.writeFileSync(certificatePath, certificate, "utf8");

  setCertificate({ directory, certificatePath });
  const environment = fs.readFileSync(path.join(directory, ".env"), "utf8");
  assert.match(environment, /^DATABASE_CA_CERT_PEM="-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----"$/m);
});
