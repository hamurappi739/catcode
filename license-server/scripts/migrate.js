"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { databasePoolOptions } = require("../src/database");

function loadLocalEnv() {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function main() {
  loadLocalEnv();
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const databaseSsl = String(process.env.DATABASE_SSL || "true").toLowerCase() !== "false";
  const databaseCaCertPem = String(process.env.DATABASE_CA_CERT_PEM || "").trim().replace(/\\n/g, "\n") || null;
  const pool = new Pool(databasePoolOptions({ databaseUrl, databaseSsl, databaseCaCertPem }));
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const migrationsPath = path.join(__dirname, "..", "migrations");
    const files = fs.readdirSync(migrationsPath).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (applied.rowCount > 0) continue;
      const sql = fs.readFileSync(path.join(migrationsPath, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
