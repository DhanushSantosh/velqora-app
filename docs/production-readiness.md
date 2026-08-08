# Production Readiness Checklist

Use this document before promoting staging-validated changes to production.

## Goal

Confirm that production is configured for the hardened deployment model and that release risk is understood before promotion.

## Required Production Environment

Expected values from [production.yaml](../infra/render/production.yaml):

| Variable | Expected value |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_API_BASE_URL` | `https://app.velqora.com` |
| `TRUST_PROXY_HOPS` | `1` |
| `OTP_PROVIDER` | `resend` |
| `DEBUG_OTP_EXPOSURE` | `false` |
| `STATUS_ENDPOINT_ENABLED` | `false` |
| `METRICS_ENDPOINT_ENABLED` | `false` |
| `GOOGLE_OAUTH_ENABLED` | `false` |
| `SMS_IMPORT_SCAN_ENABLED` | `false` |
| `SLO_MONITOR_ENABLED` | `true` |

Required secrets:

- `DATABASE_URL`
- `REDIS_URL`
- `OTP_HASH_SECRET`
- `RESEND_API_KEY`
- `ALERTS_WEBHOOK_URL`

## Preflight Validation

1. Confirm production env values match the production blueprint.
2. Confirm `OTP_HASH_SECRET` is not the placeholder and has been rotated into the secret manager.
3. Confirm `DEBUG_OTP_EXPOSURE=false`.
4. Confirm `STATUS_ENDPOINT_ENABLED=false`.
5. Confirm `METRICS_ENDPOINT_ENABLED=false` on the public app service.
6. Confirm `GOOGLE_OAUTH_ENABLED=false`.
7. Confirm `PUBLIC_API_BASE_URL` matches the canonical production hostname.
8. Confirm the deployed service health check path is `/health`.
9. Confirm alert routing is configured and owned.
10. Confirm recent backup/restore drill evidence exists.

## Runtime Secret Validation

Run against the exact production environment values:

```bash
DATABASE_URL=... \
REDIS_URL=... \
OTP_HASH_SECRET=... \
OTP_PROVIDER=resend \
OTP_EMAIL_FROM="Velqora <noreply@app.velqora.com>" \
RESEND_API_KEY=... \
PUBLIC_API_BASE_URL=https://app.velqora.com \
TRUST_PROXY_HOPS=1 \
DEBUG_OTP_EXPOSURE=false \
STATUS_ENDPOINT_ENABLED=false \
METRICS_ENDPOINT_ENABLED=false \
ALERTS_WEBHOOK_URL=https://alerts.example.com/velqora \
SLO_MONITOR_ENABLED=true \
./scripts/ops/validate-runtime-secrets.sh production
```

## Public Surface Checks

Validate only the externally expected behavior:

```bash
curl -i https://app.velqora.com/health
curl -i https://app.velqora.com/api/v1/status
curl -i https://app.velqora.com/api/v1/metrics
```

Expected results:

- `/health` returns `200`
- `/api/v1/status` returns `404 STATUS_ENDPOINT_DISABLED`
- `/api/v1/metrics` returns `404 METRICS_ENDPOINT_DISABLED`

## Release Smoke Validation

Production smoke should be deliberately smaller than staging:

1. Verify `/health` is healthy.
2. Verify OTP request succeeds against the real provider.
3. Verify login works on a real mobile build or dev client against production API only if allowed by release policy.
4. Verify one low-risk authenticated read path.
5. Avoid mutation-heavy smoke on production unless the team has explicit seed/test-account policy.

## Manual Release Gate

1. CI for the release commit is green.
2. Staging smoke passed on the same release candidate.
3. Production env validation passed.
4. Alerting destination is confirmed.
5. Backup and restore evidence is current.
6. Rollback path is documented.
7. On-call owner is aware of the release window.

## Expected Security Posture

- `/health` is the only public operational endpoint
- no debug OTP exposure
- Google OAuth disabled
- SMS import disabled by default
- public avatar URLs use the canonical production origin
- public app ingress does not expose `/api/v1/status` or `/api/v1/metrics`

## Rollback Readiness

Before production promotion, confirm:

1. the previous API image/tag is known
2. the database migration set is reversible or safe to leave in place
3. the rollback operator knows where Render promotion controls live
4. any release notes include env/config deltas
