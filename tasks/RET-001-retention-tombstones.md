# RET-001 — retention: the journal TTL and tombstones for closed records (owner decision No. 4, item 4)

**Result:** retention stopped deleting source records and gained a journal
horizon. An expired/closed source record becomes a **tombstone**: id, source,
dates and content_hash remain; the text and the derived vectors are deleted;
lifecycle → `tombstoned`; a re-listing **revives** the record with its original
provenance. The impressions/clicks journal lives **12 months** and is purged by a
worker pass. Migration 0018 has been applied locally.

**Out of scope:** the retention of other tables (letters, profiles, the score
cache — they have their own rules); changing the source policy window (720 h stays).

## What changed

- `migrations/0018_job_tombstones.sql` — `job_snapshots.tombstoned_at` + a comment;
  the `tombstoned` value for lifecycle was already allowed by the contract
  (`source-contracts.ts`), so tombstoning does not break the validator:
  `title`/`company_name`/`description_text` are ordinary strings, `source_url` is
  preserved (it is required as an http-URL and remains provenance).
- `src/domain/snapshot-projection.ts` — `tombstoneSnapshot()` (the identifiers and
  dates live, the prose goes) and `StoredSnapshot.tombstonedAt`.
- `src/server/storage/snapshots.ts` — `deleteExpired` was replaced by
  **`tombstoneExpired`**: UPDATE instead of DELETE (the jsonb is tombstoned, the
  lifecycle changes, already-tombstoned records are not touched — idempotent),
  then the vectors of the just-tombstoned records are deleted (the FK cascade no
  longer fires, and the vector is derived from the deleted text).
  `loadStore`/`saveStore` read and write `tombstoned_at`.
- `src/server/import/himalayas-adapter.ts` — the `tombstoneExpired` interface, the
  `tombstoned` report, the memory double with the same semantics;
  `jobicy-adapter.ts` — the same report.
- `src/server/import/pipeline.ts` — a new branch **`revived`**: a record marked as
  a tombstone returns its text on re-listing, with version+1 and its original
  `first_seen_at` preserved; missing tombstones do not recount misses (retention
  owns their horizon).
- `src/domain/events.ts` / `src/server/events-service.ts` —
  `EVENT_RETENTION_MONTHS = 12` (the recorded reason: the ranking horizon +
  minimization) and `purgeExpiredEvents`; `scripts/worker.ts` — an
  `events_purged` pass every tick (disabled by `--no-retention`), the report
  field `tombstoned`.

## Checks (2026-10-02)

- `npm run check` → exit 0 (**241/241** unit, biome 210, tsc clean);
- `npm run test:db` → exit 0 (**57/57**): a tombstone with a check of the empty
  text and the preserved hash/first_seen, the idempotency of the second pass,
  revival (`revived`, version+1, the original `first_seen_at`), the journal TTL
  (the old deleted, the fresh kept), the vector goes away with the text;
- `npm run build` → exit 0; `npm run test:e2e` → **96 passed**;
- `npm run db:migrate` on the working DB → `{"migrationsApplied":1}`.

**A test caught a real bug before the commit:** `setUTCFullYear(year − 12)`
subtracted 12 **years** instead of months — fixed to `setUTCMonth(month − 12)`.

## Limitations, stated honestly

- title / company_name / description_text / excerpt are tombstoned; the
  structural subfields (e.g. `schedule.original_text` in the hiring conditions)
  are not cleaned — these are short technical notes, not job text; if the owner
  wants it stricter, that is a separate refinement of the decision.
- The `dedupKey` of a tombstone is degenerate (title/company empty) — this does
  not affect the display (inactive records are excluded before grouping), and
  dedup is served by id + content_hash, which are preserved.
- The `closure_checks` records of a tombstone remain (the availability history);
  the closure pass no longer touches them (`lifecycle='active'` is the filter).

**Rollback:** `git revert` of the commit; the `tombstoned_at` column remains
(additive, ignored by the old code); already-tombstoned records are not restored
by the rollback — the text returns only via a re-listing by the source.

**Costs:** coding-host — `unknown`.
