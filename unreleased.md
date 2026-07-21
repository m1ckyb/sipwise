### Added
- **Production Readiness Audit Report**: Added comprehensive Principal Engineer audit report (`AUDIT/2026-07-21_production_readiness_audit.md`) assessing security, database, backend architecture, frontend, infrastructure, and reliability risks.


### Changed
- **Edge Function Authorization (`check-alerts`)**: Allowed Authorization with `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `CRON_SECRET` so `pg_cron` invocations pass cleanly without 401 Unauthorized errors.

### Fixed
- **Audit Findings Remediation (C-02, C-03, C-04, M-02, M-03, M-04, M-05, M-06, Y-01, Y-02, Y-03)**:
  - **In-Memory Rate Limiting (`C-02`)**: Switched rate limiting middleware to a high-performance in-memory sliding window store, eliminating database write amplification.
  - **Public Log Ingestion Security (`C-03`)**: Enforced rate limiting and strict payload length caps on `/api/logs` to prevent storage exhaustion attacks.
  - **PostgreSQL Advisory Locks for Cron Tasks (`C-04`)**: Added `pg_try_advisory_lock` in `checkAlerts` to prevent duplicate alert executions across multi-replica deployments.
  - **Atomic User Signup (`M-02`)**: Refactored user creation to use a single atomic PostgreSQL CTE query (`WITH new_user AS ...`).
  - **Input Bounds Validation (`M-03`)**: Added strict min/max bounds validation (`volume`: 1–5000ml, `abv`: 0–100%) in `DrinkLogger.tsx`.
  - **Process Rejection Handlers (`M-04`)**: Added `unhandledRejection` and `uncaughtException` process listeners in server entrypoint.
  - **Container Security (`M-05`)**: Configured `Dockerfile.api` to execute under unprivileged `USER node`.
  - **Cloud Data Shape Validation (`M-06`)**: Added runtime `Array.isArray` and `typeof` shape checks before applying cloud sync state.
  - **DB Pool Configuration (`Y-01`)**: Exposed `DB_POOL_MAX` environment variable for tuning PostgreSQL connection pool size.
  - **Accessibility Attributes (`Y-02`)**: Added ARIA modal dialog roles and title IDs to `DrinkLogger.tsx`.
  - **Health Version Sync (`Y-03`)**: Updated server health endpoint version string to `0.1.26`.
- **Supabase API Keys Missing `key_hash` Column (`DB-02`)**: Added schema migration statements (`ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_hash text`) to `supabase_api_keys_setup.sql` and `update_db.sql`, and added graceful fallback handling in `api/index.ts` edge function to prevent Postgres 42703 errors when querying `api_keys`.
- **Missing `check_rate_limit` RPC Function (`DB-03`)**: Added `public.check_rate_limit` stored procedure definition to `supabase_api_keys_setup.sql` and `update_db.sql` to resolve 404 RPC errors when Edge Functions execute rate limit checks.
- **Sober Alert Notifications (`check-alerts` & `AppContext`)**: Fixed local notification timer in `AppContext.tsx` to reliably trigger sober alerts when opening/waking the app after reaching 0.00% BAC, and updated `check-alerts` edge function to evaluate recent drink sessions even if `is_sober` state was uninitialized.
- **Push Subscriptions RLS Policies (`supabase_push_setup.sql`)**: Updated RLS policies to allow push notification tokens to be stored reliably without authentication failures.

### Removed

