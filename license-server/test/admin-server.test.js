"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminServer, parseIssue } = require("../src/admin-server");

function fakeStore() {
  return {
    async listLicenseOverview({ limit } = {}) { return Array.from({ length: Math.min(limit || 100, 2) }, (_, index) => ({ id: `license-${index}`, status: "active" })); },
    async countLicenseOverview() { return { total: 202, active_total: 200 }; },
    async getLicenseOverview(id) { return { id, key_prefix: "CAT-TEST", status: "active" }; },
    async listDevices() { return []; },
    async listLicenseEvents() { return []; },
    async createLicense(input) { return { id: "bc56d79e-fbc9-4ac6-a3d2-b58d9fa7ee06", keyPrefix: "CAT-TEST", productCode: input.productCode, maxDevices: input.maxDevices }; },
    async revokeLicense() { return { ok: true }; },
    async deactivateDeviceForAdmin() { return { ok: true }; },
  };
}

async function start() {
  const server = createAdminServer({ config: { licenseKeyHmacSecret: "test-secret" }, store: fakeStore() });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test("dashboard only serves administrative routes over forwarded HTTPS", async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  const insecure = await fetch(`${base}/admin`);
  assert.equal(insecure.status, 400);
  const secure = await fetch(`${base}/admin`, { headers: { "x-forwarded-proto": "https" } });
  assert.equal(secure.status, 200);
  assert.match(secure.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("dashboard issues a perpetual one-device license from a same-origin request", async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  const host = new URL(base).host;
  const response = await fetch(`${base}/admin/api/licenses`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-proto": "https", origin: `https://${host}` },
    body: JSON.stringify({ paymentReference: "card-1", maxDevices: 1 }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.match(body.license.key, /^CAT-/);
  assert.equal(body.license.maxDevices, 1);
});

test("license list is paginated and reports totals beyond the first 100 rows", async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  const response = await fetch(`${base}/admin/api/licenses?page=2&limit=100`, {
    headers: { "x-forwarded-proto": "https" },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.page, 2);
  assert.equal(body.limit, 100);
  assert.equal(body.total, 202);
  assert.equal(body.activeTotal, 200);
  assert.equal(body.hasPreviousPage, true);
  assert.equal(body.hasNextPage, true);
});

test("license list rejects zero or oversized page sizes", async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  for (const limit of ["0", "101"]) {
    const response = await fetch(`${base}/admin/api/licenses?limit=${limit}`, {
      headers: { "x-forwarded-proto": "https" },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_pagination" });
  }
});

test("dashboard validates issue input before database writes", () => {
  assert.equal(parseIssue({ paymentReference: "card-1", maxDevices: 1 }).paymentReference, "card-1");
  assert.throws(() => parseIssue({ paymentReference: "card-1", buyerEmail: "not-an-email", maxDevices: 1 }));
  assert.throws(() => parseIssue({ paymentReference: "card-1", maxDevices: 11 }));
});
