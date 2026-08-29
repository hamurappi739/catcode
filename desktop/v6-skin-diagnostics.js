"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FLAG = "--catcode-v6-skin-diagnostics";
const FILE_NAME = "v6-skin-diagnostics.jsonl";
const QA_MARKER_FILE = "v6-skin-diagnostics-qa.marker";
const MAX_BYTES = 128 * 1024;

function isEnabled(argv = process.argv) {
  return Array.isArray(argv) && argv.includes(FLAG);
}

function isQaPackage(resourcesPath = process.resourcesPath) {
  return (
    typeof resourcesPath === "string" &&
    resourcesPath.length > 0 &&
    fs.existsSync(path.join(resourcesPath, QA_MARKER_FILE))
  );
}

function createController({ enabled = false, userDataPath = "" } = {}) {
  const logPath = userDataPath ? path.join(userDataPath, "logs", FILE_NAME) : null;
  function record(event) {
    if (!enabled || !logPath || !event || typeof event !== "object") return;
    const safe = {
      ts: new Date().toISOString(),
      stage: String(event.stage || "unknown").slice(0, 48),
      skin: String(event.skin || "").slice(0, 24),
      asset: String(event.asset || "").replace(/[^a-zA-Z0-9_./-]/g, "").slice(0, 140),
      outcome: String(event.outcome || "").slice(0, 48),
      reason: String(event.reason || "").replace(/[\r\n\t]+/g, " ").slice(0, 180),
    };
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      const line = `${JSON.stringify(safe)}\n`;
      const previous = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
      if (previous + Buffer.byteLength(line) > MAX_BYTES) fs.writeFileSync(logPath, "");
      fs.appendFileSync(logPath, line);
    } catch {
      // Diagnostics must never affect the pet.
    }
  }
  return { enabled: !!enabled, logPath, record };
}

let active = createController();
function init(options) {
  active = createController(options);
  return active;
}
function get() {
  return active;
}

module.exports = {
  FLAG,
  FILE_NAME,
  QA_MARKER_FILE,
  isEnabled,
  isQaPackage,
  createController,
  init,
  get,
};
