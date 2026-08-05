### Added
- Added the Elite Production Readiness Audit Report under `AUDIT/2026-08-05_production_readiness_audit.md`.
- Added Supabase database migration `20260805150500_fix_supabase_linter_warnings.sql` to resolve database linter warnings.

### Changed
- Updated GitHub Actions deployment workflow `deploy.yml` to automatically push database migrations (`supabase db push`) to Supabase when pushing to `main`.

### Fixed
- Fixed Sober Alerts Cron decryption bug by decrypting user profiles and drink records before calculating BAC.
- Optimized sober alerts cron updates from individual database writes inside a loop to efficient bulk queries.
- Resolved pre-authentication JWT database lookup vulnerability by verifying token signature before checking token blacklist status.
- Enforced `ENCRYPTION_SECRET` validation in production/staging environments to prevent silent dev-secret fallbacks.
- Added global HTTP security headers middleware to Hono server responses.
- Fixed CI/CD docker build failure by supplying `ENCRYPTION_SECRET` environment variable during the Docker Compose build step.

### Removed
