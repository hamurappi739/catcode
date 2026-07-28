# Recovery Notes

## What was recovered

The working desktop bundle was extracted from the installed `app.asar` for CatCode 0.2.0. Application modules, assets, presets, hooks, and renderer code were recovered. Third-party `node_modules` and native binaries were deliberately excluded because they must be restored from declared dependencies during a clean build.

The license API was moved in as source from the local `catcode-license-server` working directory. Its `.env` and `node_modules` were excluded.

## What was not recovered

- Original TypeScript/source maps, commit history, CI configuration, and release configuration.
- Code-signing certificates and any production credentials.
- A signed desktop installer and release pipeline.

## Required work before production

1. The temporary access bypass has been replaced by the signed license flow.
2. Legacy Supabase OAuth protocol registration and its localhost callback server are disabled. The recovered minified desktop bundle still contains dormant legacy account code; remove that code only after the application has been reconstructed into maintainable source modules.
3. All Electron windows use context isolation, sandboxing, and disabled Node integration. CSP, restrictive navigation, and IPC sender validation still need a dedicated review.
4. Replace or resolve the licensing obligations of `ffmpeg-static` before proprietary distribution.
5. The clean Electron runtime, lockfile, smoke build, regression tests, and NSIS installer are present. Windows code signing and CI are still required.
6. The license API is deployed behind HTTPS with Supabase PostgreSQL. Confirm the chosen data location and privacy obligations before accepting customer data.
7. Complete activation, revocation, offline-grace, update, backup, restore, and installer tests before the first sale.

## Recovery verification

Run `npm run check` from `desktop` to validate JavaScript syntax. Run `npm test` from `license-server` to validate the license API contract.

Run `npm run smoke` from `desktop` to launch the recovered application in smoke mode, and `npm run build:dir` to create an unsigned local Windows build for verification.
