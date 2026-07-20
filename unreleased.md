### Added

- Fully local/self-hosted deployment mode via Docker + PostgreSQL (single codebase, env var toggle).
- Hono-based REST API server with JWT + bcrypt multi-user authentication (`server/`).
- External REST API for Home Assistant integration with API key management, idempotency, and rate limiting.
- PostgreSQL schema with `sipwise_` prefixed tables for safe coexistence.
- `node-cron` sober alert checker replacing `pg_cron` for local mode.
- Nginx reverse proxy serving the SPA and proxying API requests.
- Docker Compose orchestration for PostgreSQL, API server, and frontend.
- Frontend dual-mode detection: `VITE_API_URL` present = local mode, absent = Supabase mode.
- Production readiness audit report (`AUDIT/2026-07-20_local_deployment_production_readiness.md`).

### Changed

- Frontend components (AppContext, AuthPanel, DataManagerPanel, PushNotificationsPanel, notifications, logger) now conditionally call local REST API or Supabase based on mode.
- JWT secret validation now fails loudly on startup if missing or too short (< 32 chars).
- CORS now restricted to explicit `ALLOWED_ORIGINS` list (defaults to `http://localhost:8080`).
- Request body size limited to 1MB via Hono `bodyLimit` middleware and Nginx `client_max_body_size`.
- Health check endpoint now verifies database connectivity.
- PostgreSQL port no longer exposed to host in docker-compose.yml.
- Docker Compose JWT_SECRET now requires explicit setting (no unsafe default).

### Fixed

- Removed unused `bcrypt` import from `server/src/routes/apiKeys.ts`.
- ESLint config now excludes `server/dist` from linting.

### Removed
