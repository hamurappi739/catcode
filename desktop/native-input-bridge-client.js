"use strict";

/**
 * V6-INPUT-M6: Windows native input bridge client (Electron side).
 * Spawns the packaged helper, connects to its ACL'd named pipe, validates
 * hello/status, and maps allowlisted pulses to the existing IPC contract.
 */

const crypto = require("crypto");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const PROTOCOL_VERSION = 1;
const PRIVACY_CONTRACT_VERSION = "m6-v1";
const MAX_LINE_BYTES = 512;
const PIPE_PREFIX = "catcode-m6-";

/** Rate limits: support fast typing + wheel without forwarding floods. */
const KEY_RATE_PER_SEC = 50;
const WHEEL_RATE_PER_SEC = 80;

const SENSITIVE_FIELD_DENYLIST = Object.freeze([
  "keycode",
  "keyCode",
  "rawcode",
  "key",
  "code",
  "text",
  "typed",
  "clipboard",
  "title",
  "windowTitle",
  "cursor",
  "clientX",
  "clientY",
  "screenX",
  "screenY",
  "rotation",
  "amount",
  "delta",
  "x",
  "y",
  "vk",
  "scan",
  "payload",
  "raw",
  "token",
]);

function createUniquePipeName(randomBytes = crypto.randomBytes) {
  const token = randomBytes(16).toString("hex");
  const shortName = `${PIPE_PREFIX}${token}`;
  return {
    shortName,
    fullPath: `\\\\.\\pipe\\${shortName}`,
    entropyBits: 128,
  };
}

function createSessionToken(randomBytes = crypto.randomBytes) {
  return randomBytes(16).toString("hex");
}

function resolveNativeBridgeExePath({
  resourcesPath = process.resourcesPath || null,
  appDir = null,
  existsSync = fs.existsSync,
  join = path.join,
} = {}) {
  const candidates = [];
  if (resourcesPath) {
    candidates.push(join(resourcesPath, "native-input-bridge.exe"));
    candidates.push(
      join(
        resourcesPath,
        "app.asar.unpacked",
        "native",
        "windows",
        "native-input-bridge.exe",
      ),
    );
  }
  if (appDir) {
    candidates.push(join(appDir, "native", "windows", "native-input-bridge.exe"));
  }
  // Dev / unpack fallback next to desktop tree.
  candidates.push(
    join(__dirname, "native", "windows", "native-input-bridge.exe"),
  );
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function parseBridgeLine(line) {
  if (typeof line !== "string") {
    return { kind: "reject", reason: "not-string" };
  }
  if (Buffer.byteLength(line, "utf8") > MAX_LINE_BYTES) {
    return { kind: "reject", reason: "oversized" };
  }
  const trimmed = line.trim();
  if (!trimmed) return { kind: "reject", reason: "empty" };

  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch (_) {
    return { kind: "reject", reason: "invalid-json" };
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { kind: "reject", reason: "not-object" };
  }
  if (obj.v !== PROTOCOL_VERSION) {
    return { kind: "reject", reason: "bad-version" };
  }
  if (typeof obj.type !== "string") {
    return { kind: "reject", reason: "bad-type" };
  }
  for (const bad of SENSITIVE_FIELD_DENYLIST) {
    if (Object.prototype.hasOwnProperty.call(obj, bad)) {
      return { kind: "reject", reason: `sensitive-field:${bad}` };
    }
  }

  if (obj.type === "hello-ack") {
    return {
      kind: "hello-ack",
      helperVersion:
        obj.helperVersion != null ? String(obj.helperVersion).slice(0, 32) : null,
      injectedEventsSkipped: !!obj.injectedEventsSkipped,
    };
  }
  if (obj.type === "status") {
    return {
      kind: "status",
      helperVersion:
        obj.helperVersion != null ? String(obj.helperVersion).slice(0, 32) : null,
      keyboardOk: !!obj.keyboardOk,
      mouseOk: !!obj.mouseOk,
      keyboardError: Number(obj.keyboardError) || 0,
      mouseError: Number(obj.mouseError) || 0,
      keyboardErrorText: obj.keyboardErrorText
        ? String(obj.keyboardErrorText).slice(0, 200)
        : null,
      mouseErrorText: obj.mouseErrorText
        ? String(obj.mouseErrorText).slice(0, 200)
        : null,
      hModObtained: !!obj.hModObtained,
      injectedEventsSkipped: !!obj.injectedEventsSkipped,
    };
  }
  if (obj.type === "bye") return { kind: "bye" };
  if (obj.type === "key") {
    for (const k of Object.keys(obj)) {
      if (k !== "v" && k !== "type") {
        return { kind: "reject", reason: `extra-key-field:${k}` };
      }
    }
    return { kind: "event", eventType: "key" };
  }
  if (obj.type === "wheel") {
    if (obj.direction !== -1 && obj.direction !== 1) {
      return { kind: "reject", reason: "bad-direction" };
    }
    for (const k of Object.keys(obj)) {
      if (k !== "v" && k !== "type" && k !== "direction") {
        return { kind: "reject", reason: `extra-wheel-field:${k}` };
      }
    }
    return { kind: "event", eventType: "wheel", direction: obj.direction };
  }
  return { kind: "reject", reason: `unknown-type:${obj.type}` };
}

function createRateLimiter({
  keyPerSec = KEY_RATE_PER_SEC,
  wheelPerSec = WHEEL_RATE_PER_SEC,
  now = () => Date.now(),
} = {}) {
  let keyWindowStart = 0;
  let keyCount = 0;
  let wheelWindowStart = 0;
  let wheelCount = 0;
  let droppedKeys = 0;
  let droppedWheels = 0;

  function allow(kind) {
    const t = now();
    if (kind === "key") {
      if (t - keyWindowStart >= 1000) {
        keyWindowStart = t;
        keyCount = 0;
      }
      if (keyCount >= keyPerSec) {
        droppedKeys += 1;
        return false;
      }
      keyCount += 1;
      return true;
    }
    if (kind === "wheel") {
      if (t - wheelWindowStart >= 1000) {
        wheelWindowStart = t;
        wheelCount = 0;
      }
      if (wheelCount >= wheelPerSec) {
        droppedWheels += 1;
        return false;
      }
      wheelCount += 1;
      return true;
    }
    return false;
  }

  return {
    allow,
    stats: () => ({ droppedKeys, droppedWheels }),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a Windows native-bridge session manager.
 */
function createNativeBridgeSession({
  resourcesPath = process.resourcesPath || null,
  appDir = null,
  spawnFn = spawn,
  connectFn = null,
  resolveExePath = resolveNativeBridgeExePath,
  randomBytes = crypto.randomBytes,
  logWarn = null,
  onKeyPulse = null,
  onWheelPulse = null,
  onDisconnected = null,
} = {}) {
  let epoch = 0;
  let child = null;
  let socket = null;
  let buffer = "";
  let phase = "idle"; // idle|connecting|hello|ready|stopping
  let helloAck = null;
  let status = null;
  let limiter = createRateLimiter();
  let rejectedCount = 0;
  let activeEpoch = 0;

  function warn(...args) {
    if (typeof logWarn === "function") logWarn(...args);
  }

  function clearSocket() {
    if (socket) {
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch (_) {}
    }
    socket = null;
    buffer = "";
  }

  function killChild() {
    if (!child) return;
    const proc = child;
    child = null;
    try {
      if (proc.exitCode == null && !proc.killed) proc.kill();
    } catch (_) {}
  }

  function handleParsed(parsed, forEpoch) {
    if (forEpoch !== activeEpoch) return;
    if (!parsed || parsed.kind === "reject") {
      rejectedCount += 1;
      return;
    }
    if (parsed.kind === "hello-ack") {
      helloAck = parsed;
      return;
    }
    if (parsed.kind === "status") {
      status = parsed;
      return;
    }
    if (parsed.kind === "bye") {
      return;
    }
    if (parsed.kind === "event" && phase === "ready") {
      if (parsed.eventType === "key") {
        if (!limiter.allow("key")) return;
        if (typeof onKeyPulse === "function") onKeyPulse();
      } else if (parsed.eventType === "wheel") {
        if (!limiter.allow("wheel")) return;
        if (typeof onWheelPulse === "function") {
          onWheelPulse(parsed.direction);
        }
      }
    }
  }

  function onSocketData(chunk, forEpoch) {
    if (forEpoch !== activeEpoch) return;
    buffer += chunk;
    if (buffer.length > MAX_LINE_BYTES * 8) {
      rejectedCount += 1;
      buffer = "";
      return;
    }
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      handleParsed(parseBridgeLine(line), forEpoch);
    }
  }

  async function connectWithRetry(fullPath, forEpoch, attempts = 40) {
    const connect =
      connectFn ||
      ((pipePath) =>
        new Promise((resolve, reject) => {
          const s = net.connect(pipePath);
          const onErr = (err) => {
            s.destroy();
            reject(err);
          };
          s.once("error", onErr);
          s.once("connect", () => {
            s.removeListener("error", onErr);
            resolve(s);
          });
        }));

    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
      if (forEpoch !== activeEpoch) {
        throw new Error("bridge epoch cancelled");
      }
      try {
        return await connect(fullPath);
      } catch (err) {
        lastErr = err;
        await sleep(50);
      }
    }
    throw lastErr || new Error("pipe connect failed");
  }

  async function readUntil(predicate, forEpoch, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (forEpoch !== activeEpoch) throw new Error("bridge epoch cancelled");
      if (predicate()) return;
      await sleep(20);
    }
    throw new Error("bridge handshake timeout");
  }

  async function start() {
    await stop({ silent: true });
    epoch += 1;
    activeEpoch = epoch;
    const forEpoch = activeEpoch;
    phase = "connecting";
    helloAck = null;
    status = null;
    rejectedCount = 0;
    limiter = createRateLimiter();

    const exePath = resolveExePath({ resourcesPath, appDir });
    if (!exePath) {
      phase = "idle";
      const err = new Error("native-input-bridge.exe not found");
      err.code = "BRIDGE_EXE_MISSING";
      throw err;
    }

    const pipe = createUniquePipeName(randomBytes);
    const token = createSessionToken(randomBytes);

    try {
      child = spawnFn(
        exePath,
        ["--pipe", pipe.shortName, "--token", token],
        {
          stdio: ["ignore", "ignore", "ignore"],
          windowsHide: true,
          detached: false,
        },
      );
    } catch (err) {
      phase = "idle";
      const wrapped = new Error(
        err && err.message ? err.message : "failed to spawn bridge",
      );
      wrapped.code = "BRIDGE_SPAWN_FAILED";
      throw wrapped;
    }

    child.on("exit", () => {
      if (forEpoch !== activeEpoch) return;
      if (phase === "ready" || phase === "hello" || phase === "connecting") {
        phase = "idle";
        clearSocket();
        if (typeof onDisconnected === "function") {
          try {
            onDisconnected(new Error("bridge helper exited"));
          } catch (_) {}
        }
      }
    });

    try {
      socket = await connectWithRetry(pipe.fullPath, forEpoch);
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => onSocketData(chunk, forEpoch));
      socket.on("error", () => {});
      socket.on("close", () => {
        if (forEpoch !== activeEpoch) return;
        if (phase === "ready") {
          phase = "idle";
          if (typeof onDisconnected === "function") {
            try {
              onDisconnected(new Error("bridge pipe closed"));
            } catch (_) {}
          }
        }
      });

      phase = "hello";
      socket.write(
        `${JSON.stringify({ v: PROTOCOL_VERSION, type: "hello", token })}\n`,
      );

      await readUntil(() => helloAck != null, forEpoch, 5000);
      await readUntil(() => status != null, forEpoch, 5000);

      if (!status.keyboardOk && !status.mouseOk) {
        const err = new Error(
          `bridge hooks failed (k=${status.keyboardError}, m=${status.mouseError})`,
        );
        err.code = "BRIDGE_HOOKS_FAILED";
        throw err;
      }

      // Available only after hello-ack + successful hook status.
      phase = "ready";
      return {
        ok: true,
        helperVersion: status.helperVersion || (helloAck && helloAck.helperVersion),
        keyboardOk: !!status.keyboardOk,
        mouseOk: !!status.mouseOk,
        keyboardError: status.keyboardError,
        mouseError: status.mouseError,
        pipeNameRecorded: false,
        pipeEntropyBits: pipe.entropyBits,
        privacyContractVersion: PRIVACY_CONTRACT_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        exePath,
      };
    } catch (err) {
      await stop({ silent: true, epoch: forEpoch });
      throw err;
    }
  }

  async function stop({ silent = false, epoch: stopEpoch = null } = {}) {
    const forEpoch = stopEpoch == null ? activeEpoch : stopEpoch;
    if (stopEpoch == null) {
      activeEpoch += 1;
      epoch = activeEpoch;
    }
    phase = "stopping";
    try {
      if (socket && !socket.destroyed) {
        try {
          socket.write(
            `${JSON.stringify({ v: PROTOCOL_VERSION, type: "shutdown" })}\n`,
          );
        } catch (_) {}
        await sleep(150);
      }
    } catch (_) {}
    clearSocket();
    killChild();
    await sleep(50);
    phase = "idle";
    if (!silent) {
      warn("[CatCode] native input bridge stopped");
    }
    return { epoch: forEpoch };
  }

  return {
    start,
    stop,
    getPhase: () => phase,
    getStatus: () => (status ? { ...status } : null),
    getRejectedCount: () => rejectedCount,
    getRateLimitStats: () => limiter.stats(),
    getEpoch: () => activeEpoch,
    PROTOCOL_VERSION,
    PRIVACY_CONTRACT_VERSION,
    KEY_RATE_PER_SEC,
    WHEEL_RATE_PER_SEC,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  PRIVACY_CONTRACT_VERSION,
  MAX_LINE_BYTES,
  PIPE_PREFIX,
  KEY_RATE_PER_SEC,
  WHEEL_RATE_PER_SEC,
  SENSITIVE_FIELD_DENYLIST,
  createUniquePipeName,
  createSessionToken,
  resolveNativeBridgeExePath,
  parseBridgeLine,
  createRateLimiter,
  createNativeBridgeSession,
};
