#!/usr/bin/env bash
set -euo pipefail

app_path="${1:-}"
expected_arch="${2:-}"
verification_mode="${3:-signed}"

if [[ -z "$app_path" || -z "$expected_arch" ]]; then
  echo "Usage: $0 /path/to/CatCode.app <arm64|x64> [signed|unsigned]" >&2
  exit 2
fi

if [[ ! -d "$app_path" ]]; then
  echo "CatCode.app was not found: $app_path" >&2
  exit 1
fi

case "$expected_arch" in
  arm64)
    file_arch_pattern="arm64"
    native_arch="arm64"
    ;;
  x64)
    file_arch_pattern="x86_64"
    native_arch="x64"
    ;;
  *)
    echo "Unsupported architecture: $expected_arch" >&2
    exit 2
    ;;
esac

executable="$app_path/Contents/MacOS/CatCode"
resources="$app_path/Contents/Resources"
ffmpeg="$resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
uiohook="$resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/darwin-${native_arch}/uiohook-napi.node"

for path in "$executable" "$ffmpeg" "$uiohook"; do
  if [[ ! -e "$path" ]]; then
    echo "Required macOS runtime file is missing: $path" >&2
    exit 1
  fi
  if ! /usr/bin/file "$path" | grep -q "$file_arch_pattern"; then
    echo "Unexpected architecture for $path" >&2
    /usr/bin/file "$path" >&2
    exit 1
  fi
done

if [[ "$verification_mode" == "signed" ]]; then
  /usr/bin/codesign --verify --deep --strict --verbose=2 "$app_path"
  /usr/sbin/spctl --assess --type execute --verbose=2 "$app_path"
  /usr/bin/xcrun stapler validate "$app_path"
elif [[ "$verification_mode" != "unsigned" ]]; then
  echo "Verification mode must be signed or unsigned." >&2
  exit 2
fi

echo "Verified CatCode macOS artifact: $expected_arch ($verification_mode)."
