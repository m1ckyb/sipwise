### Added

### Changed

### Fixed
- Enforced strict Zod input validation schemas for `profile`, `drinks`, and `presets` data synchronization endpoints in `/api/data` to eliminate injection and storage abuse vulnerabilities (Issue 1).
- Applied IP-based rate limiting on GET and POST `/api/bac` routes before checking API keys, preventing database connection exhaustion during volumetric unauthenticated request spikes (Issue 2).
- Implemented AES-256-GCM application-layer encryption for user physical profiles and drink logs to ensure GDPR-compliant privacy protection for sensitive health telemetry at rest in the database (Issue 3).
- Verified node process hooks for `SIGTERM` and `SIGINT` signals, ensuring graceful Postgres database pool teardowns on container lifecycle transitions (Issue 4).

### Removed
- Removed legacy database setup files from the project root (`supabase_api_keys_setup.sql`, `supabase_push_setup.sql`, `update_db.sql`) and consolidated their definitions into a unified Supabase CLI migration.
- Removed legacy `.qwen/` cache/history directory to clean up the repository.
