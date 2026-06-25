# Agent Memory

## Project: SipWise

A BAC calculator and consumption tracker web app. React 19, TypeScript, Vite, Supabase, Recharts.

## Workflow & Conventions

This project follows the workflow defined in [GEMINI.md](./GEMINI.md). Key points:

- **Changelog**: Update `unreleased.md` (Keep a Changelog format) in the same turn as code changes.
- **README**: Update docs in the same turn as code changes.
- **Build**: Always run `npm run build` after changes.
- **Lint**: `npm run lint` (eslint).
- **Test**: `npm test` (vitest).
- **No git push** unless explicitly instructed.

## Key Files

- `VERSION.txt` — current version (semver).
- `unreleased.md` — unreleased changelog entries.
- `CHANGELOG.md` — release history.
- `package.json` — scripts: `dev`, `build`, `lint`, `test`, `preview`, `deploy`.

## Architecture

- `src/` — React app source.
- `dist/` — build output.
- `supabase/` — database setup.
- PWA support via service worker.

## Release (per GEMINI.md)

1. Read version from `VERSION.txt`
2. Update `CHANGELOG.md`, clear `unreleased.md`, update `VERSION.txt`
3. Commit + push to dev, merge to main, create GitHub release via `gh`
