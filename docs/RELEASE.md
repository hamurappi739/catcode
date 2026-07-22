# CatCode Windows Release

## Prerequisites

- A clean checkout of the `agent/license-deploy` branch.
- Node.js 24 and the exact dependencies from `desktop/package-lock.json`.
- A current Windows code-signing certificate from a trusted certification authority.
- No `.pfx`, certificate password, server `.env`, or customer data in the repository.

## Local verification

From `desktop` run:

```powershell
npm ci
npm run check
npm test
npm run smoke
npm run build:dir
```

`release/win-unpacked/CatCode.exe` is only a test build. Confirm its behavior with a fresh Windows user profile and a test license.

## Signed installer

Import the code-signing certificate into the Windows certificate store for the release account, or set these variables only in the protected release environment:

```powershell
$env:CSC_LINK = "C:\protected\catcode-signing-certificate.pfx"
$env:CSC_KEY_PASSWORD = "certificate-password"
npm run build:installer
```

The installer is written to `desktop/release/` as `CatCode-<version>-x64.exe`. Its uninstall process deliberately keeps `%APPDATA%\CatCode` so a user does not lose locally stored settings and license state by accident.

Before publishing, verify the signature and installer hash:

```powershell
Get-AuthenticodeSignature .\release\CatCode-<version>-x64.exe | Format-List Status,StatusMessage,SignerCertificate
Get-FileHash .\release\CatCode-<version>-x64.exe -Algorithm SHA256
```

Only publish a file whose signature status is `Valid` and whose signer is your organization. An unsigned test installer must never be sent to customers.

## Updates

Automatic updates are disabled by default. Do not set `CATCODE_ENABLE_AUTO_UPDATES=1` until a signed installer, a controlled HTTPS update channel, and an update rollback procedure are in place. For unsigned early releases, publish each new installer manually from one official download page with its SHA-256 hash and release notes.

## Release acceptance

1. Install on a clean Windows account.
2. Activate a newly issued one-device test license.
3. Restart the application and verify it launches without an activation window.
4. Revoke that test license in the private server console, wait for the next online license refresh, and verify the application returns to activation.
5. Test a network outage: the app may work only until its current signed entitlement expires, currently 24 hours.
6. Verify uninstallation keeps and reinstallation restores the local settings; then test the explicit support procedure for removing a device.
