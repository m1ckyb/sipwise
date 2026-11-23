### Added

### Changed

### Fixed
- Stripped unused `npm`, `corepack`, and `yarn` binaries/packages from the production `docker/Dockerfile.api` runtime image to eliminate 10 bundled npm CLI Trivy HIGH CVEs (`brace-expansion`, `ip-address`, `pacote`, `picomatch`, `sigstore`).
- Guarded staging Supabase deployment steps in `.github/workflows/deploy-staging.yml` when `STAGING_SUPABASE_ACCESS_TOKEN` / `STAGING_SUPABASE_PROJECT_ID` secrets are not configured, and removed deprecated `--password` from `supabase link`.

### Removed
