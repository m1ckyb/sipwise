### Added

### Changed

### Fixed
- Fixed an asynchronous React state race condition inside the `consumeFromInventory` hook that caused spurious "not enough stock" warnings to trigger when logging a drink even when the container had ample volume remaining.

### Removed
