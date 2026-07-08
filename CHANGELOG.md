# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
