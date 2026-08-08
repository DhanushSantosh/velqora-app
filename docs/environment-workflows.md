# Environment Workflows

This document explains how development, staging, and production are separated in the Velqora project, and how they run in practice.

## Overview

The project operates in four practical modes:

1. local development
2. staging / preview validation
3. production runtime
4. operational maintenance workflows

Each mode has a different goal, different environment defaults, and different expectations around safety and observability.

## 1. Local Development

This is the main daily coding loop.

### What runs

- local Postgres and Redis via Docker
- local Fastify API in watch mode
- a custom dev client for mobile development (native modules like Google Sign-In aren't available in plain Expo Go)

### Main commands

From repo root:

```bash
pnpm dev
pnpm dev:local
pnpm dev:tailscale
pnpm dev:android
pnpm dev:api
pnpm dev:mobile
```

### How it works in practice

- `pnpm dev` runs the standard local workflow:
  - starts Postgres + Redis
  - starts the API in watch mode
  - launches the dev client locally
- `pnpm dev:tailscale` runs the cross-network phone workflow:
  - starts Postgres + Redis
  - starts the API in watch mode
  - launches the dev client in LAN mode
  - injects the machine's Tailscale IP into both Metro and the mobile API base URL
- `pnpm dev:local` is the explicit alias for the same local API + Expo workflow
- `pnpm dev:android` is the emulator-focused version

### Local environment behavior

Typical defaults from the root `.env`:

- `NODE_ENV=development`
- `OTP_PROVIDER=console`
- `DEBUG_OTP_EXPOSURE=true`
- `STATUS_ENDPOINT_ENABLED=true`
- `METRICS_ENDPOINT_ENABLED=true`
- `GOOGLE_OAUTH_ENABLED=false`

### What local is for

- feature implementation
- UI iteration
- safe use of debug OTP
- rapid backend/mobile integration work

## 2. Staging / Preview Validation

This is the production-like validation environment.

### Backend shape

Defined in [staging.yaml](../infra/render/staging.yaml).

Expected behavior:

- `NODE_ENV=production`
- `OTP_PROVIDER=resend`
- `DEBUG_OTP_EXPOSURE=false`
- `STATUS_ENDPOINT_ENABLED=true`
- `METRICS_ENDPOINT_ENABLED=false`
- `GOOGLE_OAUTH_ENABLED=false`
- `PUBLIC_API_BASE_URL=https://velqora-api-staging.onrender.com`
- `TRUST_PROXY_HOPS=1`

### Mobile shape

- local Expo shortcut:

```bash
pnpm dev:staging
```

- EAS preview build uses the staging API URL from [eas.json](../apps/mobile/eas.json)

### How it works in practice

- `pnpm dev:staging` launches the dev client locally while pointing the app at the hosted staging backend
- `pnpm dev:staging:tailscale` launches the dev client over Tailscale while pointing the app at the hosted staging backend
- no local API, Postgres, or Redis are required for this workflow
- OTP is delivered by the real Resend staging configuration
- this is the fastest way to validate the mobile app against a production-like backend without touching local infrastructure

### What staging is for

- validating deploy-time configuration
- testing the real OTP provider
- checking security posture with production-like flags
- running smoke and performance checks
- verifying mobile behavior against a remotely hosted API

### Important difference from local

- no debug OTP exposure
- real email delivery path
- stricter endpoint exposure
- no reliance on local infra

## 3. Production Runtime

This is the actual release environment.

### Backend shape

Defined in [production.yaml](../infra/render/production.yaml).

Expected behavior:

- `NODE_ENV=production`
- `OTP_PROVIDER=resend`
- `DEBUG_OTP_EXPOSURE=false`
- `STATUS_ENDPOINT_ENABLED=false`
- `METRICS_ENDPOINT_ENABLED=false`
- `GOOGLE_OAUTH_ENABLED=false`
- `PUBLIC_API_BASE_URL=https://app.velqora.com`
- `TRUST_PROXY_HOPS=1`
- two API instances
- no automatic deploy on every push

### Mobile shape

- EAS production build points to the production API URL from [eas.json](../apps/mobile/eas.json)

### What production is for

- stable user traffic
- locked-down operational surface
- real monitoring and alerting
- controlled promotion and rollback

### Important difference from staging

- `/api/v1/status` is not publicly enabled
- `/api/v1/metrics` is not publicly enabled
- release posture is narrower and safer than staging

## 4. Operational Maintenance Workflows

These workflows validate environments after code exists.

### Scripts

- [staging-smoke.mjs](../scripts/ops/staging-smoke.mjs)
- [perf-smoke.mjs](../scripts/ops/perf-smoke.mjs)
- [validate-runtime-secrets.sh](../scripts/ops/validate-runtime-secrets.sh)

### GitHub workflows

- [ops-smoke.yml](../.github/workflows/ops-smoke.yml)
- [dr-drill.yml](../.github/workflows/dr-drill.yml)

### Supporting docs

- [staging-readiness.md](./staging-readiness.md)
- [production-readiness.md](./production-readiness.md)
- [ops-runbook.md](./ops-runbook.md)

## Practical Team Workflow

### When building features

Use local development:

```bash
pnpm dev
```

### When validating release candidates

Use staging:

1. deploy/update staging
2. validate env config
3. run smoke checks
4. test mobile flows against staging

### When shipping

Use production readiness gates:

1. confirm staging passed
2. validate production env and secrets
3. confirm alerting and backup posture
4. promote intentionally

## Current Reality Check

The repo has a clean conceptual separation between local, staging, and production.

The live staging backend is currently:

- `https://velqora-api-staging.onrender.com`

Use that hostname until custom DNS is live.
