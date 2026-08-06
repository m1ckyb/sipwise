### Added
- Added GDPR data deletion endpoint (`DELETE /api/auth/me`) which permanently deletes user data and cascades to subscriptions and API keys.
- Added Prometheus metrics collection via `prom-client` and exposed `/api/metrics` endpoint for tracking request rates and latencies.
- Added `deploy-staging.yml` GitHub workflow for continuous deployment to a staging environment from the `dev` branch.

### Changed
- Configured PostgreSQL backup service in `docker-compose.yml` to automatically upload gzip archives to AWS S3 if `S3_BACKUP_BUCKET` is provided.

### Fixed
- Fixed backend test pipeline failing due to `hono` module resolution by correctly setting the working directory.
- Fixed frontend TypeScript build type error caused by missing `vitest` config definitions in `vite.config.ts`.

### Removed
- Removed `continue-on-error: true` from Trivy vulnerability scanner in CI deployment pipeline to ensure critical CVEs correctly block deployments.
