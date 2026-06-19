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
