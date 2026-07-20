### Added
- **Local Sober Notification Timer**: Added a local notification scheduler in `AppContext` that sets a timer when BAC is above zero and triggers a Service Worker notification (`showNotification`) and toast alert when 0.00% BAC is reached.

### Changed

### Fixed
- **CI Test Supabase Fallback**: Provided fallback placeholder URL for `createClient` in `src/utils/supabase.ts` so unit tests succeed when environment variables are omitted or withheld (e.g. in PR CI runs).
- **Drink Deletion Cloud Resurrection**: Fixed issue where deleting a drink from history (or clearing history) caused `pushToCloud()` to fetch existing cloud drinks and merge them back into local state via `mergeDrinkArrays`, resurrecting deleted drinks within 500ms. Removed cloud-merge from `pushToCloud()` so active client state (including deletions) is saved directly to cloud.
- **Sober Alert Cloud State (`is_sober`) Sync**: `pushToCloud()` now calculates `is_sober: currentBAC === 0` and syncs `is_sober` state to Supabase `user_data`, allowing the `check-alerts` Edge Function to correctly detect state transitions (`wasSober: false` → `isSoberNow: true`) and send Web Push notifications when sober.
- **Cloud pull data overwrite on page refresh**: Fixed issue where refreshing the page before cloud sync completion resulted in `pullFromCloud()` doing a blind overwrite of local drinks with older cloud data. `pullFromCloud()` now merges local and cloud drink arrays via `mergeDrinkArrays` and `mergePresetArrays`, preserving all newly logged drinks across page refreshes.
- **Faster auto-push cloud sync**: Reduced auto-push debounce delay from 2000ms to 500ms for faster sync convergence.

### Removed

