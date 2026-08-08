#!/usr/bin/env bash
# dev-staging-tailscale.sh — dev client against hosted staging API over Tailscale
#
# Usage: pnpm dev:staging
#
# Prerequisites:
#   - tailscale installed and connected on this machine and the phone

set -euo pipefail

STAGING_API_URL="${EXPO_PUBLIC_API_URL:-https://velqora-api-staging.onrender.com}"

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
echo "Hosted staging access:"
echo "  Dev client QR will target : exp://$TAILSCALE_IP:8081"
echo "  API base URL              : $STAGING_API_URL"
echo ""
echo "Make sure your phone is connected to the same Tailnet, then scan the QR with your installed dev client build (not Expo Go)."
echo ""

EXPO_PUBLIC_API_URL="$STAGING_API_URL" \
EXPO_PUBLIC_SENTRY_ENVIRONMENT=staging \
REACT_NATIVE_PACKAGER_HOSTNAME="$TAILSCALE_IP" \
EXPO_NO_REDIRECT_PAGE=1 \
  pnpm --filter @velqora/mobile exec expo start --lan --dev-client
