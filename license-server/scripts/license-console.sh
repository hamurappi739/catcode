#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

admin() {
  sudo docker compose --profile maintenance run --rm license-admin \
    node scripts/admin-direct.js "$@"
}

issue() {
  local payment devices email notes expires
  read -r -p "Payment reference: " payment
  read -r -p "Devices [1]: " devices
  read -r -p "Buyer email (optional): " email
  read -r -p "Internal note (optional): " notes
  read -r -p "Expiry ISO date (optional): " expires
  devices="${devices:-1}"

  local args=(issue --payment "$payment" --devices "$devices")
  [[ -n "$email" ]] && args+=(--email "$email")
  [[ -n "$notes" ]] && args+=(--note "$notes")
  [[ -n "$expires" ]] && args+=(--expires "$expires")
  admin "${args[@]}"
}

inspect() {
  local license
  read -r -p "License UUID: " license
  admin inspect --license "$license"
}

revoke() {
  local license confirmation
  read -r -p "License UUID to revoke: " license
  read -r -p "Type REVOKE to confirm: " confirmation
  [[ "$confirmation" == "REVOKE" ]] || { echo "Cancelled."; return; }
  admin revoke --license "$license"
}

reset_device() {
  local license device confirmation
  read -r -p "License UUID: " license
  read -r -p "Device UUID to reset: " device
  read -r -p "Type RESET to confirm: " confirmation
  [[ "$confirmation" == "RESET" ]] || { echo "Cancelled."; return; }
  admin reset-device --license "$license" --device "$device"
}

while true; do
  cat <<'MENU'

CatCode License Console
1) Issue license
2) Overview
3) Inspect license
4) Revoke license
5) Reset one device
0) Exit
MENU
  read -r -p "Select: " choice
  case "$choice" in
    1) issue ;;
    2) admin overview ;;
    3) inspect ;;
    4) revoke ;;
    5) reset_device ;;
    0) exit 0 ;;
    *) echo "Unknown option." ;;
  esac
done
