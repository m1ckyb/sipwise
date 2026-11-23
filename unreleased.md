### Added

### Changed
- Bumped dependencies:
  - `@supabase/supabase-js` from 2.119.0 to 2.119.2 (#78)
  - `@vitejs/plugin-react` from 6.2.1 to 6.3.0 (#71)
  - `eslint` from 10.14.0 to 10.15.0 (#73)
  - `eslint-plugin-react-refresh` from 0.5.7 to 0.5.8 (#77)
  - `recharts` from 3.10.1 to 3.11.0 (#76)
  - `typescript-eslint` from 8.72.1 to 8.73.0 (#74)
  - `vite` from 8.3.6 to 8.3.8 (#70)
  - `vitest` from 5.1.0 to 5.1.1 (#75)
- Bumped project version to 0.2.16.

### Fixed
- **Security**: Locked down Supabase `check-alerts` Edge Function (removed `SUPABASE_ANON_KEY` auth and fail-open fallback, added constant-time comparison), blocked public `/api/metrics` in `docker/Caddyfile`, added HTTP CSP header in Caddy, fixed JWT access/refresh token-type confusion and pinned HS256 in `server/src/middleware/auth.ts`, fixed `error_logs` RLS policy to prevent anonymous `user_id` spoofing, fixed GDPR `DELETE /api/v1/auth/me` to scrub audit/error logs and revoke active tokens, validated AES-256-GCM IV/tag lengths, required `POSTGRES_PASSWORD` in `docker-compose.yml`, and excluded `backups/` from `.dockerignore`.
- **Backend**: Fixed broken PostgreSQL rate limiter (`window_start` reset bug), fixed double-prefixed `/api/v1/bac/bac` route, bypassed CSRF for `x-api-key` `/api/v1/bac` requests, fixed session-scoped advisory lock connection affinity in `checkAlerts.ts`, moved `await next()` outside `authMiddleware` try/catch, fixed same-second refresh token revocation (`jti` + atomic blacklist insert), fixed Prometheus route cardinality leak (`c.req.routePath`), added `physiological` absorption model and NaN guards to backend/Supabase BAC math, persisted idempotency keys in Supabase `api/index.ts`, fixed double-decoding and ownership hijacking in `push.ts`, and added JSON parse / recursion depth guards.
- **Frontend**: Aligned all local-mode API calls to `/api/v1/*`, fixed `signOut()` to call `POST /api/v1/auth/logout`, fixed `generateBACGraphData()` passing unfiltered future drinks and zero `metabolismRate` infinite loop, fixed `DrinkLogger` state not resetting on open/edit and `toLocalISO(NaN)` crash, fixed `pullFromCloud()` initial offline-merge dead code, fixed inventory double-volume / zero-stock / StrictMode double-recredit bugs, fixed unhandled rejections in `logger.ts` and `notifications.ts`, added 204/non-JSON safety in `api.ts`, and added `rel="noopener noreferrer"` to external links.
- **CI/CD & Docker**: Fixed `deploy-staging.yml` overwriting production `gh-pages` branch (now publishes to `gh-pages-staging`), fixed CI Docker HTTPS health checks and Caddy internal `/healthz` listener, added Trivy scanning for `sipwise-frontend`, converted `docker/Dockerfile.api` to multi-stage build, added `VITE_VAPID_PUBLIC_KEY` build arg, fixed `backup` service `pipefail` & escaping bugs, fixed `tests/performance.js` health route, and expanded Dependabot to `/server` and Dockerfiles.

### Removed
