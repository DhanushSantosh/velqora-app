# API Reference

Base URL: `http://localhost:4000`

## Conventions

### Authentication

Use bearer token after OTP verification:

```http
Authorization: Bearer <session_token>
```

### Error Envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": {}
  },
  "requestId": "req-123"
}
```

### Idempotency (Mutation Safety)

For authenticated mutation endpoints (`POST`, `PATCH`, `DELETE`), clients can send:

```http
Idempotency-Key: <8-128-char-visible-ascii>
```

Behavior:

- First request with a key executes normally and stores the response for 24 hours.
- Retry with the same key and identical payload returns the original response with header:
  - `x-idempotent-replay: true`
- Reusing the same key with a different payload returns:
  - `409 IDEMPOTENCY_KEY_CONFLICT`
- If a keyed request is still processing, API returns:
  - `409 IDEMPOTENCY_IN_PROGRESS`

Coverage: transactions, budgets, goals, categories (create/update/delete), SMS-import consent intent, profile patch, and avatar delete. Auth routes and avatar **upload** are not idempotency-key covered.

## Health and Bootstrap

### `GET /health`

Returns API liveness.

### `GET /api/v1/status`

Returns runtime status, dependency configuration flags, and live dependency health.

Response includes:

- `dependencies.databaseHealthy`
- `dependencies.redisHealthy`
- `otpDelivery.provider` (`console|resend`)
- `otpDelivery.ready` (`boolean`)
- `otpDelivery.requestTimeoutMs` (`number`)

### `GET /api/v1/bootstrap`

Returns app config and feature flags.

Key guarantee:

- `featureFlags.smsImportEnabledByDefault` is always `false` (SMS feature is disabled).

Also returns default display-region hints:

- `currency` (global fallback)
- `locale` (global fallback)
- `timezone` (global fallback)

## Authentication

### `POST /api/v1/auth/request-otp`

Request body:

```json
{
  "email": "user@example.com"
}
```

Response:

```json
{
  "message": "If this email is valid, an OTP has been sent."
}
```

Non-production addition (`NODE_ENV !== production`): includes `debugOtpCode` for local testing.

### `POST /api/v1/auth/verify-otp`

Request body:

```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

Response:

```json
{
  "token": "session-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "session": {
    "expiresInDays": 30
  }
}
```

### `POST /api/v1/auth/recovery/request-otp`

Alias of request OTP flow for account recovery.

Request body:

```json
{
  "email": "user@example.com"
}
```

### `POST /api/v1/auth/recovery/verify-otp`

Alias of OTP verification flow for recovery login.

### `POST /api/v1/auth/oauth/google`

Request body:

```json
{
  "idToken": "google-id-token",
  "nonce": "client-generated-nonce"
}
```

Verifies the Google ID token, resolves/merges the user by `google_id`, and issues a session (same shape as OTP login).

### `POST /api/v1/auth/oauth/apple`

Native iOS Apple Sign-In flow.

Request body:

```json
{
  "identityToken": "apple-identity-token",
  "rawNonce": "client-generated-nonce",
  "audience": "app",
  "user": { "firstName": "Dhanush", "lastName": "K", "email": "user@example.com" }
}
```

`user` is only present on the first sign-in per Apple's own behavior. `audience` is `app` (native bundle ID) or `service` (Service ID, browser fallback).

### `POST /api/v1/auth/oauth/apple/callback`

Backend-mediated browser fallback for Apple Sign-In on Android / non-native contexts. Receives Apple's form-post callback, validates the redirect URI against an allowlist, and 303-redirects back into the app deep link with the identity token (or error) as query params for the client to complete the exchange.

### `POST /api/v1/auth/logout`

Requires auth. Revokes active session.

### `GET /api/v1/me`

Requires auth. Returns current user identity.

### `DELETE /api/v1/account`

Requires auth. Permanently deletes authenticated user and cascaded user-owned records.

## Profile

### `GET /api/v1/profile`

Requires auth. Returns full profile and per-profile preference settings.

Response:

```json
{
  "item": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Dhanush",
    "lastName": "K",
    "displayName": "Dhanush K",
    "phoneNumber": "+919999999999",
    "dateOfBirth": "2002-08-21",
    "avatarUrl": "https://example.com/avatar.jpg",
    "city": "Bengaluru",
    "country": "India",
    "timezone": "Asia/Kolkata",
    "locale": "en-IN",
    "currency": "INR",
    "occupation": "Student",
    "bio": "Building Velqora to production quality.",
    "settings": {
      "pushNotificationsEnabled": true,
      "emailNotificationsEnabled": true,
      "weeklySummaryEnabled": true,
      "biometricsEnabled": false,
      "marketingOptIn": false
    },
    "createdAt": "2026-03-16T10:00:00.000Z",
    "updatedAt": "2026-03-16T10:00:00.000Z"
  }
}
```

### `PATCH /api/v1/profile`

Requires auth. Partial update accepted.

Request body (all fields optional, nested settings optional):

```json
{
  "displayName": "Dhanush K",
  "avatarUrl": "https://example.com/avatar.jpg",
  "timezone": "Asia/Kolkata",
  "currency": "INR",
  "settings": {
    "pushNotificationsEnabled": false,
    "weeklySummaryEnabled": false
  }
}
```

### `POST /api/v1/profile/avatar`

Requires auth. Uploads a profile image file (`multipart/form-data`, field name `file`).

Constraints:

- Allowed types: `image/jpeg`, `image/png`, `image/webp`
- Max size: 5 MB

Response:

```json
{
  "item": {
    "id": "uuid",
    "avatarUrl": "http://localhost:4000/api/v1/profile/avatar/<avatar-key>"
  }
}
```

### `DELETE /api/v1/profile/avatar`

Requires auth. Removes the current profile picture and clears `avatarUrl`.

## Categories

### `GET /api/v1/categories`

Requires auth. Returns default categories and user-specific categories.

Response:

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Food & Dining",
      "direction": "debit",
      "isDefault": true
    }
  ]
}
```

### `POST /api/v1/categories`

Requires auth. Creates a user-owned custom category.

Request body:

```json
{
  "name": "Rent",
  "direction": "debit"
}
```

### `PATCH /api/v1/categories/:id`

Requires auth. Updates only user-owned custom categories.

### `DELETE /api/v1/categories/:id`

Requires auth. Deletes only user-owned custom categories.

Guardrail:
- Returns conflict if the category is currently used by a budget plan.

## Transactions

### `GET /api/v1/transactions`

Requires auth.

Query parameters:

- `page` (default `1`)
- `pageSize` (default `20`, max `100`)
- `direction` (`debit|credit|transfer`)
- `categoryId`
- `from` (ISO datetime)
- `to` (ISO datetime)
- `sortBy` (`occurredAt|amount`, default `occurredAt`)
- `sortOrder` (`asc|desc`, default `desc`)
- `search` (string, max 200 chars — case-insensitive match against `counterparty` and `note`)

Response includes:

- `items`: transaction list for current page
- `pagination.page`
- `pagination.pageSize`
- `pagination.hasMore`
- `pagination.nextPage`

### `POST /api/v1/transactions`

Requires auth.

Request body:

```json
{
  "direction": "debit",
  "amount": 520.45,
  "currency": "INR",
  "categoryId": "uuid",
  "counterparty": "Metro Store",
  "note": "Snacks",
  "occurredAt": "2026-03-11T15:00:00.000Z"
}
```

`currency` is optional. If omitted, the API uses the authenticated user’s profile currency.

Auto-categorization behavior when `categoryId` is omitted:

- Prior user corrections are checked first, learned from transaction history (counterparty + direction).
- If no history match, deterministic keyword rules are applied.
- If neither matches, transaction remains uncategorized.

### `PATCH /api/v1/transactions/:id`

Requires auth. Partial update accepted.

### `DELETE /api/v1/transactions/:id`

Requires auth. Deletes only if owned by authenticated user.

## Reports

### `GET /api/v1/reports/summary`

Requires auth.

Query parameters:

- `month` (`YYYY-MM`, default current month in the user profile timezone)
- `currency` (3-char ISO code, default user profile currency)
- `top` (number of top debit categories, default `5`, max `10`)

Response includes:

- `totals`: income, expense, transfer, net, transactionCount for selected month/currency
- `topCategories`: top debit categories by spend
- `dailySeries`: date-wise income/expense/net rows across the month window
- `period`: resolved UTC start and endExclusive boundaries used for the selected month in the user timezone

### `GET /api/v1/reports/export`

Requires auth.

Query parameters:

- `month` (`YYYY-MM`, default current month in the user profile timezone)
- `currency` (3-char ISO code, default user profile currency)
- `top` (number of top debit categories, default `5`, max `10`)
- `format` (`csv|pdf`, default `csv`)

Response:

- CSV: `text/csv` attachment
- PDF: `application/pdf` attachment

## Budgets

### `GET /api/v1/budgets?month=YYYY-MM`

Requires auth.

Response includes:

- Per-category budget amount
- Month spend aggregation from debit transactions
- Remaining amount and utilization percentage
- Month totals summary

### `POST /api/v1/budgets`

Requires auth.

Request body:

```json
{
  "categoryId": "uuid",
  "month": "2026-03",
  "amount": 2000,
  "currency": "INR"
}
```

Budgets are constrained to debit categories and upserted by `(user, category, month)`.
`currency` is optional and defaults to the authenticated user’s profile currency.

### `PATCH /api/v1/budgets/:id`

Requires auth. Partial update accepted.

### `DELETE /api/v1/budgets/:id`

Requires auth. Deletes only if owned by authenticated user.

## Goals

### `GET /api/v1/goals`

Requires auth.

Returns goal list ordered by latest update with progress and completion state.

### `POST /api/v1/goals`

Requires auth.

Request body:

```json
{
  "name": "Emergency Fund",
  "targetAmount": 50000,
  "currentAmount": 10000,
  "currency": "INR",
  "targetDate": "2026-12-31T00:00:00.000Z"
}
```

`currency` is optional and defaults to the authenticated user’s profile currency.

### `PATCH /api/v1/goals/:id`

Requires auth. Partial update accepted.

### `DELETE /api/v1/goals/:id`

Requires auth. Deletes only if owned by authenticated user.

## SMS Consent Guardrail

### `GET /api/v1/consents/sms-import`

Requires auth. Returns current consent snapshot.

### `POST /api/v1/consents/sms-import-intent`

Requires auth.

Request body:

```json
{
  "enabled": true
}
```

Behavior:

- Logs user intent.
- Returns `featureAvailable: false`.
- Keeps `enabled: false` (SMS import is not active).

## SMS Imports (Guarded Service)

### `POST /api/v1/imports/sms/scan`

Requires auth.

Request body:

```json
{
  "messages": [
    {
      "messageId": "msg-1",
      "body": "Rs 1250 debited from A/c to UPI MERCHANT. Ref UTR123456.",
      "sender": "VK-BANK",
      "receivedAt": "2026-03-15T10:20:00.000Z"
    }
  ]
}
```

Guardrails:

- Disabled by default in all environments (`SMS_IMPORT_SCAN_ENABLED=false`).
- Requires explicit user consent (`consentKey = sms_import`, `enabled = true`).
- Extracts only minimal transaction fields.
- Does not persist raw SMS content in database.

## FX / Exchange Rates

### `GET /api/v1/fx/latest?base=<CURRENCY>`

Requires auth.

Query parameters:

- `base` (3-char ISO code, optional — defaults to app currency)

Returns the current exchange-rate snapshot (ECB-backed daily feed, Redis/in-memory cached) with rates mapped from the requested base currency. Used by mobile to render ledger/budget/goal values converted into the profile's selected display currency.

## Metrics

### `GET /api/v1/metrics`

Prometheus-compatible metrics endpoint for request rate, status distribution, and latency histograms.

Notes:

- Intended for internal scrapers, not public browser access.
- May return `404 METRICS_ENDPOINT_DISABLED` when disabled for the current environment.

## Rate Limits (Auth)

- Request OTP and Verify OTP routes are rate-limited by IP and email.
- Redis is primary store; in-memory fallback is used if Redis is unavailable.
