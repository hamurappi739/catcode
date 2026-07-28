# CatCode macOS Release

CatCode supports macOS 12 Monterey and newer on Apple Silicon and Intel Macs.
The two architectures are published as separate `DMG` and `ZIP` files so every
native dependency is checked against the exact machine architecture.

## What is already covered

- Electron, the license client, reminders, tray menu, startup at login, and
  agent integrations use their cross-platform code paths.
- `uiohook-napi` includes both `darwin-arm64` and `darwin-x64` native binaries.
- `ffmpeg-static` is installed separately for each target architecture.
- The onboarding opens the correct macOS Privacy & Security pages.
- Production builds use Hardened Runtime, Apple signing, notarization, and a
  stapled notarization ticket.
- The packaged application is checked for the correct Electron, FFmpeg, and
  input-hook architecture before an artifact is accepted.

## Required Apple account

A public production build needs an active Apple Developer Program membership,
a `Developer ID Application` certificate, and notarization credentials. Keep
all certificate files and credentials in GitHub Actions secrets. Never add them
to the repository.

The workflow maps these protected GitHub secrets to the standard
electron-builder variables:

```text
MACOS_CSC_LINK            -> CSC_LINK
MACOS_CSC_KEY_PASSWORD    -> CSC_KEY_PASSWORD
```

Choose one notarization method:

```text
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
```

or:

```text
APPLE_API_KEY_BASE64
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

Store the base64-encoded `.p8` file as `APPLE_API_KEY_BASE64`. The release
workflow restores it to a private temporary file and exposes that path as
`APPLE_API_KEY` only for the build.

## Unsigned beta build

An unsigned beta is useful only for testing on a Mac before the Apple
membership is ready. Run the `macOS Beta` GitHub Actions workflow manually.
It produces:

```text
CatCode-<version>-arm64.dmg
CatCode-<version>-arm64.zip
CatCode-<version>-x64.dmg
CatCode-<version>-x64.zip
```

macOS may quarantine an unsigned beta. Testers must use Finder's
`Open` context-menu action. Do not sell or publicly advertise this beta as the
production installer.

## Signed production build

1. Add all protected secrets to the GitHub repository.
2. Run the `macOS Production` workflow manually.
3. Confirm both architecture jobs pass artifact, signature, Gatekeeper, and
   stapled-ticket checks.
4. Download the workflow artifacts and calculate SHA-256 hashes.
5. Test each build on a clean physical Mac matching its architecture.

The workflow refuses to build when signing or notarization credentials are
missing. It never prints secret values.

## Physical Mac acceptance test

1. Install through the DMG by dragging CatCode to Applications.
2. Launch CatCode and activate a newly issued one-device test license.
3. Complete onboarding and grant Accessibility. Grant Input Monitoring if the
   keyboard reactions do not start after relaunch.
4. Confirm mouse movement, typing, scrolling, petting, sound, sleep, and
   attention-request states.
5. Test Cursor, Codex, Kiro, and Antigravity integrations that are installed on
   that Mac.
6. Run `Show my CatCode`, grant Screen Recording, and save the result.
7. Confirm startup at login, tray actions, reminders, Pomodoro, water, stretch,
   cat editor, custom skin import/export, and Russian/English switching.
8. Restart offline and confirm the cached signed entitlement works.
9. Reconnect, revoke the test license, wait for the next refresh, and confirm
   access is removed.
10. Move the application to Trash, reinstall it, and verify the expected local
    settings/license retention behavior.

The automated workflow validates packaging and trust. It cannot replace the
physical Mac test because macOS privacy prompts and real global input hooks are
owned by the operating system.

## Reference documentation

- Electron Builder macOS: https://www.electron.build/mac/
- Electron Builder code signing: https://www.electron.build/docs/features/code-signing/code-signing-mac/
- Electron Builder notarization: https://www.electron.build/docs/notarization/
- Electron system preferences: https://www.electronjs.org/docs/latest/api/system-preferences
- Apple Developer Program: https://developer.apple.com/programs/whats-included/
