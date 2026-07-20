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
- Password complexity validation (8+ chars, uppercase, lowercase, digit) via zod on signup.
- PostgreSQL-backed rate limiting replacing in-memory Map for persistent rate limit state.
- Graceful shutdown handlers for SIGTERM/SIGINT (closes HTTP server, stops cron, closes DB pool).
- Frontend container healthcheck in Docker Compose.
- Container resource limits (pg: 512M/1cpu, api: 256M/0.5cpu, frontend: 128M/0.25cpu).
- CSRF protection middleware (Origin/Referer header validation).
- Structured JSON logging via pino across all server modules.
- Request ID correlation middleware (`x-request-id` header propagation).
- Audit trail table (`sipwise_audit_trail`) and `logAuditEvent()` for signup, login, API key operations.
- Zod request body validation on all API routes (auth, data, push, apiKeys, api, logs).
- Frontend request timeouts (15s AbortController) and retry with exponential backoff for GET requests (2 retries, 5xx + network errors).
- Automated PostgreSQL backup sidecar in Docker Compose (daily pg_dump, 30-day retention).
- Idempotency key cleanup cron (daily 3AM, 7-day expiry).
- Rate limit cleanup cron (hourly).
- Configurable bcrypt rounds via `BCRYPT_ROUNDS` env var (default 12).
- Push subscription endpoint URL validation via zod.
- Docker build + Trivy security scanning + health check in CI (`docker-build` job).
- Docker security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection).
- Nginx proxy timeouts (5s connect, 30s read/write).

### Changed

- Frontend components (AppContext, AuthPanel, DataManagerPanel, PushNotificationsPanel, notifications, logger) now conditionally call local REST API or Supabase based on mode.
- JWT secret validation now fails loudly on startup if missing or too short (< 32 chars).
- CORS now restricted to explicit `ALLOWED_ORIGINS` list (defaults to `http://localhost:8080`).
- Request body size limited to 1MB via Hono `bodyLimit` middleware and Nginx `client_max_body_size`.
- Health check endpoint now verifies database connectivity.
- PostgreSQL port no longer exposed to host in docker-compose.yml.
- Docker Compose JWT_SECRET now requires explicit setting (no unsafe default).
- All server modules (db, index, cron, routes, utils) migrated from `console.log` to pino structured logger.
- Frontend `api.ts` fetch requests now include AbortController timeout and retry with exponential backoff.

### Fixed

- Removed unused `bcrypt` import from `server/src/routes/apiKeys.ts`.
- ESLint config now excludes `server/dist` from linting.
- Hono TypeScript type errors resolved via shared `Env` type for context variable typing.

### Removed

- In-memory rate limiter (replaced by PostgreSQL-backed implementation).
- Supabase lazy-load Proxy pattern (reverted due to ESM/TypeScript compatibility issues).
