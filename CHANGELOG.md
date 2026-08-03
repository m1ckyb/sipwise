# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.7] - 2026-08-03

### Added
- Average Drinks per Session statistic to the All-Time Stats section on the History page, displayed next to Highest Recorded BAC.
- Added standard shot size setting (defaults to 30ml) under Body Metrics settings, allowing custom shot volumes to be calculated and displayed across the app.
- Display equivalent standard shot counts (at 30ml/shot) for each bottle size listed under the unopened container stock list.

### Changed
- Changed PWA registerType to `'prompt'` in `vite.config.ts` so users are prompted to refresh to the new version when updates are released, instead of silently updating and showing the "App ready to work offline" message.

### Fixed
- Fixed backend Hono rate limit middleware failing to start in Docker container due to incorrect conninfo helper import path (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
- Fixed GitHub Actions Docker build job failure due to missing JWT_SECRET environment variable during the docker compose build step.
- Fixed backend data-sync validation schema (Zod) stripping out new inventory fields (`bottles` and `activeContainerVolume`), ensuring they persist correctly after synchronizing with the cloud database.

## [0.2.6] - 2026-07-29

### Added
- Added ability to track and add different sized bottles/units to individual stock items in the inventory.
- Added quick action selectors (+330ml, +375ml, +500ml, +700ml, +750ml, +1000ml) and custom volume input for adding bottles of varying sizes.
- Added inventory display listing the count and volume breakdown of unopened stock.
- Supported consumption/deduction of dynamic bottle sizes from stock, including smart-matching bottle/unit volumes.

## [0.2.5] - 2026-07-28

### Fixed
- Fixed an asynchronous React state race condition inside the `consumeFromInventory` hook that caused spurious "not enough stock" warnings to trigger when logging a drink even when the container had ample volume remaining.

## [0.2.4] - 2026-07-28

### Fixed
- Enforced strict Zod input validation schemas for `profile`, `drinks`, and `presets` data synchronization endpoints in `/api/data` to eliminate injection and storage abuse vulnerabilities (Issue 1).
- Applied IP-based rate limiting on GET and POST `/api/bac` routes before checking API keys, preventing database connection exhaustion during volumetric unauthenticated request spikes (Issue 2).
- Implemented AES-256-GCM application-layer encryption for user physical profiles and drink logs to ensure GDPR-compliant privacy protection for sensitive health telemetry at rest in the database (Issue 3).
- Verified node process hooks for `SIGTERM` and `SIGINT` signals, ensuring graceful Postgres database pool teardowns on container lifecycle transitions (Issue 4).

### Removed
- Removed legacy database setup files from the project root (`supabase_api_keys_setup.sql`, `supabase_push_setup.sql`, `update_db.sql`) and consolidated their definitions into a unified Supabase CLI migration.
- Removed legacy `.qwen/` cache/history directory to clean up the repository.

## [0.2.3] - 2026-07-28

### Added
- Added standard shots remaining display (calculated at 30ml per shot) to the open container information in both the stock manager and the drink logger.

## [0.2.2] - 2026-07-28

### Added
- Added an option in the edit stock form to manually adjust the remaining volume (MLs left) in the active container.
- Added automatic stock re-credit when deleting a logged drink in inventory mode (it adds the drink volume back to the corresponding inventory item, recalculating bottle counts if it overflows).

## [0.2.1] - 2026-07-28

### Changed
- Moved the App Mode settings panel to be located directly above the Drink Presets panel and collapsed it by default.

### Fixed
- Fixed a bug where quick-add, quick-drink, custom, and preset logs on the dashboard or logger didn't automatically deduct from stock when the drink name matched an inventory item in inventory mode (now using case-insensitive and trimmed name comparison to prevent match failures).

## [0.2.0] - 2026-07-28

### Added
- Inventory stock mode for managing digital alcohol inventory.
- App Mode configuration panel in Settings to toggle between Standard Logger and Inventory Stock Mode.
- Stock & Inventory management view to add, edit, delete, and quick-adjust items in stock.
- Multi-dose container tracking (e.g. liquor bottles) and single-use unit tracking (e.g. beer cans).
- DrinkLogger integration to consume drinks directly from active inventory with automatic level deduction.
- Low stock replenishment warning banner on dashboard/inventory view.
- Staged JWT session blacklist database table and verification middleware.
- Staged POST /logout route to invalidate active user session tokens.
- Add dynamic container health check to the API backend service.
- Add index on user_id inside sipwise_error_logs table.
- Implement recursive sanitizers to redact passwords, keys, and credentials from ingestion error logs.

### Fixed
- Fixed a bug where opening a container from inventory would not decrement the unopened bottles count (e.g. adding a drink left the bottle status as "unopened").
- Fixed authentication bypass vulnerability on account endpoint `/api/auth/me`.
- Secured API client rate-limiting against IP header spoofing with socket-based IP extraction.
- Blocked CSRF validation bypass for state-changing endpoints without Origin/Referer headers.
- Decoupled server rate limit Map store to shared PostgreSQL records to support multi-replica horizontal scaling.
- Added catch exception handlers on unawaited connection pool query promises to prevent silent server crashes.

## [0.1.28] - 2026-07-27

### Changed
- Updated dependencies (`recharts`, `aquasecurity/trivy-action`, `docker/setup-buildx-action`).
- Updated devDependencies (`eslint`, `typescript-eslint`, `@vitejs/plugin-react`, `globals`).

## [0.1.27] - 2026-07-22

### Added
- **Production Readiness Audit Report**: Added comprehensive Principal Engineer audit report (`AUDIT/2026-07-21_production_readiness_audit.md`) assessing security, database, backend architecture, frontend, infrastructure, and reliability risks.

### Changed
- **Edge Function Authorization (`check-alerts`)**: Allowed Authorization with `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `CRON_SECRET` so `pg_cron` invocations pass cleanly without 401 Unauthorized errors.

### Fixed
- **Audit Findings Remediation (C-02, C-03, C-04, M-02, M-03, M-04, M-05, M-06, Y-01, Y-02, Y-03)**:
  - **In-Memory Rate Limiting (`C-02`)**: Switched rate limiting middleware to a high-performance in-memory sliding window store, eliminating database write amplification.
  - **Public Log Ingestion Security (`C-03`)**: Enforced rate limiting and strict payload length caps on `/api/logs` to prevent storage exhaustion attacks.
  - **PostgreSQL Advisory Locks for Cron Tasks (`C-04`)**: Added `pg_try_advisory_lock` in `checkAlerts` to prevent duplicate alert executions across multi-replica deployments.
  - **Atomic User Signup (`M-02`)**: Refactored user creation to use a single atomic PostgreSQL CTE query (`WITH new_user AS ...`).
  - **Input Bounds Validation (`M-03`)**: Added strict min/max bounds validation (`volume`: 1–5000ml, `abv`: 0–100%) in `DrinkLogger.tsx`.
  - **Process Rejection Handlers (`M-04`)**: Added `unhandledRejection` and `uncaughtException` process listeners in server entrypoint.
  - **Container Security (`M-05`)**: Configured `Dockerfile.api` to execute under unprivileged `USER node`.
  - **Cloud Data Shape Validation (`M-06`)**: Added runtime `Array.isArray` and `typeof` shape checks before applying cloud sync state.
  - **DB Pool Configuration (`Y-01`)**: Exposed `DB_POOL_MAX` environment variable for tuning PostgreSQL connection pool size.
  - **Accessibility Attributes (`Y-02`)**: Added ARIA modal dialog roles and title IDs to `DrinkLogger.tsx`.
  - **Health Version Sync (`Y-03`)**: Updated server health endpoint version string to `0.1.27`.
- **Supabase API Keys Missing `key_hash` Column (`DB-02`)**: Added schema migration statements (`ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_hash text`) to `supabase_api_keys_setup.sql` and `update_db.sql`, and added graceful fallback handling in `api/index.ts` edge function to prevent Postgres 42703 errors when querying `api_keys`.
- **Missing `check_rate_limit` RPC Function (`DB-03`)**: Added `public.check_rate_limit` stored procedure definition to `supabase_api_keys_setup.sql` and `update_db.sql` to resolve 404 RPC errors when Edge Functions execute rate limit checks.
- **Sober Alert Notifications (`check-alerts` & `AppContext`)**: Fixed local notification timer in `AppContext.tsx` to reliably trigger sober alerts when opening/waking the app after reaching 0.00% BAC, and updated `check-alerts` edge function to evaluate recent drink sessions even if `is_sober` state was uninitialized.
- **Push Subscriptions RLS Policies (`supabase_push_setup.sql`)**: Updated RLS policies to allow push notification tokens to be stored reliably without authentication failures.

## [0.1.26] - 2026-07-20

### Added
- **Local/Self-Hosted Deployment Mode**: Full Docker + PostgreSQL deployment with single codebase, env var toggle (`VITE_API_URL`).
- **Hono REST API Server**: Multi-user JWT + bcrypt authentication, PostgreSQL schema with `sipwise_` prefixed tables (`server/`).
- **External REST API**: Home Assistant integration with API key management, idempotency, and PostgreSQL-backed rate limiting.
- **Sober Alert Cron**: `node-cron` checker replacing `pg_cron` for local mode, with idempotency key cleanup (daily 3AM, 7-day expiry) and rate limit cleanup (hourly).
- **Docker Compose Orchestration**: PostgreSQL, API server, and Nginx reverse proxy for SPA + API requests.
- **Frontend Dual-Mode Detection**: `VITE_API_URL` present = local REST API, absent = Supabase.
- **Password Complexity Validation**: 8+ chars with uppercase, lowercase, and digit requirements via zod.
- **PostgreSQL-Backed Rate Limiting**: Persistent rate limits using `sipwise_rate_limits` table, replacing in-memory Map.
- **Graceful Shutdown**: SIGTERM/SIGINT handlers that close HTTP server, stop cron, close DB pool with 10s force timeout.
- **CSRF Protection**: Origin/Referer header validation middleware.
- **Structured Logging**: pino JSON logger across all server modules with request ID correlation (`x-request-id`).
- **Audit Trail**: `sipwise_audit_trail` table and `logAuditEvent()` for signup, login, API key operations.
- **Zod Request Validation**: Schema validation on all API routes (auth, data, push, apiKeys, api, logs).
- **Frontend Request Resilience**: 15s AbortController timeouts and retry with exponential backoff for GET requests (2 retries on 5xx/network errors).
- **Automated Database Backups**: pg_dump sidecar in Docker Compose with 30-day retention.
- **Configurable bcrypt Rounds**: `BCRYPT_ROUNDS` env var (default 12).
- **Push Endpoint URL Validation**: zod `.url()` validation on push subscription endpoints.
- **Docker Build in CI**: Docker Compose build + Trivy security scanning + health check verification.
- **Docker Security Headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-XSS-Protection.
- **Nginx Hardening**: Proxy timeouts (5s connect, 30s read/write) and security headers.
- **Container Resource Limits**: pg (512M/1cpu), API (256M/0.5cpu), frontend (128M/0.25cpu).
- **Frontend Container Healthcheck**: `wget --spider` health check for Nginx.
- **Production Readiness Audit**: Comprehensive audit report (`AUDIT/2026-07-20_local_deployment_production_readiness.md`).

### Changed
- JWT secret validation now fails loudly on startup if missing or too short (< 32 chars).
- CORS restricted to explicit `ALLOWED_ORIGINS` list (defaults to `http://localhost:8080`).
- Request body size limited to 1MB via Hono `bodyLimit` middleware and Nginx `client_max_body_size`.
- Health check endpoint now verifies database connectivity.
- PostgreSQL port no longer exposed to host in docker-compose.yml.
- Docker Compose JWT_SECRET requires explicit setting (no unsafe default).
- Frontend `api.ts` fetch requests include AbortController timeout and retry with exponential backoff.

### Fixed
- Hono TypeScript type errors resolved via shared `Env` type for context variable typing.
- ESLint config excludes `server/dist` from linting.

### Removed
- In-memory rate limiter (replaced by PostgreSQL-backed implementation).

## [0.1.25] - 2026-07-20

### Changed
- Improved physiological absorption model: replaced linear 30-min ramp with first-order exponential kinetics (k=0.15 min⁻¹). Absorption is now ~63% at 7 min, ~90% at 15 min, ~95% at 20 min — closer to real GI transit literature.

## [0.1.24] - 2026-07-20

### Added
- **Local Sober Notification Timer**: Added a local notification scheduler in `AppContext` that sets a timer when BAC is above zero and triggers a Service Worker notification (`showNotification`) and toast alert when 0.00% BAC is reached.

### Changed
- **Dependencies Updated**:
  - Updated `@supabase/supabase-js` to `2.110.7`.
  - Updated dev dependencies `eslint` to `10.7.0`, `typescript-eslint` to `8.64.0`, and `@types/node` to `26.1.1`.
  - Updated GitHub Actions workflows (`actions/setup-node` to `v7`, `actions/upload-artifact` to `v7`, `actions/github-script` to `v9`).

### Fixed
- **CI Test Supabase Fallback**: Provided fallback placeholder URL for `createClient` in `src/utils/supabase.ts` so unit tests succeed when environment variables are omitted or withheld (e.g. in PR CI runs).
- **Drink Deletion Cloud Resurrection**: Fixed issue where deleting a drink from history (or clearing history) caused `pushToCloud()` to fetch existing cloud drinks and merge them back into local state via `mergeDrinkArrays`, resurrecting deleted drinks within 500ms. Removed cloud-merge from `pushToCloud()` so active client state (including deletions) is saved directly to cloud.
- **Sober Alert Cloud State (`is_sober`) Sync**: `pushToCloud()` now calculates `is_sober: currentBAC === 0` and syncs `is_sober` state to Supabase `user_data`, allowing the `check-alerts` Edge Function to correctly detect state transitions (`wasSober: false` → `isSoberNow: true`) and send Web Push notifications when sober.
- **Cloud pull data overwrite on page refresh**: Fixed issue where refreshing the page before cloud sync completion resulted in `pullFromCloud()` doing a blind overwrite of local drinks with older cloud data. `pullFromCloud()` now merges local and cloud drink arrays via `mergeDrinkArrays` and `mergePresetArrays`, preserving all newly logged drinks across page refreshes.
- **Faster auto-push cloud sync**: Reduced auto-push debounce delay from 2000ms to 500ms for faster sync convergence.

## [0.1.23] - 2026-07-19

### Added
- Comprehensive Production Readiness Audit report (`AUDIT/2026-07-19_production_readiness_audit.md`)
- 10/10 Production Readiness Roadmap & Recommendations section in the audit report
- **Managed Versioned Migration (`supabase/migrations/`)**: Added `20260719182000_init_relational_schema.sql` for relational `drinks` table, `idempotency_keys` deduplication, and atomic stored procedures.
- **Idempotency Key Deduplication (`x-idempotency-key`)**: Added header deduplication in `/api` Edge Function for network retries.
- **Physiological GI Absorption Lag Model**: Added optional 30-minute absorption ramp option to Widmark calculations (`absorptionModel: 'physiological'`).
- **5-Second Fetch Timeout Circuit Breaker**: Configured global `AbortController` 5s timeout in Supabase client (`src/utils/supabase.ts`).
- **React UI Error Boundary**: Created `<ErrorBoundary>` fallback wrapper to catch uncaught component rendering exceptions.
- **Lazy Loaded Sub-Panels**: Implemented `React.lazy()` and `<Suspense>` code splitting for `AuthPanel`, `PushNotificationsPanel`, and `DataManagerPanel`.
- **Absorption Model Selector UI**: Added UI dropdown in `MetabolismPanel` to select between Instant Widmark and 30-minute GI Physiological Absorption Ramp.
- **Security Meta Headers (`index.html`)**: Added `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` security headers.
- **In-Database Rate Limiter (`check_rate_limit`)**: Added PostgreSQL rate limiting table (`public.rate_limits`) and RPC function enforcing 60 requests/minute per key/IP in `/api` Edge Function.
- **Patch Release Guide (`make-patch-release.md`)**: Created step-by-step release procedure guide covering both local terminal (0 GitHub Actions minutes) and automated CI/CD pipeline deployments.

### Changed
- Bumped `typescript-eslint` from `8.61.1` to `8.63.0` (#25)
- Bumped `vitest` from `4.1.9` to `4.1.10` (#24)
- Bumped `vite` from `8.0.16` to `8.1.5` (#23)
- Bumped `recharts` from `3.9.0` to `3.9.2` (#22)
- Bumped `@supabase/supabase-js` from `2.108.2` to `2.110.2` (#21)
- Bumped `supabase/setup-cli` GitHub Action from `v2` to `v3` (#20)

### Fixed
- **Secured `check-alerts` Edge Function (`S-01`)**: Implemented authorization checks (`CRON_SECRET` & `SUPABASE_SERVICE_ROLE_KEY` bearer verification) to prevent unauthorized execution.
- **Hashed API Key Storage & Lookup (`S-02`)**: Updated `api_keys` SQL schema and `api` Edge Function to store and query SHA-256 key hashes instead of raw plaintext.
- **CI/CD Quality Gate (`D-01`)**: Added `npm run lint` and `npm test -- --run` validation steps to `.github/workflows/deploy.yml` prior to build and deployment.
- **Database Performance & Foreign Key Indexing (`DB-01`)**: Added performance indexes for `push_subscriptions(user_id)`, `api_keys(user_id)`, and `api_keys(key_hash)` across SQL scripts.
- **Input Boundary Protection & Division-by-Zero Guard (`F-01`)**: Added boundary guards in `calculateWidmarkR` and `BodyMetricsForm` to prevent invalid profile values (`0` or `NaN`) from breaking BAC calculations.
- **Strict Data Validation on Restore (`Q-02`)**: Updated `validateRestoreData` in `DataManagerPanel` with `Number.isFinite()` to prevent corrupted timestamps, volumes, or ABVs during JSON file import.
- **Legal & Medical Disclaimer (`Q-01`)**: Added safety disclaimer to Dashboard clarifying that BAC figures are mathematical estimations for informational purposes only.
- **Dynamic CORS Header Handling (`S-04`)**: Replaced static `*` wildcard CORS header in `api` Edge Function with dynamic origin validation supporting `ALLOWED_ORIGINS` and `Vary: Origin`.
- **Vendor Code Splitting & Bundle Optimization (`F-02`)**: Configured `manualChunks` in `vite.config.ts` to separate `recharts` and `@supabase/supabase-js` into cached vendor chunks, reducing main bundle size to 234 kB with 0 warnings.
- **Accessibility Enhancements (`F-03`)**: Added explicit `aria-label` attributes to action buttons in History and component views.
- **Dynamic VAPID Email (`D-02`)**: Replaced hardcoded fallback email with configurable `VAPID_CONTACT_EMAIL` environment variable.
- **Cloud sync data loss between devices**: Sync now uses a multi-device merge strategy instead of blind overwrite. `pushToCloud` fetches existing cloud data, merges drinks (union by id) and presets (union by name), then upserts the combined result. After a successful merge push, local state is updated with any cloud-only drinks so they appear immediately. The auto-push handler also pulls from cloud after pushing, ensuring full convergence across devices.
- Fixed double pull-from-cloud on login (two competing effects could race and cause stale data)
- Auto-push handler now properly awaits push/pull and catches errors instead of unhandled promise rejections

## [0.1.22] - 2026-07-09

### Added
- Sessions list now shows only last 10 sessions with a "Show More" button to load additional sessions in batches of 10

## [0.1.21] - 2026-07-09

### Changed
- When BAC is 0 with recent drinks, sober status badge includes safety buffer guideline message instead of showing a separate card

## [0.1.20] - 2026-07-08

### Changed
- Simplified Data Management panel: replaced separate "Restore from Cloud", "Restore from File", and "Import Data" buttons with a single "Restore Data" button that shows a source picker (Cloud / File). All restores now merge missing entries only — no overwrites.

### Fixed
- BAC Timeline graph dropping to zero immediately after "Now" instead of projecting the gradual metabolism decay curve (`generateBACGraphData` was hardcoding future points to `0`)

## [0.1.19] - 2026-07-08

### Added
- "Backup from Cloud" button in Data Management that fetches and downloads all drinking sessions from Supabase
- "Restore from Cloud" button in Data Management that merges missing cloud entries into local state
- "Restore from File" button in Data Management that merges missing entries from a previously downloaded backup file

### Changed
- Bumped `eslint` from `10.5.0` to `10.6.0`
- Bumped `recharts` from `3.8.1` to `3.9.0`
- Bumped `@types/node` from `26.0.0` to `26.0.1`
- Bumped `globals` from `17.6.0` to `17.7.0`
- Bumped `@vitejs/plugin-react` from `6.0.2` to `6.0.3`

## [0.1.18] - 2026-07-08

### Fixed
- **Data loss when switching devices**: Fixed a race condition and stale closure in the initial cloud sync flow where restoring a session or logging in on a second device would prematurely trigger `pushToCloud()` with empty/stale local state, overwriting the cloud database and destroying the active session. This was resolved by using refs to keep stable references to `profile`, `drinks`, and `presets`, removing the destructive `.finally(() => pushToCloud())` chain, and skipping redundant auto-pushes right after cloud pulls.

## [0.1.17] - 2026-07-08

### Added
- Quick Add button on Dashboard that re-logs the most recent drink from the current session

### Changed
- Memoized `AppContext` value to prevent cascading re-renders of all consumers
- Memoized expensive derived data (sessions, stats, BAC calculations) in `Dashboard` and `History`
- Wrapped `BACGraph` in `React.memo` and memoized graph data generation
- Wrapped pure leaf components (`NavBar`, `ConfirmModal`) in `React.memo`
- Wrapped all context action functions in `useCallback` for stable references
- Optimized `generateBACGraphData` — sort once, reuse pre-computed values across loop iterations
- Reduced redundant sorting in `calculateBAC` when input is already sorted
- Removed unnecessary `React` imports across all components (React 19 JSX transform)
- Converted `storageWarning` from state to derived `useMemo`

### Fixed
- Fixed React 19 lint violations: `setState` in effects, `Date.now()` during render, ref updates during render
- Fixed `any` type annotations across the codebase
- Fixed unused variable in `supabase/functions/`
- Fixed `Nightly Build` CI concurrency grouping syntax

## [0.1.16] - 2026-06-27

### Changed

- Dashboard sync button and Profile Sync Now now push local changes before pulling (bidirectional sync)

## [0.1.15] - 2026-06-27

### Added

- 🛈 tooltip on dashboard showing predicted BAC and sober time after 1 more drink (hover/touch)
- Sync icon (⟳) on dashboard to trigger cloud sync without navigating to Profile

## [0.1.14] - 2026-06-27

### Added

- 🛈 tooltip on dashboard showing predicted BAC after 1 more drink (hover/touch)

### Fixed

- SW update detection: added periodic checks (every hour) and visibility change listener so the reload prompt appears reliably when a new version is deployed

## [0.1.13] - 2026-06-27

### Added

- 🛈 tooltip on dashboard showing predicted BAC after 1 more drink (hover/touch)

## [0.1.12] - 2026-06-26

### Fixed

- **Auto-sync on login overwrites cloud data on new device**: When logging into a fresh device, the auto-push effect fired on `user` change and pushed empty/default data to the cloud within 2 seconds, destroying existing cloud data from the PC before the user could press "Sync Now". Fixed by pulling from cloud on `SIGNED_IN` event first, and decoupling the auto-push effect from login events — it now only fires when local data actually changes.

## [0.1.11] - 2026-06-26

### Fixed

- **Sync not working between devices**: `pullFromCloud` was silently swallowing all errors (never threw, never set `pushError`), so the "Sync Now" button always showed a success toast even when the Supabase query failed. Also, "Sync Now" was pull-only — it now pushes local changes before pulling cloud data (bidirectional sync).
- Synced `package.json` version to match `VERSION.txt` (0.1.10) so the version displayed at the bottom of the Profile page is correct.

## [0.1.10] - 2026-06-25

### Fixed
- Fixed auto-pull on page load overwriting local state with stale cloud data, causing newly added drinks to be lost on refresh. Removed the initial `pullFromCloud()` call on mount; local state now takes precedence and is pushed to cloud via the existing debounced sync. Manual "Sync Now" button in AuthPanel still available for explicit pull.

## [0.1.9] - 2026-06-20

### Fixed
- Restored the missing `.card` class style in [index.css](file:///home/michael/sipwise/src/index.css) to fix the layout rendering of all cards.
- Fixed layout overflowing and text wrapping on the safety buffer box on the [Dashboard.tsx](file:///home/michael/sipwise/src/components/Dashboard.tsx) using clean CSS definitions.

## [0.1.8] - 2026-06-20

### Added
- Added `vitest` unit test framework and a comprehensive test suite in [bac.test.ts](file:///home/michael/sipwise/src/utils/bac.test.ts) covering core BAC calculations and session grouping.
- Added `test` npm run script to [package.json](file:///home/michael/sipwise/package.json).
- Added an automatic `localStorage` migration helper in [AppContext.tsx](file:///home/michael/sipwise/src/context/AppContext.tsx) to migrate legacy `alcoclone_` prefix data keys to the new `sipwise_` prefix keys.
- Added a calorie tracking feature to all drink types, allowing users to enter custom calories (in kcal) or rely on a new estimation utility function `estimateCalories()` in [bac.ts](file:///home/michael/sipwise/src/utils/bac.ts).
- Added all-time calorie stats, weekly averages, and session totals in [History.tsx](file:///home/michael/sipwise/src/components/History.tsx) and active session calorie estimates in [Dashboard.tsx](file:///home/michael/sipwise/src/components/Dashboard.tsx).
- Added new test cases verifying the calorie estimation heuristic in [bac.test.ts](file:///home/michael/sipwise/src/utils/bac.test.ts).

### Changed
- Split the monolithic [ProfileSettings.tsx](file:///home/michael/sipwise/src/components/ProfileSettings.tsx) component into 6 modular subcomponents:
  - [BodyMetricsForm.tsx](file:///home/michael/sipwise/src/components/profile/BodyMetricsForm.tsx)
  - [MetabolismPanel.tsx](file:///home/michael/sipwise/src/components/profile/MetabolismPanel.tsx)
  - [PresetManager.tsx](file:///home/michael/sipwise/src/components/profile/PresetManager.tsx)
  - [AuthPanel.tsx](file:///home/michael/sipwise/src/components/profile/AuthPanel.tsx)
  - [PushNotificationsPanel.tsx](file:///home/michael/sipwise/src/components/profile/PushNotificationsPanel.tsx)
  - [DataManagerPanel.tsx](file:///home/michael/sipwise/src/components/profile/DataManagerPanel.tsx)
- Replaced all 8 usages of synchronous `alert()` in the settings panel with the asynchronous, styled context-based toast notifications (`showToast`).
- Configured Recharts `CustomTooltip` in [BACGraph.tsx](file:///home/michael/sipwise/src/components/BACGraph.tsx) to use type-safe `Partial<TooltipContentProps<number, string>>`.
- Changed local Node engine version configuration in [package.json](file:///home/michael/sipwise/package.json) to `>=22.0.0` as Node 18/20 are EOL.
- Aligned Deno deploy edge functions (`check-alerts` and `api`) to use Supabase JS SDK version `2.108.1`.
- Linked the `check-alerts` edge function directly to the shared BAC utility in `_shared/bac.ts`.
- Updated default drink presets in [AppContext.tsx](file:///home/michael/sipwise/src/context/AppContext.tsx) to include pre-computed calorie attributes.
- Extended the edge function API [index.ts](file:///home/michael/sipwise/supabase/functions/api/index.ts) to parse and return calorie specifications.
- Redesigned the presets grid in [DrinkLogger.tsx](file:///home/michael/sipwise/src/components/DrinkLogger.tsx) with a split button layout, allowing users to customize preset drink details (name, volume, ABV, calories) before logging them.

### Fixed
- Fixed missing `ETHANOL_DENSITY` reference error and magic numbers in [_shared/bac.ts](file:///home/michael/sipwise/supabase/functions/_shared/bac.ts).
- Resolved a Vite build CSS minification error caused by a missing `.error-box` selector in [index.css](file:///home/michael/sipwise/src/index.css).
- Fixed silent sync failure in `pushToCloud` by updating [AuthPanel.tsx](file:///home/michael/sipwise/src/components/profile/AuthPanel.tsx) to render the sync error state.

### Removed
- Removed duplicate local `bac.ts` from `supabase/functions/check-alerts/` to consolidate calculations.

## [0.1.7] - 2026-06-15

### Changed
- Bumped `@supabase/supabase-js` from `^2.107.0` to `^2.108.1`.
- Bumped `@types/node` from `^25.9.2` to `^25.9.3`.
- Bumped `eslint` from `^10.3.0` to `^10.5.0`.
- Bumped `eslint-plugin-react-refresh` from `^0.5.2` to `^0.5.3`.
- Bumped `typescript-eslint` from `^8.59.2` to `^8.61.0`.
- Bumped `supabase/setup-cli` GitHub Action from `v1` to `v2`.

## [0.1.6] - 2026-06-14

### Added
- Added detailed debugging logs to the `check-alerts` Edge Function to trace active user evaluation and push subscription lookup logic.

### Fixed
- Added prominent warnings to `update_db.sql` and `supabase_push_setup.sql` to ensure the user replaces the `YOUR_PROJECT_REF` and `YOUR_ANON_KEY` placeholders in the pg_cron schedule, preventing silent failures.
- Fixed a silent failure where the `check-alerts` Edge Function would skip evaluation if the user's `push_subscriptions` row had a NULL `user_id`.
- Improved error handling in `ProfileSettings.tsx` to display the exact push notification error when enabling notifications, instead of a generic failure message.

## [0.1.5] - 2026-06-13

### Added
- Automated Sober Alerts: Added a Supabase `check-alerts` Edge Function that automatically calculates BAC and sends a push notification to users when their BAC reaches 0.00%.
- Configured GitHub Actions to automatically deploy the new `check-alerts` Edge Function on push to main.

## [0.1.4] - 2026-06-13

### Changed
- Swapped the order of "+ Add Drink" and "⚡ Quick Drink" buttons on the Dashboard.

### Fixed
- Fixed an issue where the BAC Timeline graph on the dashboard would display data for all previous drinking sessions instead of just the current session.
- Fixed a bug where BAC graph curves could stretch indefinitely if the user had been sober for a long period of time.

## [0.1.3] - 2026-06-12

### Added
- Quick Drink feature on the Dashboard, allowing you to quickly add a favorite drink. You can set your favorite drink from the Drink Presets in Profile Settings.

## [0.1.2] - 2026-06-09

### Added
- External API support via a Supabase Edge Function (`api`) for Home Assistant integrations.
- API Key management setup via a new SQL migration script (`supabase_api_keys_setup.sql`) and `api_keys` table.
- Added support to retrieve the full list of drinks (`GET` request) and add new drinks (`POST` request) via the new API.

## [0.1.1] - 2026-06-07

### Added
- Dependabot configuration added to monitor the `dev` branch for npm and GitHub Action dependency updates.
- PWA reload prompt UI that notifies users when a new version of the app is available.
- Service worker `skipWaiting` configuration to gracefully activate new updates.

### Changed
- Configured Vite PWA to use manual prompt update mode (`registerType: 'prompt'`) instead of auto update.
- Updated project requirements and Node `engines` configuration to target at least Node.js v24.

## [0.1.0] - 2026-06-07

### Added
- Number of drinks consumed added to the session summary in the History tab.
- Version number (0.1.0) added to the bottom of the ProfileSettings page.
- AI disclaimer added to the top of README.md.
- Workflow and changelog guidelines added to GEMINI.md.
