# Velqora App

A mobile-first personal finance tracker. Log transactions, set monthly budgets, track savings goals, and view financial summaries — secured with email OTP and a high-contrast dark UI.

## Repo structure

```
velqora-app/
├── apps/
│   ├── api/          Fastify v5 REST API (TypeScript, Drizzle ORM, PostgreSQL, Redis)
│   └── mobile/       Expo React Native app (Android + iOS)
├── infra/
│   ├── docker-compose.yml    Local Postgres + Redis
│   └── render/               Staging and production Render blueprints
├── scripts/
│   ├── android-fast.sh       Boot emulator + launch Expo in one step
│   ├── backup/               Postgres backup and restore
│   └── ops/                  Secret generation and validation
└── .github/workflows/
    ├── ci.yml                Typecheck + test pipeline (push + PR)
    ├── ci-nightly.yml        Nightly full test run — silent regression guard
    ├── cd-image.yml          Docker image build → GHCR (push to main)
    ├── dependency-review.yml CVE + license gate on every PR
    ├── eas-build.yml         Manual EAS mobile build (dev / preview / production)
    ├── release-drafter.yml   Auto-draft GitHub Releases from commit messages
    ├── stale.yml             Label and close inactive issues and PRs
    ├── image-scan.yml        Trivy CVE scan of API Docker image after each CD build
    ├── codeql.yml            CodeQL SAST — push, PR, weekly
    ├── semgrep.yml           Semgrep SAST — OWASP, Node, JWT rulesets
    ├── dep-audit.yml         Daily pnpm CVE audit
    ├── secret-scan.yml       Gitleaks secret scanning on every push and PR
    ├── ops-smoke.yml         Manual staging + perf smoke checks
    └── dr-drill.yml          Manual DR drill
```

## Tech stack

| Layer | Technology |
|---|---|
| API | Fastify v5, Node.js ≥22, TypeScript, Zod |
| DB | Drizzle ORM, PostgreSQL 16+ |
| Cache / rate-limit | Redis (ioredis), in-memory fallback |
| Mobile | Expo ~57, React Native 0.86, React 19 |
| Animations | react-native-reanimated 4 |
| Package manager | pnpm 10 (workspaces) |
| Tests | Vitest (API + mobile) |
| Observability | prom-client (Prometheus) |

---

## Prerequisites

- Node.js `>=22`, pnpm `>=10`
- Docker (for local Postgres + Redis)
- Android Studio + AVD (Android) or Xcode + Simulator (iOS/macOS)

---

## First-time setup

```bash
git clone <repo-url>
cd velqora-app
pnpm install
cp .env.example .env
pnpm db:up
pnpm --filter @velqora/api db:migrate
```

---

## Running locally

```bash
pnpm dev:android    # recommended — starts API + boots Android emulator + Expo
pnpm dev:api        # API only (hot-reload)
pnpm android:fast   # emulator + Expo Android
pnpm dev            # default local workflow — local API + dev client
pnpm dev:tailscale  # local API + dev client over Tailscale
pnpm dev:staging    # dev client against hosted staging API (same network / simulator friendly)
pnpm dev:staging:tailscale  # dev client against hosted staging API over Tailscale
```

This app uses custom native modules (e.g. `@react-native-google-signin/google-signin`) that plain Expo Go can't load, so all of the above run against a **custom dev client**, not the Expo Go app from the store. Build and install the dev client on your device/emulator once before your first run:

```bash
pnpm --filter @velqora/mobile exec npx expo run:android   # or run:ios on macOS
```

Re-run that (or `expo prebuild` + a native rebuild) whenever you pull a native module change — everyday `pnpm dev`/`dev:android` after that just needs Metro, since the dev client binary itself is unchanged.

The local dev scripts automatically start and wait for the database containers before launching the API.

For real-device testing on any network, use the explicit Tailscale workflow:

- `pnpm dev:tailscale` detects this machine's Tailscale IPv4
- the API is exposed at `http://<tailscale-ip>:4000`
- the dev client runs in LAN mode with `REACT_NATIVE_PACKAGER_HOSTNAME=<tailscale-ip>`
- your phone can connect from any network as long as both devices are on the same Tailnet

If you pull native module updates (for example image picker/document picker), restart Metro and rebuild the app binary once:

```bash
pnpm --filter @velqora/mobile exec npx expo prebuild
```

For hosted staging testing, use:

```bash
pnpm dev:staging
```

This starts the dev client locally and points the mobile app at:

- `https://velqora-api-staging.onrender.com`

This is the cleanest way to test the real remote backend without starting local API infrastructure.

For cross-network staging app testing over Tailscale, use:

```bash
pnpm dev:staging:tailscale
```

---

## Dev auth flow

OTP delivery defaults to `console` mode — no email is sent.

1. Enter any email on the login screen and tap **Send OTP**.
2. Check the API terminal — the 6-digit code is printed there.
3. Enter it on the OTP screen to authenticate.

---

## Environment variables

Key variables to configure in the root `.env`:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://velqora:velqora@127.0.0.1:5432/velqora` | |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Optional — falls back to in-memory |
| `OTP_HASH_SECRET` | `change-me-in-production-otp-secret` | **Must change in production** |
| `PUBLIC_API_BASE_URL` | _(empty)_ | Canonical public API origin used for generated asset URLs |
| `AVATAR_STORAGE_DIR` | _(system temp dir)_ | Optional writable directory for uploaded avatar files in hosted environments |
| `SENTRY_DSN` | _(empty)_ | Optional backend Sentry DSN for API error and trace capture |
| `SENTRY_ENVIRONMENT` | _(empty)_ | Optional backend Sentry environment tag override |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` | Backend trace sampling rate between `0` and `1` |
| `TRUST_PROXY_HOPS` | `0` | Set to proxy hop count in deployed environments |
| `DEBUG_OTP_EXPOSURE` | `true` (local) | Keep `false` outside local development |
| `OTP_PROVIDER` | `console` | `console` or `resend` |
| `OTP_PROVIDER_REQUEST_TIMEOUT_MS` | `10000` | Outbound OTP provider timeout in milliseconds |
| `RESEND_API_KEY` | _(empty)_ | Required when `OTP_PROVIDER=resend` |
| `ALERTS_WEBHOOK_URL` | _(empty)_ | Recommended in staging/production for operational alerts |
| `ALERTS_COOLDOWN_SECONDS` | `60` | Cooldown for duplicate alert fingerprints |
| `SLO_MONITOR_ENABLED` | `false` | Enables rolling-window SLO alert checks |
| `SLO_MONITOR_WINDOW_SECONDS` | `300` | SLO window size in seconds |
| `SLO_MONITOR_EVALUATION_SECONDS` | `30` | SLO evaluation interval in seconds |
| `SLO_HTTP_5XX_RATE_THRESHOLD_PERCENT` | `2` | 5xx rate threshold percentage for SLO alert |
| `SLO_HTTP_5XX_MIN_REQUESTS` | `100` | Minimum request volume before 5xx SLO alerting |
| `SLO_OTP_DELIVERY_FAILURE_THRESHOLD` | `5` | OTP delivery failure threshold within SLO window |
| `SMS_IMPORT_SCAN_ENABLED` | `false` | Keeps SMS scan service disabled unless explicitly enabled |

Mobile: set `EXPO_PUBLIC_API_URL` in the root `.env`. Use `http://10.0.2.2:4000` for Android emulator. For real-phone testing on any network, prefer `pnpm dev` so the Tailscale IP is injected automatically for that session.

Optional mobile Sentry variables:
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_SENTRY_ENVIRONMENT`
- `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`

Google Sign-In stays disabled by default in the current app because the secure nonce-bound native flow is not yet enabled for production use.

Full variable reference: [`docs/ops-runbook.md`](./docs/ops-runbook.md)

---

## Commands

```bash
# Database
pnpm db:up                               # start Postgres + Redis
pnpm db:down                             # stop containers
pnpm db:check                            # fail if schema has uncommitted migrations
pnpm --filter @velqora/api db:migrate     # apply pending migrations
pnpm --filter @velqora/api db:generate    # generate migration from schema changes

# Quality
pnpm typecheck                           # type-check all workspaces
pnpm lint                                # lint all workspaces
pnpm --filter @velqora/api test           # API unit + integration tests
pnpm --filter @velqora/mobile test        # mobile unit tests

# Operations
pnpm secrets:otp                         # generate a secure OTP_HASH_SECRET
pnpm secrets:validate                    # validate production-required secrets
pnpm backup:create                       # Postgres backup
pnpm smoke:staging                       # staging/API smoke checks
pnpm smoke:perf                          # API p95 smoke checks for transactions
```

---

## API

Base URL: `http://localhost:4000`. All protected routes require `Authorization: Bearer <token>`.

Modules: `auth`, `profile`, `categories`, `transactions`, `budgets`, `goals`, `reports`, `consents`, `imports`, `account`, `metrics`

Full contracts: [`docs/api-reference.md`](./docs/api-reference.md)

---

## CI/CD

### Continuous integration

| Workflow | Trigger | Stages |
|---|---|---|
| `ci.yml` | push + every PR to `main` | lint → typecheck → migration drift → API tests → mobile tests |
| `ci-nightly.yml` | Daily 01:00 UTC | Same as CI — catches silent regressions from env/dep drift |
| `dependency-review.yml` | Every PR to `main` | Blocks PRs with HIGH/CRITICAL CVEs or GPL/AGPL dependencies |

### Continuous delivery

| Workflow | Trigger | Action |
|---|---|---|
| `cd-image.yml` | push to `main` | Builds and pushes API Docker image to GHCR (tagged `:latest` + `:sha`) |
| `image-scan.yml` | After `cd-image.yml` completes | Trivy scans the published image; results go to the Security tab |
| `eas-build.yml` | Manual (`workflow_dispatch`) | EAS build with profile and platform dropdowns — requires `EXPO_TOKEN` secret |
| `release-drafter.yml` | push to `main` | Drafts GitHub Release with changelog grouped by conventional commit type |

### Security scanning

| Workflow | Trigger | What it catches |
|---|---|---|
| `codeql.yml` | push, PR, weekly Monday | Injection, prototype pollution, path traversal — results in Security tab |
| `semgrep.yml` | Weekly Monday + manual | OWASP Top 10, JWT misuse, Node/Fastify patterns — weekly deep scan (CodeQL covers push/PR) |
| `dep-audit.yml` | Daily 05:00 UTC | CVEs disclosed against pinned deps since last PR |
| `secret-scan.yml` | push + every PR | Accidentally committed secrets across full git history (Gitleaks) |

### Operations

| Workflow | Trigger | Action |
|---|---|---|
| `ops-smoke.yml` | Manual | Staging smoke checks and optional perf smoke |
| `dr-drill.yml` | Manual | Postgres backup restore + smoke validation |
| `stale.yml` | Daily 02:00 UTC | Labels issues stale at 30d, PRs at 21d; closes after 7d more |

---

## Deployment

Render blueprints in `infra/render/` (`staging.yaml`, `production.yaml`). Target shape: stateless API replicas from GHCR image, managed Postgres, managed Redis, TLS at edge.

Before first production deploy:
1. Run `pnpm secrets:otp` and set the output as `OTP_HASH_SECRET`.
2. Set `OTP_PROVIDER=resend` with a real `RESEND_API_KEY`.
3. Store all secrets in the environment's secret manager, not in `.env` files.

---

## Documentation

[`docs/`](./docs/README.md) — full documentation hub

| Doc | Description |
|---|---|
| [architecture.md](./docs/architecture.md) | Module map, request lifecycle, routing model |
| [api-reference.md](./docs/api-reference.md) | Full endpoint contracts |
| [data-model.md](./docs/data-model.md) | DB schema, relations, migrations |
| [regionalization.md](./docs/regionalization.md) | Locale/timezone/currency support strategy and implementation |
| [ui-style-guide.md](./docs/ui-style-guide.md) | Velqora Midnight design system |
| [ui-screens.md](./docs/ui-screens.md) | Per-screen component contracts |
| [security.md](./docs/security.md) | Auth, audit logging, production hardening |
| [testing.md](./docs/testing.md) | Test strategy and coverage |
| [ops-runbook.md](./docs/ops-runbook.md) | Full env vars, startup, backup, troubleshooting |
| [platform-readiness.md](./docs/platform-readiness.md) | CI/CD, infra, monitoring, DR |
