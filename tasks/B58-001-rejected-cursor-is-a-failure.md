# B58-001 — a cursor the fetcher rejects is a failure, not the last page

**Status: implemented and tested locally; committed and pushed at the owner's request,
2026-10-15.** Found by [B57-001](B57-001-jobicy-feed-paging.md) the
same day; the owner asked to start it ("yes, start B58").

## Problem

`pinnedJsonFetch` (`src/server/import/fetcher.ts`) reads the response's `nextCursor`. A
non-empty string that fails `CURSOR_PATTERN` (`/^[A-Za-z0-9._~=-]{1,512}$/u`), or a value
of another type, becomes `null`: the same value as "last page".

- **Himalayas:** `runHimalayasImport` computes `complete = failure === null && cursor ===
  null`. A 25-page run would be imported as a complete pass: `runSnapshotImport` adds a
  full-pass miss to every stored record not in those 25 pages
  (`STALE_AFTER_FULL_PASS_MISSES = 2`), and the checkpoint resets to page 1. Two such runs
  24 hours apart would mark most of the 2,981 local himalayas postings `stale`, for a feed
  of about 100,000 jobs that no 25-page run covers.
- **Jobicy feed (B57-001):** the walk ends early and reports `complete`; only coverage is
  lost, since a Jobicy run is always partial.
- **Jobicy status endpoint:** no cursor; not affected.

Latent: today's cursors match the pattern (the Jobicy cursor is 119 characters of
Base64URL). It triggers only if a source changes its cursor format.

## Plan

1. `pinnedJsonFetch`: `nextCursor` absent, `null` or `""` → `null` (the last page, as
   today); a string matching the pattern → that cursor; anything else (a string that
   fails the pattern, a number, an object) → `server_error`. A failure is what every
   caller already handles safely: himalayas does not touch records and keeps its window
   and checkpoint; a Jobicy first page retries, a later one ends the walk as
   `interrupted`.
2. Tests that fail before the fix: the fetcher classifies a rejected cursor as
   `server_error` for both feeds; a himalayas run whose second page carries a rejected
   cursor, through the real `fetchHimalayasPage` with a stubbed `fetch`, records no
   complete pass and no miss, keeps its checkpoint and does not use its window; the
   Jobicy walk ends `interrupted` and keeps page 1.

**Risk: normal** (how an import decides completeness; no new request, no rights change).
Effort `high`. **Data:** none. **Spend:** none.

**What a real format change then looks like:** every run fails at the page with the new
cursor, the worker's failure streak grows and the source pauses with a `paused` log line
(`npm run worker -- --resume himalayas`), instead of staling the catalog in silence.

## Result (2026-10-15)

- `pinnedJsonFetch`: `nextCursor` absent, `null` or `""` is the last page; a string
  matching the pattern is the cursor; any other value (a string that fails the pattern,
  one over 512 characters, a number, an object, a boolean) answers `server_error`. The
  status endpoint sends no cursor and is unaffected.
- Tests written first, failing before the fix: the fetcher classes every rejected shape
  as `server_error` and every last-page shape as `null`; a himalayas run through the
  real `fetchHimalayasPage` whose second page names `a/b+c` was `applied` (a complete
  pass) before and is now `retry_scheduled`, with no miss, the checkpoint and the window
  kept; the Jobicy walk ended `complete` before and now ends `interrupted`, keeping
  page 1.

### Checks

`npm run check` (unit 361/361, guardrails, lint, typecheck) and `npm run test:coverage`
(unit and DB 483/483; 84.41% lines, 87.70% branches, 93.10% functions), exit 0. Not run:
`build`, `test:e2e` (no page changed). No live call; no spend; coding-host spend
unknown.

### Changed files

`src/server/import/fetcher.ts`; `tests/unit/live-adapter.test.ts`,
`tests/unit/jobicy.test.ts`; this file, `tasks/current.json`, `docs/OPEN_GAPS.md` (B58),
`IMPLEMENTATION_STATUS.md`.

**Rollback:** `git revert`.
