# CatCode License Server

This service issues and validates licenses for the CatCode desktop application.

It is designed for manual payments: after confirming a transfer, the owner issues one key with the admin command. The server stores only an HMAC of the key, not the key itself. A desktop client receives a short-lived Ed25519-signed entitlement and a per-device refresh token.

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
2. Create `.env` with production secrets, `DATABASE_SSL=true`, and `ALLOW_INSECURE_HTTP=false`.
3. Point a dedicated subdomain such as `api.example.ru` to the VPS.
4. Replace `api.example.ru` in `Caddyfile.example`, install Caddy, and use it as the only public listener on ports 80 and 443.
5. Run `docker compose up -d --build`.
6. Apply migrations once with `docker compose run --rm license-api node scripts/migrate.js`.
7. Pin the public Ed25519 key printed by `npm run generate-secrets` into the desktop client before building the installer.

The container listens only on `127.0.0.1:3000`; Caddy terminates HTTPS and proxies requests to it.

## Manual payment flow

After you verify a payment, issue a key on the server:

```powershell
$env:ADMIN_API_URL = "https://api.example.ru"
$env:ADMIN_API_TOKEN = "your-admin-token"
npm run admin -- issue --email buyer@example.ru --payment transfer-2026-0001 --devices 1
```

The command prints the key once. Send it to the buyer through the agreed channel, then remove it from any temporary notes.

Useful support commands:

```powershell
npm run admin -- list
npm run admin -- revoke --license LICENSE_UUID
npm run admin -- reset-device --license LICENSE_UUID --device DEVICE_UUID
```

## Desktop contract

`POST /v1/licenses/activate` accepts a license key, locally generated installation ID, device name, and app version. It returns an entitlement, refresh token, license metadata, and a server device ID.

`POST /v1/licenses/refresh` accepts the device ID, refresh token, and app version. It returns a renewed entitlement. The client should store the refresh token using Electron safeStorage, pin the public key, verify the entitlement locally, and refuse access after it expires unless it is inside an explicitly chosen offline grace period.

`POST /v1/licenses/deactivate` releases one device.

The desktop application must never trust a locally editable `licensed: true` flag as proof of purchase.
