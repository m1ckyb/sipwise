### Added

### Changed

### Fixed
- Fixed database migrations push command in GitHub Actions deployment workflow by linking the project before executing `supabase db push`.
- Secured `supabase link` and `db push` credentials using GitHub env variables to prevent shell parsing failures with special characters.

### Removed
