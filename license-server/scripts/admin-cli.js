"use strict";

function loadLocalEnv() {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = tokens[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

async function request(url, token, method, path, body) {
  const response = await fetch(new URL(path, url), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function main() {
  loadLocalEnv();
  const adminUrl = String(process.env.ADMIN_API_URL || "").trim();
  const adminToken = String(process.env.ADMIN_API_TOKEN || "").trim();
  if (!adminUrl || !adminToken) throw new Error("ADMIN_API_URL and ADMIN_API_TOKEN are required");
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "issue") {
    const result = await request(adminUrl, adminToken, "POST", "/admin/licenses", {
      buyerEmail: options.email,
      paymentReference: options.payment,
      notes: options.note,
      maxDevices: options.devices ? Number(options.devices) : undefined,
      expiresAt: options.expires,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "list") {
    const limit = options.limit || "50";
    console.log(JSON.stringify(await request(adminUrl, adminToken, "GET", `/admin/licenses?limit=${encodeURIComponent(limit)}`), null, 2));
    return;
  }
  if (command === "revoke") {
    if (!options.license) throw new Error("--license is required");
    console.log(JSON.stringify(await request(adminUrl, adminToken, "POST", `/admin/licenses/${options.license}/revoke`), null, 2));
    return;
  }
  if (command === "reset-device") {
    if (!options.license || !options.device) throw new Error("--license and --device are required");
    const path = `/admin/licenses/${options.license}/devices/${options.device}/deactivate`;
    console.log(JSON.stringify(await request(adminUrl, adminToken, "POST", path), null, 2));
    return;
  }
  throw new Error("Commands: issue, list, revoke, reset-device");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
