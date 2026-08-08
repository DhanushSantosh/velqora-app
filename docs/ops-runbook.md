# Operations Runbook

## Local Startup

```bash
cd /home/dhanush/Projects/velqora-app
pnpm install
pnpm db:up
pnpm --filter @velqora/api db:migrate
pnpm dev
```

## Core Commands

```bash
pnpm dev
pnpm dev:tailscale
pnpm dev:api
pnpm android:fast
pnpm db:logs
pnpm db:down
```

## Environment Variables

API (`apps/api/.env`):

- `NODE_ENV`
- `API_PORT`
- `API_HOST`
- `PUBLIC_API_BASE_URL`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_TRACES_SAMPLE_RATE`
- `TRUST_PROXY_HOPS`
- `MOBILE_APP_ORIGIN`
- `DATABASE_URL`
- `REDIS_URL`
- `OTP_HASH_SECRET`
- `DEBUG_OTP_EXPOSURE`
- `OTP_PROVIDER` (`console` or `resend`)
- `OTP_EMAIL_FROM`
- `OTP_PROVIDER_REQUEST_TIMEOUT_MS` (outbound OTP provider request timeout)
- `RESEND_API_KEY` (required when `OTP_PROVIDER=resend`)
- `ALERTS_WEBHOOK_URL` (optional but recommended for staging/production)
- `ALERTS_COOLDOWN_SECONDS`
- `SLO_MONITOR_ENABLED`
- `SLO_MONITOR_WINDOW_SECONDS`
- `SLO_MONITOR_EVALUATION_SECONDS`
- `SLO_HTTP_5XX_RATE_THRESHOLD_PERCENT`
- `SLO_HTTP_5XX_MIN_REQUESTS`
- `SLO_OTP_DELIVERY_FAILURE_THRESHOLD`
- `AUTH_OTP_TTL_SECONDS`
- `AUTH_MAX_OTP_ATTEMPTS`
- `AUTH_SESSION_TTL_DAYS`
- `AUTH_MAX_ACTIVE_SESSIONS`
- `AUTH_RATE_LIMIT_WINDOW_SECONDS`
- `AUTH_RATE_LIMIT_MAX_REQUEST_OTP`
- `AUTH_RATE_LIMIT_MAX_VERIFY_OTP`
- `SMS_IMPORT_SCAN_ENABLED` (must remain `false` unless explicitly approved)
- `SMS_DISCLOSURE_VERSION`
- `APP_CURRENCY`

Mobile (root `.env`):

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_SENTRY_ENVIRONMENT`
- `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `EXPO_PUBLIC_GOOGLE_OAUTH_ENABLED`

## Health Checks

```bash
curl http://localhost:4000/health
curl http://localhost:4000/api/v1/status
curl http://localhost:4000/api/v1/bootstrap
curl http://localhost:4000/api/v1/metrics
```

`/api/v1/status` includes dependency health signals:
- `dependencies.databaseHealthy`
- `dependencies.redisHealthy`
- `otpDelivery.provider`
- `otpDelivery.ready`
- `otpDelivery.requestTimeoutMs`

Production note:
- `/health` is the public liveness endpoint.
- `/api/v1/status` and `/api/v1/metrics` may be disabled outside local/staging depending on `STATUS_ENDPOINT_ENABLED` and `METRICS_ENDPOINT_ENABLED`.

## Staging and Perf Smoke Commands

```bash
API_BASE_URL=https://velqora-api-staging.onrender.com \
SMOKE_TEST_EMAIL=smoke-check@example.com \
SMOKE_BEARER_TOKEN=<token_if_resend_has_no_debug_otp> \
SMOKE_EXPECT_STATUS_ENDPOINT=true \
SMOKE_EXPECT_METRICS_ENDPOINT=false \
pnpm smoke:staging
```

```bash
API_BASE_URL=https://velqora-api-staging.onrender.com \
PERF_BEARER_TOKEN=<token> \
PERF_ITERATIONS=20 \
PERF_P95_THRESHOLD_MS=300 \
pnpm smoke:perf
```

## Common Troubleshooting

### API cannot connect to DB

1. Run `pnpm db:up`.
2. Verify postgres container is healthy with `pnpm db:logs`.
3. Re-run `pnpm --filter @velqora/api db:migrate`.
4. Restart API with `pnpm dev:api`.

If startup fails, API now logs actionable hints for connection refusal.

### Mobile cannot reach API on Android emulator

Set in `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
```

Restart Expo after update.

### Real phone testing on any network

1. Make sure both laptop and phone are connected to the same Tailnet.
2. Run `pnpm dev`.
3. Scan the QR with your installed dev client build (not Expo Go).

`pnpm dev` now uses this machine's Tailscale IPv4 for both Metro and the API.

### OTP works in tests but not local flow

- In development, OTP is delivered via API logs.
- Check API terminal output for generated OTP code.
- If you are testing a shared environment and no OTP is returned, confirm `DEBUG_OTP_EXPOSURE=false` is expected and that a real provider is configured instead.

### Production OTP email delivery

1. Set `OTP_PROVIDER=resend`.
2. Set `OTP_EMAIL_FROM` and `RESEND_API_KEY`.
3. Ensure `OTP_EMAIL_FROM` is a valid sender string:
   - `noreply@example.com`
   - `Velqora <noreply@example.com>`
4. Ensure the sender domain/address is verified in Resend.
5. Set `ALERTS_WEBHOOK_URL` for delivery failure alerts.
6. Restart API and verify `/api/v1/auth/request-otp`.

### Sentry monitoring

1. Set `SENTRY_DSN` on the API to enable backend crash capture.
2. Set `SENTRY_ENVIRONMENT` to the deployed environment name (`staging` or `production`).
3. Start with `SENTRY_TRACES_SAMPLE_RATE=0.1` and adjust after observing volume.
4. Set `EXPO_PUBLIC_SENTRY_DSN` in the mobile environment to enable runtime mobile error capture.
5. Set `EXPO_PUBLIC_SENTRY_ENVIRONMENT` to match the build target.
6. Keep `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` conservative in production.
7. This first-pass integration focuses on runtime capture; source map upload can be added later once auth tokens and release workflow are ready.

## Backup and Restore Scripts

```bash
export DATABASE_URL=postgresql://...
pnpm backup:create
./scripts/backup/postgres-restore.sh ./backups/<file>.dump
```

## Secrets Rotation

```bash
pnpm secrets:otp
pnpm secrets:validate
```

Use generated value for `OTP_HASH_SECRET` in staging and production secret stores.

Validate deployment env before release:

```bash
DATABASE_URL=... \
REDIS_URL=... \
OTP_HASH_SECRET=... \
PUBLIC_API_BASE_URL=https://app.example.com \
TRUST_PROXY_HOPS=1 \
OTP_PROVIDER=resend \
OTP_EMAIL_FROM="Velqora <noreply@app.example.com>" \
ALERTS_WEBHOOK_URL=https://alerts.example.com/velqora \
SLO_MONITOR_ENABLED=true \
RESEND_API_KEY=... \
pnpm secrets:validate
```

## Release Readiness Checklist

1. All tests green in CI.
2. Migrations applied in target environment.
3. Secrets configured with production values.
4. `OTP_HASH_SECRET` is not the placeholder value and `DEBUG_OTP_EXPOSURE=false`.
5. `PUBLIC_API_BASE_URL`, `TRUST_PROXY_HOPS`, `STATUS_ENDPOINT_ENABLED`, and `METRICS_ENDPOINT_ENABLED` match the deployment topology.
6. SMS remains disabled by default until explicit release gate.

## CI Workflow

GitHub Actions pipeline is defined in:

`/.github/workflows/ci.yml`

It validates:
1. Workspace lint
2. Workspace typecheck
3. Migration drift check
4. API tests
5. Mobile tests

Additional workflows:
1. `/.github/workflows/cd-image.yml` - builds and pushes API container image to GHCR.
2. `/.github/workflows/dr-drill.yml` - manual backup/restore disaster recovery drill.
3. `/.github/workflows/ops-smoke.yml` - manual staging smoke and optional performance smoke checks.
