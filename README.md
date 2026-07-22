# CatCode

CatCode is a desktop companion for focus, reminders, and healthy work habits.

This private repository contains two components:

- `desktop/`: recovered Electron desktop application.
- `license-server/`: server-side license activation API.

## Recovery status

The original source repository was unavailable. The `desktop` directory was recovered from the active installed `app.asar` for CatCode 0.2.0 on 2026-07-22. It is a functional recovery baseline, not yet a production-ready source release.

Do not distribute builds from this repository until the security, licensing, code-signing, and release checklist in `docs/RECOVERY.md` and `docs/RELEASE.md` is complete.

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

## Safety rules

- Never commit `.env`, database URLs, private signing keys, or payment information.
- Never put Supabase service-role credentials, license-server admin tokens, or private entitlement keys in the desktop application.
- Do not use the previously installed executable as a production release artifact.
