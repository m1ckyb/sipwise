### Added

### Changed

### Fixed
- **Cloud pull data overwrite on page refresh**: Fixed issue where refreshing the page before cloud sync completion resulted in `pullFromCloud()` doing a blind overwrite of local drinks with older cloud data. `pullFromCloud()` now merges local and cloud drink arrays via `mergeDrinkArrays` and `mergePresetArrays`, preserving all newly logged drinks across page refreshes.
- **Faster auto-push cloud sync**: Reduced auto-push debounce delay from 2000ms to 500ms for faster sync convergence.

### Removed
