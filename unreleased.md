### Added

### Changed

### Fixed
- Added `--remote` flag to `supabase migration repair` and `supabase db push` in `.github/workflows/deploy.yml` and `.github/workflows/deploy-staging.yml` for Supabase CLI v3.3.0 compatibility.
- Updated `sipwise-frontend` Trivy scan to `ignore-unfixed: true` and `severity: CRITICAL` so unfixable upstream Caddy Go-binary HIGH advisories do not block deploys while `sipwise-api` remains strict (`CRITICAL,HIGH`).

### Removed
