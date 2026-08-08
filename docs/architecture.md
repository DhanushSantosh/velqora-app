# Architecture

## System Overview

Velqora is a mobile-first personal finance tracker with a modular Fastify backend and an Expo React Native client.

```text
[React Native App]
   -> HTTPS/JSON
[Fastify API]
   -> [PostgreSQL]
   -> [Redis]
```

## Runtime Components

### Mobile (`apps/mobile`)

Expo React Native app for Android and iOS.

Session token persisted with `expo-secure-store` (Keychain / Android Keystore backed storage).

**State management**: `App.tsx` is the single stateful root. All screens and forms are purely presentational, receiving data and callbacks via props. No React Navigation is used — routing is managed manually via two state values:

- `activeTab: AppTabRoute` — controls which bottom-tab screen is rendered.
- `modalRoute: ModalRoute` — controls overlay modal screens (forms, Category Studio). When a modal is active, the bottom tab bar is hidden.

**Screens**:

| Screen | Route kind |
|---|---|
| Dashboard | `activeTab = dashboard` |
| Transactions | `activeTab = transactions` |
| Add/Edit Transaction | `modalRoute.kind = transactionForm` |
| Budgets | `activeTab = budgets` |
| Add/Edit Budget | `modalRoute.kind = budgetForm` |
| Goals | `activeTab = goals` |
| Add/Edit Goal | `modalRoute.kind = goalForm` |
| Settings | `activeTab = settings` |
| Profile | `modalRoute.kind = profile` |
| Category Studio | `modalRoute.kind = categoryManager` |
| Add/Edit Category | `modalRoute.kind = categoryForm` |
| Login | pre-auth (`authStage = login`) |
| OTP Verify | pre-auth (`authStage = otpVerify`) |

**UI system**: Velqora Midnight dark theme — true black backgrounds, chartreuse (`#D4FF00`) accent, `expo-blur` liquid glass BottomTabBar with animated spring pill. See `docs/ui-style-guide.md` for full token reference.

### API (`apps/api`)

Fastify modular monolith with strict module boundaries.
Drizzle ORM + Postgres for persistence.
Redis-backed rate limiting with in-memory fallback.

**Modules**:

| Module | Routes | Responsibility |
|---|---|---|
| `health` | `/health`, `/api/v1/status`, `/api/v1/bootstrap` | Liveness, gated dependency health, app config/feature flags |
| `auth` | `/api/v1/auth/*`, `/api/v1/me` | Email OTP, session issuance/revocation, identity resolution |
| `categories` | `/api/v1/categories` | Default categories listing; user-owned custom category CRUD |
| `transactions` | `/api/v1/transactions` | User-scoped CRUD, filtered/paginated listing, auto-categorization |
| `reports` | `/api/v1/reports/summary`, `/api/v1/reports/export` | Monthly aggregated summaries, CSV/PDF export |
| `budgets` | `/api/v1/budgets` | Monthly per-category budget plans with live spend aggregation |
| `goals` | `/api/v1/goals` | Savings goals with progress and completion state |
| `profile` | `/api/v1/profile`, `/api/v1/profile/avatar` | User profile details, avatar upload/remove, and per-profile preference settings |
| `consents` | `/api/v1/consents/*` | SMS import consent state and intent logging |
| `imports` | `/api/v1/imports/sms/scan` | Explicit-trigger SMS field extraction with guardrails |
| `audit` | (internal service) | Immutable audit event writes, called from other modules |
| `metrics` | `/api/v1/metrics` | Prometheus-compatible scrape endpoint, disabled by default in production |
| `fx` | `/api/v1/fx/latest` | Authenticated live exchange-rate snapshot (ECB-backed, Redis/in-memory cached) for display-currency conversion |
| `alerts` | (internal service) | Webhook alerts for OTP delivery failures and unhandled 5xx errors |
| `slo` | (internal service) | Rolling-window SLO evaluation and threshold-based alert routing |

## Request Lifecycle

1. Client sends request with optional `Authorization: Bearer <token>`.
2. `onRequest` hook resolves session via `AuthService.resolveAuth()` and injects `request.auth`.
3. Route handler calls `requireAuth(request)` to enforce authentication where required.
4. Route-level Zod validation enforces typed input boundaries via `parseOrThrow`.
5. Module executes DB operations with `user_id` ownership checks.
6. Audit events are persisted for mutations and security-relevant actions.
7. `AlertsService` emits throttled webhook notifications for unhandled 5xx failures.
8. Unified error handler in `app.ts` returns structured error envelope; stack traces are never leaked.

## Auto-Categorization

When a transaction is created without an explicit `categoryId`:

1. Prior user corrections are checked first — if a counterparty has been categorized consistently by the user before (same direction), the learned category is reused.
2. If no history match is found, deterministic keyword rules are applied against `counterparty` and `note` fields.
3. If neither matches, the transaction remains uncategorized.

Source: `apps/api/src/modules/transactions/auto-categorize.ts`

## OTP Provider Abstraction

Auth OTP delivery is provided via a swappable `OtpDeliveryProvider` interface:

- `ConsoleOtpProvider` — logs OTP to API console (development mode).
- `ResendOtpProvider` — delivers real email OTP via Resend API (production mode).

Controlled via `OTP_PROVIDER=console|resend` environment variable.

## Data and Security Boundaries

- All transaction, budget, goal, and category mutations enforce `user_id` ownership.
- OTP values are never stored in plain text — only hashed.
- Session tokens are stored as hashed values server-side.
- Avatar URLs are generated by the API from trusted origin configuration and cannot be patched directly by clients.
- Default categories (`user_id = null`) are immutable — user CRUD operations are blocked on them.
- Account deletion removes all user-owned data via Postgres cascade constraints.
- SMS detection remains disabled by default — no SMS payload is ingested or stored.
- SMS scan endpoint is disabled by default (`SMS_IMPORT_SCAN_ENABLED=false`) and requires explicit prior consent even when enabled.
- Dependency health and metrics endpoints are intended for internal/staging use and can be disabled per environment.

## Report Module Structure

The `reports` module is split into three files:

- `summary.ts` — pure aggregation logic (totals, top categories, daily series).
- `export.ts` — CSV and PDF builder functions using the summary payload.
- `routes.ts` — thin route handlers delegating to summary and export.
- `validation.ts` — Zod schemas for query parameters.

## Deployment Shape

- Stateless API containers behind a load balancer (Render blueprint manifests in `infra/render/`).
- API `Dockerfile` at `apps/api/Dockerfile`.
- Managed PostgreSQL as source of truth.
- Managed Redis for rate-limit state and future queueing.
- Separate worker service reserved for future async ingestion and AI processing.
- CI/CD via GitHub Actions (`.github/workflows/ci.yml`, `cd-image.yml`, `dr-drill.yml`).
