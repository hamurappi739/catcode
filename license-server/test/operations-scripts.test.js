"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const backup = fs.readFileSync(path.join(root, "scripts", "backup-database.sh"), "utf8");
const healthcheck = fs.readFileSync(path.join(root, "scripts", "healthcheck.sh"), "utf8");
const systemdDir = path.join(root, "deploy", "systemd");

test("backup script verifies TLS and requires offsite storage by default", () => {
  assert.match(backup, /PGSSLMODE=verify-full/);
  assert.match(backup, /PGSSLROOTCERT/);
  assert.match(backup, /REQUIRE_OFFSITE_BACKUP:-true/);
  assert.match(backup, /rclone copy --immutable/);
});

test("health check validates both public HTTPS and Docker health", () => {
  assert.match(healthcheck, /--proto '=https'/);
  assert.match(healthcheck, /docker compose ps --quiet license-api/);
  assert.match(healthcheck, /\.State\.Health\.Status/);
});

test("systemd timers run backups daily and health checks every five minutes", () => {
  const backupTimer = fs.readFileSync(path.join(systemdDir, "catcode-license-backup.timer"), "utf8");
  const healthTimer = fs.readFileSync(path.join(systemdDir, "catcode-license-healthcheck.timer"), "utf8");
  assert.match(backupTimer, /OnCalendar=\*-\*-\* 03:25:00 UTC/);
  assert.match(healthTimer, /OnCalendar=\*:0\/5/);
});
