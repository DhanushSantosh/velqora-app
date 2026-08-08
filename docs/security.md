# Security and Privacy

## Authentication and Session

- Email OTP flow for sign-in and account recovery.
- OTP values are generated server-side and stored only as a hash (`OTP_HASH_SECRET`-keyed HMAC).
- Session token is issued to client and stored as hash in DB (`sessions.token_hash`).
- Mobile session token is stored in `expo-secure-store`, not plain AsyncStorage.
- Logout revokes session by setting `revoked_at`.
- Active session count is capped per user (`AUTH_MAX_ACTIVE_SESSIONS`), automatically revoking oldest sessions when limit is exceeded.
- Dedicated recovery OTP alias routes are available for account recovery flows.
- Account deletion permanently removes the user and all cascaded owned records.
- Google Sign-In remains disabled by default until a nonce-safe native flow is adopted end to end.

## Request Validation and Error Handling

- Zod validation enforced at all route input boundaries.
- Typed validation failure responses with stable error envelope (`code`, `message`, `details`).
- Unified error handler in `app.ts` prevents stack trace leakage to clients.

## Authorization and Data Isolation

- All transaction, budget, goal, and category routes enforce `user_id` ownership on reads and writes.
- Cross-user access attempts return `404 TRANSACTION_NOT_FOUND` (or equivalent), not `403`.
- Default categories (`user_id = null`) are protected: user CRUD operations are rejected.
- Cascade `ON DELETE` constraints in Postgres ensure data is removed atomically on account deletion.

## Rate Limiting

- `request-otp` and `verify-otp` routes are rate-limited by both email and IP.
- Redis is the primary rate-limit store; in-memory fallback is used if Redis is unavailable.
- Limits are configurable via environment variables: `AUTH_RATE_LIMIT_WINDOW_SECONDS`, `AUTH_RATE_LIMIT_MAX_REQUEST_OTP`, `AUTH_RATE_LIMIT_MAX_VERIFY_OTP`.
- Proxy-aware IP handling is controlled with `TRUST_PROXY_HOPS` so auth rate limiting and audit IPs remain accurate behind proxies/load balancers.

## SMS Guardrails (Critical Policy)

- SMS detection is disabled by default.
- No background SMS ingestion is active.
- Explicit scan payloads (when feature-flag enabled) are parsed transiently for minimal fields only; raw SMS body is not persisted.
- Settings action records intent only via the consent endpoint.
- API bootstrap explicitly exposes the disabled default flag (`featureFlags.smsImportEnabledByDefault = false`).

## Auditability

Audit events are captured for all security and mutation actions via `AuditService`:

| Event | Trigger |
|---|---|
| `auth.otp_requested` | OTP requested (sign-in or recovery) |
| `auth.otp_delivery_failed` | OTP delivery provider failed to send |
| `auth.login` | Successful login — OTP verification or Google/Apple OAuth |
| `auth.logout` | Session revocation |
| `auth.account_delete_requested` | Account delete action |
| `consent.sms_import_intent` | SMS consent intent logged |
| `transaction.create` | Transaction created |
| `transaction.update` | Transaction updated |
| `transaction.delete` | Transaction deleted |
| `category.create` | Custom category created |
| `category.update` | Custom category updated |
| `category.delete` | Custom category deleted |
| `budget.upsert` | Budget plan created/upserted |
| `budget.update` | Budget plan updated |
| `budget.delete` | Budget plan deleted |
| `goal.create` | Savings goal created |
| `goal.update` | Savings goal updated |
| `goal.delete` | Savings goal deleted |
| `net_worth.account.create` | Net worth account created |
| `net_worth.account.update` | Net worth account updated |
| `net_worth.account.delete` | Net worth account archived (soft-deleted) |
| `profile.update` | Profile fields/settings patched |
| `profile.avatar_upload` | Avatar uploaded |
| `profile.avatar_remove` | Avatar removed |
| `import.sms_scan_requested` | SMS scan endpoint invoked (feature-flagged) |
| `fx.latest` | Exchange-rate snapshot fetched |

Each audit log entry stores `request_id` and `ip_address` for full request traceability.

## Idempotent Mutation Guardrail

- Transactions, budgets, goals, categories, SMS-import consent intent, profile patch, and avatar delete support `Idempotency-Key` to prevent duplicate writes during retries. Auth routes and avatar upload are not covered.
- Idempotency records are scoped by user + method + route + key and expire automatically.
- Reusing a key with a different payload is blocked with `409 IDEMPOTENCY_KEY_CONFLICT`.

## Sensitive Data Handling

- Never log raw OTP values outside explicit local debug mode.
- Never persist full SMS payload.
- Avatar uploads are signature-validated server-side (JPEG/PNG/WEBP only) and served with `X-Content-Type-Options: nosniff`.
- Avatar URLs are API-owned and cannot be supplied through the generic profile patch payload.
- Secrets (database credentials, OTP hash secret, email API keys) must be stored in environment variables or a managed secret store — never committed to source control.
- Use `OTP_PROVIDER=resend` in production and keep `DEBUG_OTP_EXPOSURE=false`.

## Internal Operational Endpoints

- `/health` is safe for public liveness checks.
- `/api/v1/status` is intended for staging/internal diagnostics and should be disabled in production unless explicitly needed.
- `/api/v1/metrics` is intended for Prometheus or internal scrapers and should not be left publicly exposed on internet-facing production deployments.

## Production Hardening Checklist

1. Replace `OTP_PROVIDER=console` with a managed email provider (`resend`).
2. Set `OTP_HASH_SECRET` to a strong, unique value (use `pnpm secrets:otp` to generate).
3. Set `PUBLIC_API_BASE_URL` to the canonical HTTPS origin for each deployed environment.
4. Set `TRUST_PROXY_HOPS` correctly for the deployed proxy chain.
5. Keep `DEBUG_OTP_EXPOSURE=false` and reject startup if `OTP_HASH_SECRET` is left at the placeholder value.
6. Enforce TLS termination at edge/load balancer — never expose plain HTTP in production.
7. Configure all secrets via a managed secret store, not `.env` files.
8. Restrict database network ingress to app-tier only.
9. Enable automated database backups with point-in-time recovery before first production release.
10. Scrape `/api/v1/metrics` only from trusted networks or service mesh paths and configure alerts for error rate and latency SLOs.
11. Add request-level abuse monitoring on auth endpoints.
