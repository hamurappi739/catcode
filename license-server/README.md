# CatCode License Server

This service issues and validates licenses for the CatCode desktop application. Only its activation, refresh, deactivation, and health endpoints are reachable from the Internet. License management runs directly inside the private API container after an SSH login to the VPS.

It is designed for manual payments: after confirming a transfer, the owner issues one key with the admin command. The server stores only an HMAC of the key, not the key itself. A desktop client receives a short-lived Ed25519-signed entitlement and a per-device refresh token.

Operational backups, monitoring, and recovery procedures are in [`../docs/SERVER_OPERATIONS.md`](../docs/SERVER_OPERATIONS.md).

## What is stored

- License prefix, HMAC, product, status, optional email and payment reference.
- HMAC of the installation identifier and refresh token.
- Minimal activation events with an HMAC of the IP address.

Do not put raw license keys, bank-card data, or the Supabase service-role key in the desktop application.

## Local setup

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Run `npm run generate-secrets` and place the values in `.env`.
4. Set `DATABASE_URL` and `DATABASE_SSL`. Use a dedicated Postgres database and role with access only to this database.
5. Run `npm run migrate`.
6. For local development only, set `ALLOW_INSECURE_HTTP=true` and run `npm run dev`.

## Production VPS setup

1. Place this directory on the VPS without `.env` in source control.
2. Run the one-off bootstrap container below once. It creates `.env` with new HMAC and Ed25519 keys and mode `600`; it refuses to overwrite an existing file. The explicit user mapping keeps `.env` owned by `catcode` rather than `root`.

   ```bash
   sudo docker run --rm --user "$(id -u):$(id -g)" \
     -v "$PWD:/app" -w /app node:24-alpine node scripts/bootstrap-env.js
   ```

   Add the production `DATABASE_URL`, then confirm `API_DOMAIN`, `DATABASE_SSL=true`, and `ALLOW_INSECURE_HTTP=false`.
3. Point `API_DOMAIN` to the VPS before starting the stack. For the current CatCode VPS it is `catcode-license-739.duckdns.org`.
4. Apply migrations once: `sudo docker compose run --rm license-api node scripts/migrate.js`.
5. Before starting the public API, create a restricted runtime database role. This moves the administrator connection string into `.migration.env`, which the API container never receives:

   ```bash
   sudo docker compose build license-api
   sudo docker compose run --rm --user "$(id -u):$(id -g)" \
     -v "$PWD:/workspace" -w /workspace license-api \
     sh -c 'NODE_PATH=/app/node_modules node scripts/provision-runtime-role.js'
   ```

6. Start the stack: `sudo docker compose up -d --build`.
7. Verify `https://$API_DOMAIN/healthz` returns `{"ok":true}` and Caddy has obtained a certificate.
8. Pin the public Ed25519 key printed by `node scripts/bootstrap-env.js` into the desktop client before building the installer.

Only Caddy publishes ports `80`, `443`, and `443/udp`. The API has no host port: it is visible only to Caddy within the Compose network. Caddy uses the official `2.11.4-alpine` image and automatically obtains and renews HTTPS certificates when the DuckDNS name resolves to the VPS.

For this IPv4-only VPS, copy the **Shared Pooler, Session mode** connection string from Supabase Connect (port `5432`) into `DATABASE_URL`. Download the CA certificate from **Database > Settings > SSL Configuration** in Supabase, copy it to the VPS as `supabase-ca.crt`, then run the one-off command below before migrating:

```bash
sudo docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/app" -w /app node:24-alpine node scripts/set-ca-cert.js /app/supabase-ca.crt
```

The API verifies the Supabase certificate rather than disabling TLS verification. Do not use a Supabase URL, anon key, or service-role key in the desktop app or in this file.

For future schema changes, run migrations only through the maintenance profile. It receives `.migration.env`; the public API does not.

```bash
sudo docker compose --profile maintenance run --rm license-migrate
```

## Manual payment flow

After you verify a payment, SSH to the VPS and issue a key inside the API container:

```bash
cd /home/catcode/catcode-license-server
sudo docker compose --profile maintenance run --rm license-admin node scripts/admin-direct.js issue \
  --payment transfer-2026-0001 --devices 1
```

Add `--email buyer@example.ru` only after the data-location and privacy decision for buyer data has been made. The command prints the full key once. Send it to the buyer through the agreed channel, then remove it from any temporary notes.

Useful support commands:

```bash
sudo docker compose --profile maintenance run --rm license-admin node scripts/admin-direct.js list
sudo docker compose --profile maintenance run --rm license-admin node scripts/admin-direct.js devices --license LICENSE_UUID
sudo docker compose --profile maintenance run --rm license-admin node scripts/admin-direct.js revoke --license LICENSE_UUID
sudo docker compose --profile maintenance run --rm license-admin node scripts/admin-direct.js reset-device \
  --license LICENSE_UUID --device DEVICE_UUID
```

For regular manual sales, use the guided owner console after connecting to the VPS over SSH:

```bash
cd /home/catcode/catcode-license-server
bash scripts/license-console.sh
```

It can issue a key, show an overview, inspect one license with its devices and events, revoke a license, or free one device slot. The console is not exposed to the Internet and requires the VPS account plus `sudo`.

## Owner dashboard

The browser dashboard is available at `https://$API_DOMAIN/admin`. It lists license activity and devices, issues a key, frees a device slot, and revokes a license. The list is paginated at 100 rows per page and reports the database total, so it remains usable after more than 100 keys have been issued. Licenses are intentionally never deleted: revocation preserves the payment and activation history needed for support.

The dashboard runs in a separate `admin-dashboard` container. It receives `.admin.env`; the public `license-api` container does not receive administrator database credentials. Caddy protects `/admin` with HTTPS Basic Auth. Create its private configuration before deploying the dashboard:

```bash
cd /home/catcode/catcode-license-server
cp .dashboard.env.example .dashboard.env
chmod 600 .dashboard.env
sudo docker run --rm caddy:2.11.4-alpine caddy hash-password --plaintext 'choose-a-long-unique-password'
```

Put the printed hash, not the plaintext password, in `ADMIN_DASHBOARD_PASSWORD_HASH` in `.dashboard.env`. Wrap the bcrypt hash in single quotes so Docker Compose keeps its `$` characters unchanged. Set a non-obvious username too. Then deploy with `sudo docker compose up -d --build` and open the `/admin` URL. Do not share the password or hash in chat, source control, or buyer documentation.

Run the maintenance migration after deploying an updated server source. It adds the private `catcode_admin.license_overview` view for the Supabase SQL Editor; the view shows payment reference, status, device count, and last activity without exposing it through the Data API:

```bash
sudo docker compose --profile maintenance run --rm license-migrate
```

Revoking a license denies its next online refresh and prevents the app from launching online. CatCode also checks the license at startup and every 15 minutes while it is running. Temporary refresh failures, rate limits, and network errors must not erase the locally stored license; the app may use a still-valid signed entitlement offline until it expires. A user who remains offline can use an already-issued entitlement until it expires; use `ENTITLEMENT_TTL_SECONDS=86400` for a one-day maximum offline interval.

The `license-admin` container receives only the administrator database URI and `LICENSE_KEY_HMAC_SECRET`; it never receives the entitlement signing key.

## Desktop contract

`POST /v1/licenses/activate` accepts a license key, locally generated installation ID, device name, and app version. It returns an entitlement, refresh token, license metadata, and a server device ID.

`POST /v1/licenses/refresh` accepts the device ID, refresh token, and app version. It returns a renewed entitlement. The client should store the refresh token using Electron safeStorage, pin the public key, verify the entitlement locally, and refuse access after it expires unless it is inside an explicitly chosen offline grace period.

`POST /v1/licenses/deactivate` releases one device.

The desktop application must never trust a locally editable `licensed: true` flag as proof of purchase.
