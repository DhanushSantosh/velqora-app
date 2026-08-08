# Project Health Snapshot

Last updated: 2026-03-29

## Overall Status

The project is in a healthy development state.

- Core backend and mobile foundations are implemented
- Local and real-phone development workflows are working
- Test suites are green
- Dependency audit is clean
- Documentation coverage is strong

This is no longer a fragile prototype. The main work ahead is product completion and operational hardening rather than foundational rescue.

## Current Baseline

### Repository

- Branch health: clean working tree expected on `main`
- Package manager: `pnpm` workspaces
- Recent maintenance:
  - Tailscale-based dev client workflow is the default real-phone path
  - dependency advisories were patched and verified
  - security remediation pass is merged and verified

### Backend

- Stack: Fastify v5 + Drizzle + PostgreSQL + Redis
- Modules implemented:
  - auth
  - profile
  - categories
  - transactions
  - budgets
  - goals
  - reports
  - consents
  - imports
  - metrics
  - health
  - alerts
  - audit
  - slo
- Key protections in place:
  - OTP auth
  - active-session cap
  - rate limiting
  - idempotent write protection
  - audit logging
  - stable 4xx error normalization for common client failures

### Mobile

- Stack: Expo 55 + React Native 0.83 + React 19
- Main screens implemented:
  - login
  - OTP verify
  - dashboard
  - transactions
  - budgets
  - goals
  - category manager
  - profile
  - settings
- UX baseline in place:
  - Velqora Midnight design system
  - bottom tab shell
  - centralized toast feedback
  - safe-area handling
  - profile/regional settings
  - optimistic updates with background reconciliation

## Verification Status

Latest validated results:

- `pnpm audit --prod` -> clean
- `pnpm audit` -> clean
- `pnpm --filter @velqora/api typecheck` -> passed
- `pnpm --filter @velqora/mobile typecheck` -> passed
- `pnpm --filter @velqora/api test` -> 184 passed
- `pnpm --filter @velqora/mobile test` -> 51 passed

## What Is Stable

- Local API and mobile development loop
- Real-phone testing over Tailscale + dev client
- Core finance record CRUD flows
- Budget and goal tracking flows
- Profile and regional preference handling
- Shared docs, CI/CD definitions, and operational scripts

## What Still Needs Attention

These are not emergency issues, but they are the main remaining maintenance and maturity gaps.

### Operational maturity

- Real staging/production monitoring dashboards and alert routing verification
- Backup/restore drill execution history and evidence
- Managed secret rotation cadence enforcement
- Production OTP provider rollout validation end to end

### Product completion

- AI/service integrations are still pending
- SMS import is intentionally guarded and not fully rolled out
- Some release-readiness work remains before store-grade production confidence

### Documentation hygiene

- Shared memory must be updated at the end of each session
- Maintenance state should be kept aligned with actual pushed commits

## Recommended Next Maintenance Work

1. Run a release-readiness audit against staging assumptions:
   - secrets
   - OTP provider
   - monitoring
   - backup/restore
   - alert routing
2. Verify all docs still match actual scripts and current workflows after each infra or dev-loop change.
3. Add a lightweight recurring maintenance checklist for:
   - dependency audit
   - CI workflow review
   - secret rotation review
   - smoke-test verification

## Recommended Next Product Work

1. Prioritize the next fully shippable user-facing slice rather than adding partial integrations.
2. Keep service integrations separate from UI iteration so working features stay production-grade.
