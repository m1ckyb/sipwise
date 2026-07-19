### Added
- Comprehensive Production Readiness Audit report (`AUDIT/2026-07-19_production_readiness_audit.md`)

### Changed

### Fixed
- **Cloud sync data loss between devices**: Sync now uses a multi-device merge strategy instead of blind overwrite. `pushToCloud` fetches existing cloud data, merges drinks (union by id) and presets (union by name), then upserts the combined result. After a successful merge push, local state is updated with any cloud-only drinks so they appear immediately. The auto-push handler also pulls from cloud after pushing, ensuring full convergence across devices.
- Fixed double pull-from-cloud on login (two competing effects could race and cause stale data)
- Auto-push handler now properly awaits push/pull and catches errors instead of unhandled promise rejections

### Removed
