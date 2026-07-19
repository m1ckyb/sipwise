### Added
- Comprehensive Production Readiness Audit report (`AUDIT/2026-07-19_production_readiness_audit.md`)

### Changed

### Fixed
- **Secured `check-alerts` Edge Function (`S-01`)**: Implemented authorization checks (`CRON_SECRET` & `SUPABASE_SERVICE_ROLE_KEY` bearer verification) to prevent unauthorized execution.
- **Hashed API Key Storage & Lookup (`S-02`)**: Updated `api_keys` SQL schema and `api` Edge Function to store and query SHA-256 key hashes instead of raw plaintext.
- **CI/CD Quality Gate (`D-01`)**: Added `npm run lint` and `npm test -- --run` validation steps to `.github/workflows/deploy.yml` prior to build and deployment.
- **Database Performance & Foreign Key Indexing (`DB-01`)**: Added performance indexes for `push_subscriptions(user_id)`, `api_keys(user_id)`, and `api_keys(key_hash)` across SQL scripts.
- **Input Boundary Protection & Division-by-Zero Guard (`F-01`)**: Added boundary guards in `calculateWidmarkR` and `BodyMetricsForm` to prevent invalid profile values (`0` or `NaN`) from breaking BAC calculations.
- **Strict Data Validation on Restore (`Q-02`)**: Updated `validateRestoreData` in `DataManagerPanel` with `Number.isFinite()` to prevent corrupted timestamps, volumes, or ABVs during JSON file import.
- **Legal & Medical Disclaimer (`Q-01`)**: Added safety disclaimer to Dashboard clarifying that BAC figures are mathematical estimations for informational purposes only.
- **Dynamic VAPID Email (`D-02`)**: Replaced hardcoded fallback email with configurable `VAPID_CONTACT_EMAIL` environment variable.
- **Cloud sync data loss between devices**: Sync now uses a multi-device merge strategy instead of blind overwrite. `pushToCloud` fetches existing cloud data, merges drinks (union by id) and presets (union by name), then upserts the combined result. After a successful merge push, local state is updated with any cloud-only drinks so they appear immediately. The auto-push handler also pulls from cloud after pushing, ensuring full convergence across devices.
- Fixed double pull-from-cloud on login (two competing effects could race and cause stale data)
- Auto-push handler now properly awaits push/pull and catches errors instead of unhandled promise rejections

### Removed
