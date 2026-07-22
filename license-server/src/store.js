"use strict";

const crypto = require("node:crypto");

class StoreError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

function isLicenseActive(license, now = Date.now()) {
  if (!license || license.status !== "active") return false;
  return !license.expires_at || new Date(license.expires_at).getTime() > now;
}

function invalidatedRefreshTokenHmac() {
  return crypto.randomBytes(32).toString("hex");
}

function publicLicense(license) {
  return {
    id: license.id,
    productCode: license.product_code,
    status: license.status,
    maxDevices: license.max_devices,
    expiresAt: license.expires_at ? new Date(license.expires_at).toISOString() : null,
  };
}

function publicDevice(device) {
  return {
    id: device.id,
    name: device.device_name,
    appVersion: device.app_version,
    firstActivatedAt: new Date(device.first_activated_at).toISOString(),
    lastSeenAt: new Date(device.last_seen_at).toISOString(),
  };
}

function createStore(pool) {
  async function addEvent(client, { licenseId = null, deviceId = null, eventType, ipHmac = null, metadata = {} }) {
    await client.query(
      `INSERT INTO license_events (id, license_id, device_id, event_type, ip_hmac, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [crypto.randomUUID(), licenseId, deviceId, eventType, ipHmac, JSON.stringify(metadata)],
    );
  }

  async function createLicense({ key, keyHmac, buyerEmail, paymentReference, notes, productCode, maxDevices, expiresAt, ipHmac }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const license = {
        id: crypto.randomUUID(),
        keyPrefix: key.slice(0, 10),
        keyHmac,
        buyerEmail,
        paymentReference,
        notes,
        productCode,
        maxDevices,
        expiresAt,
      };
      await client.query(
        `INSERT INTO licenses
         (id, key_prefix, key_hmac, buyer_email, payment_reference, notes, product_code, max_devices, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [license.id, license.keyPrefix, license.keyHmac, buyerEmail, paymentReference, notes, productCode, maxDevices, expiresAt],
      );
      await addEvent(client, {
        licenseId: license.id,
        eventType: "license_issued",
        ipHmac,
        metadata: { productCode, maxDevices, expiresAt: expiresAt || null },
      });
      await client.query("COMMIT");
      return { ...license, key };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function activate({ keyHmac, installationIdHmac, refreshTokenHmac, deviceName, appVersion, ipHmac }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const licenseResult = await client.query(
        "SELECT id, key_hmac, product_code, status, max_devices, expires_at FROM licenses WHERE key_hmac = $1 FOR UPDATE",
        [keyHmac],
      );
      const license = licenseResult.rows[0];
      if (!license) throw new StoreError("license_invalid");
      if (license.status === "revoked") throw new StoreError("license_revoked");
      if (!isLicenseActive(license)) throw new StoreError("license_expired");

      const deviceResult = await client.query(
        `SELECT id, license_id, installation_id_hmac, refresh_token_hmac, device_name, app_version,
                first_activated_at, last_seen_at, deactivated_at
         FROM license_devices WHERE license_id = $1 AND installation_id_hmac = $2 FOR UPDATE`,
        [license.id, installationIdHmac],
      );
      let device = deviceResult.rows[0];
      if (!device || device.deactivated_at) {
        const activeCount = await client.query(
          "SELECT count(*)::int AS count FROM license_devices WHERE license_id = $1 AND deactivated_at IS NULL",
          [license.id],
        );
        if (activeCount.rows[0].count >= license.max_devices) throw new StoreError("device_limit");
        const deviceId = device ? device.id : crypto.randomUUID();
        if (device) {
          const result = await client.query(
            `UPDATE license_devices
             SET refresh_token_hmac = $1, device_name = $2, app_version = $3, last_seen_at = now(), deactivated_at = NULL
             WHERE id = $4 RETURNING *`,
            [refreshTokenHmac, deviceName, appVersion, deviceId],
          );
          device = result.rows[0];
        } else {
          const result = await client.query(
            `INSERT INTO license_devices
             (id, license_id, installation_id_hmac, refresh_token_hmac, device_name, app_version)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [deviceId, license.id, installationIdHmac, refreshTokenHmac, deviceName, appVersion],
          );
          device = result.rows[0];
        }
      } else {
        const result = await client.query(
          `UPDATE license_devices
           SET refresh_token_hmac = $1, device_name = $2, app_version = $3, last_seen_at = now()
           WHERE id = $4 RETURNING *`,
          [refreshTokenHmac, deviceName, appVersion, device.id],
        );
        device = result.rows[0];
      }
      await addEvent(client, {
        licenseId: license.id,
        deviceId: device.id,
        eventType: "license_activated",
        ipHmac,
        metadata: { appVersion },
      });
      await client.query("COMMIT");
      return { license: publicLicense(license), device: publicDevice(device) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function refresh({ deviceId, refreshTokenHmac, appVersion, ipHmac }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT l.id, l.product_code, l.status, l.max_devices, l.expires_at,
                d.id AS device_id, d.device_name, d.app_version AS device_app_version,
                d.first_activated_at, d.last_seen_at, d.deactivated_at
         FROM license_devices d JOIN licenses l ON l.id = d.license_id
         WHERE d.id = $1 AND d.refresh_token_hmac = $2 FOR UPDATE`,
        [deviceId, refreshTokenHmac],
      );
      const row = result.rows[0];
      if (!row || row.deactivated_at) throw new StoreError("session_invalid");
      if (row.status === "revoked") throw new StoreError("license_revoked");
      if (!isLicenseActive(row)) throw new StoreError("license_expired");
      const update = await client.query(
        "UPDATE license_devices SET app_version = $1, last_seen_at = now() WHERE id = $2 RETURNING *",
        [appVersion, deviceId],
      );
      const device = update.rows[0];
      await addEvent(client, {
        licenseId: row.id,
        deviceId,
        eventType: "entitlement_refreshed",
        ipHmac,
        metadata: { appVersion },
      });
      await client.query("COMMIT");
      return { license: publicLicense(row), device: publicDevice(device) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function deactivate({ deviceId, refreshTokenHmac, ipHmac }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE license_devices SET deactivated_at = now(), refresh_token_hmac = $1
         WHERE id = $2 AND refresh_token_hmac = $3 AND deactivated_at IS NULL RETURNING license_id`,
        [invalidatedRefreshTokenHmac(), deviceId, refreshTokenHmac],
      );
      if (!result.rows[0]) throw new StoreError("session_invalid");
      await addEvent(client, {
        licenseId: result.rows[0].license_id,
        deviceId,
        eventType: "device_deactivated",
        ipHmac,
      });
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function listLicenses(limit = 50) {
    const result = await pool.query(
      `SELECT id, key_prefix, product_code, buyer_email, payment_reference, notes,
              CASE
                WHEN status = 'active' AND expires_at IS NOT NULL AND expires_at <= now() THEN 'expired'
                ELSE status
              END AS status,
              max_devices, expires_at, created_at, revoked_at
       FROM licenses ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async function listLicenseOverview(limit = 50) {
    const result = await pool.query(
      `SELECT id, key_prefix, product_code, status, buyer_email, payment_reference, notes,
              max_devices, expires_at, created_at, updated_at, revoked_at,
              active_device_count, last_seen_at, first_activated_at
       FROM catcode_admin.license_overview
       ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async function getLicenseOverview(licenseId) {
    const result = await pool.query(
      `SELECT id, key_prefix, product_code, status, buyer_email, payment_reference, notes,
              max_devices, expires_at, created_at, updated_at, revoked_at,
              active_device_count, last_seen_at, first_activated_at
       FROM catcode_admin.license_overview WHERE id = $1`,
      [licenseId],
    );
    return result.rows[0] || null;
  }

  async function listLicenseEvents(licenseId, limit = 50) {
    const result = await pool.query(
      `SELECT id, device_id, event_type, metadata, created_at
       FROM license_events WHERE license_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [licenseId, limit],
    );
    return result.rows;
  }

  async function listDevices(licenseId) {
    const result = await pool.query(
      `SELECT id, license_id, device_name, app_version, first_activated_at, last_seen_at, deactivated_at
       FROM license_devices WHERE license_id = $1 ORDER BY first_activated_at DESC`,
      [licenseId],
    );
    return result.rows;
  }

  async function revokeLicense(licenseId, ipHmac) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE licenses SET status = 'revoked', revoked_at = now(), updated_at = now() WHERE id = $1 AND status <> 'revoked' RETURNING id",
        [licenseId],
      );
      if (!result.rows[0]) throw new StoreError("license_not_found");
      await addEvent(client, { licenseId, eventType: "license_revoked", ipHmac });
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function revokeAllLicenses(ipHmac) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "UPDATE licenses SET status = 'revoked', revoked_at = now(), updated_at = now() WHERE status <> 'revoked' RETURNING id",
      );
      for (const { id: licenseId } of result.rows) {
        await addEvent(client, { licenseId, eventType: "license_revoked", ipHmac });
      }
      await client.query("COMMIT");
      return { ok: true, revoked: result.rowCount };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function deactivateDeviceForAdmin(licenseId, deviceId, ipHmac) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE license_devices SET deactivated_at = now(), refresh_token_hmac = $1
         WHERE license_id = $2 AND id = $3 AND deactivated_at IS NULL RETURNING id`,
        [invalidatedRefreshTokenHmac(), licenseId, deviceId],
      );
      if (!result.rows[0]) throw new StoreError("device_not_found");
      await addEvent(client, { licenseId, deviceId, eventType: "device_reset_by_admin", ipHmac });
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    activate,
    createLicense,
    deactivate,
    deactivateDeviceForAdmin,
    getLicenseOverview,
    listDevices,
    listLicenseEvents,
    listLicenseOverview,
    listLicenses,
    refresh,
    revokeAllLicenses,
    revokeLicense,
  };
}

module.exports = { StoreError, createStore };
