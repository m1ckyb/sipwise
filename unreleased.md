### Added

### Changed
- **Edge Function Authorization (`check-alerts`)**: Allowed Authorization with `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `CRON_SECRET` so `pg_cron` invocations pass cleanly without 401 Unauthorized errors.

### Fixed
- **Supabase API Keys Missing `key_hash` Column (`DB-02`)**: Added schema migration statements (`ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_hash text`) to `supabase_api_keys_setup.sql` and `update_db.sql`, and added graceful fallback handling in `api/index.ts` edge function to prevent Postgres 42703 errors when querying `api_keys`.
- **Missing `check_rate_limit` RPC Function (`DB-03`)**: Added `public.check_rate_limit` stored procedure definition to `supabase_api_keys_setup.sql` and `update_db.sql` to resolve 404 RPC errors when Edge Functions execute rate limit checks.
- **Sober Alert Cloud Notifications (`check-alerts`)**: Fixed ISO date string timestamp parsing in `check-alerts` edge function so BAC calculations evaluate properly when drink timestamps are string ISO dates, restoring Web Push notifications when BAC reaches 0.00%.

### Removed

