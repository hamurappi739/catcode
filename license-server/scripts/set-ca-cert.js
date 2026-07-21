"use strict";

const fs = require("node:fs");
const path = require("node:path");

function encodeCertificate(certificate) {
  const normalized = certificate.replace(/\r\n/g, "\n").trim();
  if (!/^-----BEGIN CERTIFICATE-----\n[\s\S]+\n-----END CERTIFICATE-----$/.test(normalized)) {
    throw new Error("The certificate file is not a PEM certificate");
  }
  return normalized.replace(/\n/g, "\\n");
}

function setCertificate({ directory = process.cwd(), certificatePath }) {
  if (!certificatePath) throw new Error("Usage: node scripts/set-ca-cert.js /path/to/database-ca.crt");
  const envPath = path.join(directory, ".env");
  const certificate = encodeCertificate(fs.readFileSync(certificatePath, "utf8"));
  let environment = fs.readFileSync(envPath, "utf8");
  const line = `DATABASE_CA_CERT_PEM="${certificate}"`;
  if (/^DATABASE_CA_CERT_PEM=.*$/m.test(environment)) {
    environment = environment.replace(/^DATABASE_CA_CERT_PEM=.*$/m, line);
  } else {
    environment = `${environment.replace(/\s*$/, "")}\n${line}\n`;
  }
  fs.writeFileSync(envPath, environment, { encoding: "utf8", mode: 0o600 });
}

if (require.main === module) {
  try {
    setCertificate({ certificatePath: process.argv[2] });
    console.log("Saved DATABASE_CA_CERT_PEM in .env.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { encodeCertificate, setCertificate };
