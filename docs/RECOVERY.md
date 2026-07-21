# Recovery Notes

## What was recovered

The working desktop bundle was extracted from the installed `app.asar` for CatCode 0.2.0. Application modules, assets, presets, hooks, and renderer code were recovered. Third-party `node_modules` and native binaries were deliberately excluded because they must be restored from declared dependencies during a clean build.

The license API was moved in as source from the local `catcode-license-server` working directory. Its `.env` and `node_modules` were excluded.

## What was not recovered

- Original TypeScript/source maps, commit history, CI configuration, and release configuration.
- Code-signing certificates and any production credentials.
- A reproducible desktop installer build.

## Required work before production

1. Replace the temporary desktop access bypass with the signed license flow.
2. Delete the dormant legacy Supabase account/authentication implementation and all account IPC routes.
3. Harden Electron renderers: context isolation, sandboxing, CSP, restrictive navigation, and IPC sender validation.
4. Replace or resolve the licensing obligations of `ffmpeg-static` before proprietary distribution.
5. Add a clean Electron build configuration, lockfile, tests, CI, and Windows code signing.
6. Deploy the license API behind HTTPS with a Russian-hosted PostgreSQL database for customer data.
7. Complete activation, revocation, offline-grace, update, backup, and restore tests.

## Recovery verification

Run `npm run check` from `desktop` to validate JavaScript syntax. Run `npm test` from `license-server` to validate the license API contract.
