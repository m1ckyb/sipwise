### Added
- **Production Readiness Audit Report**: Added comprehensive Principal Engineer audit report (`AUDIT/2026-07-21_production_readiness_audit.md`) assessing security, database, backend architecture, frontend, infrastructure, and reliability risks.


### Changed
- **Edge Function Authorization (`check-alerts`)**: Allowed Authorization with `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `CRON_SECRET` so `pg_cron` invocations pass cleanly without 401 Unauthorized errors.

### Fixed
- **Supabase API Keys Missing `key_hash` Column (`DB-02`)**: Added schema migration statements (`ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_hash text`) to `supabase_api_keys_setup.sql` and `update_db.sql`, and added graceful fallback handling in `api/index.ts` edge function to prevent Postgres 42703 errors when querying `api_keys`.
- **Missing `check_rate_limit` RPC Function (`DB-03`)**: Added `public.check_rate_limit` stored procedure definition to `supabase_api_keys_setup.sql` and `update_db.sql` to resolve 404 RPC errors when Edge Functions execute rate limit checks.
- **Sober Alert Notifications (`check-alerts` & `AppContext`)**: Fixed local notification timer in `AppContext.tsx` to reliably trigger sober alerts when opening/waking the app after reaching 0.00% BAC, and updated `check-alerts` edge function to evaluate recent drink sessions even if `is_sober` state was uninitialized.
- **Push Subscriptions RLS Policies (`supabase_push_setup.sql`)**: Updated RLS policies to allow push notification tokens to be stored reliably without authentication failures.

### Removed

