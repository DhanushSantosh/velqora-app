#!/usr/bin/env bash
# dev-tailscale.sh — local API + dev client via Tailscale
#
# Usage: pnpm dev
#
# Prerequisites:
#   - tailscale installed and connected on this machine and the phone
#   - Docker running (for Postgres + Redis)

set -euo pipefail

cleanup() {
  echo ""
  echo "Shutting down..."
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for_http_ready() {
  local url="$1"
  local label="$2"

  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Error: timed out waiting for ${label} at ${url}" >&2
  return 1
}

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Error: tailscale is not installed."
  exit 1
fi

TAILSCALE_IP="$(tailscale ip -4 | head -1 || true)"

if [[ -z "$TAILSCALE_IP" ]]; then
  echo "Error: no Tailscale IPv4 address found. Make sure this machine is connected to Tailscale."
  exit 1
fi

echo "Using Tailscale IP: $TAILSCALE_IP"
echo ""
echo "Starting Postgres + Redis..."
pnpm db:up
pnpm db:wait

echo "Starting API on :4000..."
pnpm --filter @velqora/api dev &
API_PID=$!

echo "Waiting for API health..."
wait_for_http_ready "http://127.0.0.1:4000/health" "local API"

echo ""
echo "Phone access:"
echo "  Dev client QR will target : exp://$TAILSCALE_IP:8081"
echo "  API base URL              : http://$TAILSCALE_IP:4000"
echo ""
echo "Make sure your phone is connected to the same Tailnet, then scan the QR with your installed dev client build (not Expo Go)."
echo ""

EXPO_PUBLIC_API_URL="http://$TAILSCALE_IP:4000" \
REACT_NATIVE_PACKAGER_HOSTNAME="$TAILSCALE_IP" \
EXPO_NO_REDIRECT_PAGE=1 \
  pnpm --filter @velqora/mobile exec expo start --lan --dev-client
