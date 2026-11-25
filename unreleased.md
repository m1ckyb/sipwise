### Added

### Changed
- Bumped Docker base images and `/server` dependencies across Dependabot PRs (#79–#91):
  - `node` Docker base image from `22-alpine` to `26-alpine` in `Dockerfile` (#80) and `docker/Dockerfile.api` (#79)
  - `@hono/node-server` from `1.14.3` to `2.1.11` (#91)
  - `hono` from `4.8.4` to `4.13.19` (#89)
  - `node-cron` from `3.0.3` to `4.6.0` (#88)
  - `pg` & `@types/pg` from `8.16.0` / `8.15.4` to `8.23.1` (#84)
  - `pino` from `10.3.1` to `10.4.0` (#85)
  - `web-push` from `3.6.6` to `4.0.0` (#83)
  - `zod` from `4.4.3` to `4.6.7` (#86)
  - `@types/node` from `22.16.5` to `26.6.6` (#87)
  - `tsx` from `4.19.5` to `4.23.15` (#90)
  - `typescript` from `5.8.3` to `7.0.2` (#81)
  - `vitest` from `3.0.0` to `5.1.1` (#82)
- Bumped project version to 0.2.20.

### Fixed
- Updated `ScheduledTask` type import in `server/src/cron/checkAlerts.ts` for `node-cron` v4 built-in TypeScript definitions.
- Fixed GitHub Actions syntax error in `.github/workflows/deploy-staging.yml` (`secrets` context is not allowed directly in `if:` expressions) by checking staging Supabase secrets via a `check-supabase` output step.
- Fixed `web-push` v4 ESM import in `server/src/utils/vapid.ts` (`import * as webpush from 'web-push'`) to resolve container startup crash (`SyntaxError: The requested module 'web-push' does not provide an export named 'default'`).
- Fixed `docker/Caddyfile` routing bug where `try_files {path} /index.html` ran before `reverse_proxy` and hijacked all `/api/*` requests; wrapped `/api/metrics`, `/api/*`, and SPA fallback in mutually exclusive `handle` blocks.

### Removed
