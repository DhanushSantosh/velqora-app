# Data Model

Database: PostgreSQL 16+

ORM: Drizzle (`apps/api/src/db/schema.ts`)

## Enums

- `transaction_direction`: `debit`, `credit`, `transfer`
- `transaction_source`: `manual`, `sms_import`, `statement_import`
- `net_worth_account_type`: `asset`, `liability`

## Tables

### `users`

- `id` (uuid, pk)
- `email` (unique)
- `google_id` nullable (unique) — set on Google OAuth login
- `apple_id` nullable (unique) — set on Apple OAuth login
- `auth_provider` (`otp`, `google`, `apple`, `merged`) — default `otp`
- timestamps

### `user_profiles`

- `user_id` (uuid, pk, fk -> `users.id`, one-to-one)
- Profile identity fields:
  - `first_name`, `last_name`, `display_name`
  - `phone_number`, `date_of_birth`, `avatar_url`
  - `city`, `country`, `timezone`, `locale`, `currency`
  - `occupation`, `bio`
- Per-profile settings:
  - `push_notifications_enabled`
  - `email_notifications_enabled`
  - `weekly_summary_enabled`
  - `biometrics_enabled`
  - `marketing_opt_in`
- `created_at`, `updated_at`

### `sessions`

- `id` (uuid, pk)
- `user_id` -> `users.id`
- `token_hash` (unique)
- `expires_at`, `revoked_at`, `created_at`

### `auth_otps`

- `id` (uuid, pk)
- `email`
- `code_hash`
- `expires_at`
- `attempts`, `max_attempts`
- `request_ip`, `used_at`, `created_at`

### `categories`

- `id` (uuid, pk)
- `user_id` nullable -> `users.id`
- `name`
- `direction`
- `created_at`

`user_id = null` represents globally seeded default categories.

### `transactions`

- `id` (uuid, pk)
- `user_id` -> `users.id`
- `category_id` nullable -> `categories.id`
- `direction`, `source`
- `amount` (numeric 14,2)
- `currency` (3-char)
- `counterparty`, `note`
- `occurred_at`, `created_at`, `updated_at`

### `budget_plans`

- `id` (uuid, pk)
- `user_id` -> `users.id`
- `category_id` -> `categories.id`
- `month` (`YYYY-MM`)
- `amount` (numeric 14,2)
- `currency` (3-char)
- `created_at`, `updated_at`

Indexes and constraints:

- Index: `(user_id, month)`
- Index: `(category_id)`
- Unique: `(user_id, category_id, month)`

### `savings_goals`

- `id` (uuid, pk)
- `user_id` -> `users.id`
- `name`
- `target_amount` (numeric 14,2)
- `current_amount` (numeric 14,2)
- `currency` (3-char)
- `target_date` nullable
- `closed_at` nullable
- `created_at`, `updated_at`

Indexes:

- Index: `(user_id, updated_at)`

### `net_worth_accounts`

- `id` (uuid, pk)
- `user_id` -> `users.id`
- `name`
- `account_type` (`asset`, `liability`)
- `subtype` — free-form (e.g. `bank`, `cash`, `investment`, `property`, `vehicle`, `other_asset`, `credit_card`, `loan`, `other_liability`); kept as text rather than an enum since new subtypes are a UI/product concern, not a schema migration
- `balance` (numeric 14,2) — always non-negative; sign is implied by `account_type`
- `currency` (3-char)
- `notes` nullable
- `archived_at` nullable — soft-delete; archived accounts are excluded from the default list/summary
- `created_at`, `updated_at`

Indexes:

- Index: `(user_id, updated_at)`

Manual balance tracking only — there is no bank/UPI sync behind this table yet. Account Aggregator integration remains a future roadmap item.

### `consents`

- `id` (uuid, pk)
- `user_id` -> `users.id`
- `consent_key`
- `enabled`
- `legal_text_version`
- `captured_at`

Unique: `(user_id, consent_key)`

### `audit_logs`

- `id` (uuid, pk)
- `user_id` nullable -> `users.id`
- `action`, `entity_type`, `entity_id`
- `metadata` (jsonb)
- `request_id`, `ip_address`, `created_at`

### `avatar_assets`

- `user_id` (uuid, pk, fk -> `users.id`, one-to-one, `ON DELETE CASCADE`)
- `avatar_key` (unique) — referenced by the API-served avatar URL, not a raw file path
- `mime_type`
- `content_base64` — image bytes stored in Postgres, not container-local filesystem
- `created_at`, `updated_at`

### `idempotency_keys`

- `id` (uuid, pk)
- `user_id` -> `users.id`
- `request_method`, `request_route`
- `key` (idempotency key value)
- `request_hash` (hashed params/query/body fingerprint)
- `response_status` nullable
- `response_body` nullable jsonb
- `created_at`, `expires_at`, `completed_at`

Indexes and constraints:

- Unique: `(user_id, request_method, request_route, key)`
- Index: `(expires_at)`

## Migration Workflow

From repo root:

```bash
pnpm --filter @velqora/api db:generate
pnpm --filter @velqora/api db:migrate
```

Generated migration artifacts live in `apps/api/drizzle`.

## Seeding

Default categories are ensured during API startup by `ensureDefaultCategories`.
