# Local Dev Setup

## Quick start

```bash
git clone <your-fork-or-repo-url>
cd velqora-app
pnpm install
cp .env.example .env
pnpm db:up
pnpm --filter @velqora/api db:migrate
pnpm dev
```

OTP provider mode for local:
- Keep `OTP_PROVIDER=console` in the root `.env` to use debug OTP.
- Use `OTP_PROVIDER=resend` only when validating real email delivery with `RESEND_API_KEY`.
- Keep `DEBUG_OTP_EXPOSURE=true` only for local development. Shared environments should set it to `false`.

## Alternative startup

```bash
pnpm dev         # default local workflow — local API + dev client
pnpm dev:tailscale
pnpm dev:staging # dev client against hosted staging API
pnpm dev:staging:tailscale # dev client against hosted staging API over Tailscale
pnpm dev:api
pnpm dev:android
pnpm dev:mobile  # Expo only
pnpm android:fast
```

This app depends on native modules (e.g. `@react-native-google-signin/google-signin`) that plain Expo Go can't load, so all of the above target a custom **dev client**, not the Expo Go app from the store. Build/install it once per device with `pnpm --filter @velqora/mobile exec npx expo run:android` (or `run:ios` on macOS); rebuild it only when native modules change.

## API connection

The mobile app reads `EXPO_PUBLIC_API_URL` from the root `.env`.

Default for local API:

```env
EXPO_PUBLIC_API_URL=http://localhost:4000
```

For Android emulator, use:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
```

For physical device testing on the same Wi-Fi, use your machine LAN IP:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:4000
```

Restart Expo after changing this value.

For physical device testing on any network, use Tailscale instead of editing `EXPO_PUBLIC_API_URL` manually:

1. connect both laptop and phone to the same Tailnet
2. run `pnpm dev:tailscale`
3. scan the QR with your installed dev client build (not Expo Go)

The script injects:
- `EXPO_PUBLIC_API_URL=http://<tailscale-ip>:4000`
- `REACT_NATIVE_PACKAGER_HOSTNAME=<tailscale-ip>`

For hosted staging app validation, use:

```bash
pnpm dev:staging
```

That launches the dev client locally and points the app at:

- `https://velqora-api-staging.onrender.com`

Use this when you want to test the real hosted backend without running local API infrastructure.

If you want the same hosted staging flow but with cross-network dev client access over Tailscale, use:

```bash
pnpm dev:staging:tailscale
```

That launcher injects:

- `EXPO_PUBLIC_API_URL=https://velqora-api-staging.onrender.com`
- `REACT_NATIVE_PACKAGER_HOSTNAME=<tailscale-ip>`

## Quick diagnostics

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/v1/status    # includes otpDelivery.provider/ready/requestTimeoutMs
curl http://localhost:4000/api/v1/bootstrap
curl http://localhost:4000/api/v1/metrics
```
