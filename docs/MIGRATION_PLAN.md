# Migration Plan: JSONB Blob to Relational Model

## Problem Statement
Currently, SipWise stores all user data (drinks, presets, profile) as a single encrypted JSONB blob in the `sipwise_user_data` table. This approach causes several critical issues:
- **BACK-001**: No DB-level querying, aggregations, or pagination.
- **BACK-002**: Race conditions during concurrent writes (last writer wins, leading to silent data loss).
- **Performance**: High payload size (50-200KB per request for long-time users) and excessive CPU overhead for decryption.

## Goal
Migrate to the existing `public.drinks` relational table schema (already partially defined in Supabase migrations) while maintaining data encryption and ensuring zero downtime.

## Sprint 1: Foundation & Dual-Writing
**Goal:** Prepare the new schema and begin writing to both locations.
- Ensure the `public.drinks` (and `public.presets`, `public.profiles`) tables exist and match the required schema.
- Implement per-row or per-column encryption for the relational tables.
- Update the API backend to **dual-write** to both the JSONB blob and the new relational tables on every modification (adding/updating drinks or presets).
- Read operations will continue to use the JSONB blob as the source of truth.

## Sprint 2: Historical Data Backfill
**Goal:** Migrate existing JSONB data to the new tables.
- Develop a background worker / script that iterates over all users.
- For each user, decrypt the JSONB blob, parse the drinks/presets, and insert them into the relational tables.
- Ensure idempotency so the script can be rerun safely in case of failures.
- Validate data integrity by comparing row counts and checksums between the JSONB and relational models.

## Sprint 3: Switch Reads & Transition
**Goal:** Make the relational tables the primary source of truth.
- Update the API read endpoints (`GET /api/v1/data`, `GET /api/v1/bac`) to fetch data from the relational tables instead of the JSONB blob.
- Update the BAC calculation logic to query only recent drinks instead of the entire history.
- Run a final diff checker to ensure no discrepancies exist between the two stores.
- Monitor for errors and performance regressions.

## Sprint 4: Cleanup & Optimization
**Goal:** Remove legacy code and optimize the new schema.
- Stop dual-writing to the JSONB blob.
- Drop the `drinks`, `presets`, and `profile` blob columns from `sipwise_user_data` (or drop the table entirely if fully replaced).
- Add necessary indexes to the relational tables for performance (e.g., on `user_id` and `timestamp`).
- Implement pagination for the frontend history view to take advantage of the new relational structure.
