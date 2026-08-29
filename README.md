# CatCode

CatCode is a Windows desktop companion for focus, reminders, and healthy work
habits, with macOS and Linux beta packages.

This private repository contains two components:

- `desktop/`: recovered Electron desktop application.
- `license-server/`: server-side license activation API.

## Recovery status

The original source repository was unavailable. The `desktop` directory was
recovered from the active installed `app.asar` for CatCode 0.2.0 on 2026-07-22
and has since received licensing, security, product, and release engineering
work.

Use the platform release checklists before distributing a build:

- Windows: `docs/RELEASE.md`
- macOS: `docs/MACOS.md`
- Linux: `docs/LINUX.md`
- Recovery history and residual risks: `docs/RECOVERY.md`

## Desktop verification

From `desktop`, run:

```powershell
npm ci
npm run check
npm run smoke
npm run build:dir
npm run build:installer
```

`build:dir` creates an unsigned local folder at `desktop/release/win-unpacked`. `build:installer` creates the NSIS installer. Both are for verification only until the installer is code signed.

macOS packages must be built on macOS or through the included GitHub Actions
workflows. `macOS Beta` creates unsigned test artifacts. `macOS Production`
creates signed and notarized Intel and Apple Silicon artifacts.

Linux packages must be built on Linux or through the included `Linux Beta`
workflow. It creates x64 AppImage and DEB artifacts after tests and an Xvfb
smoke run.

## Safety rules

- Never commit `.env`, database URLs, private signing keys, or payment information.
- Never put Supabase service-role credentials, license-server admin tokens, or private entitlement keys in the desktop application.
- Do not use the previously installed executable as a production release artifact.
