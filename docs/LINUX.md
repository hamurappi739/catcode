# CatCode Linux Beta

CatCode has a Linux x64 beta for current desktop distributions. The release
workflow publishes an `AppImage` and a Debian/Ubuntu `DEB` package built on
Linux, so Electron and native input dependencies match the target platform.

## Supported beta scope

- The current automated target is Linux x64.
- Ubuntu 22.04/24.04 and current Debian-based desktop distributions are the
  primary test targets.
- Cat reactions, sleep, typing, scrolling, reminders, Pomodoro, water and
  stretch prompts, skins, JSON import/export, onboarding, sound, walking, and
  jumping use the Linux code paths.
- Cursor stealing is disabled because CatCode does not ship a Linux cursor
  movement helper yet.
- Music dancing and automatic hiding over full-screen applications are
  Windows-only for now.
- Wayland compositors can limit global input observation and always-on-top
  window positioning. X11 currently provides the most predictable beta
  experience.

## Building in GitHub Actions

Run the `Linux Beta` workflow manually. It checks syntax and tests, launches an
Electron smoke test under Xvfb, and publishes:

```text
CatCode-<version>-x86_64.AppImage
CatCode-<version>-amd64.deb
```

## Installing the AppImage

```bash
chmod +x CatCode-<version>-x86_64.AppImage
./CatCode-<version>-x86_64.AppImage
```

The `DEB` package can be installed on Debian and Ubuntu with:

```bash
sudo apt install ./CatCode-<version>-amd64.deb
```

## Physical Linux acceptance test

1. Test both AppImage and DEB on a clean x64 machine.
2. Activate a one-device test license and finish the platform-specific tour.
3. Verify typing, pointer, scrolling, petting, sound, sleep, and wake states.
4. Verify reminders, Pomodoro, water, stretch, compact notification mode, and
   the clock indicator.
5. Verify walking and jumping on both X11 and Wayland.
6. Verify skin switching, side-walk coloring, editor changes, and JSON
   import/export.
7. Confirm the menu, tray icon, startup setting, and all windows close cleanly.
8. Restart offline and verify the cached entitlement remains valid.

Linux remains a beta until this checklist passes on physical X11 and Wayland
systems. The workflow validates the package but cannot reproduce every desktop
environment or compositor policy.
