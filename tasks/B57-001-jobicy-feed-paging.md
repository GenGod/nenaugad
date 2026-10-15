# B57-001 — the Jobicy import pages through the whole 7-day feed

**Status: implemented and tested locally 2026-10-15.** The owner asked to start it the same day ("start the
Jobicy feed paging task"). Basis: [B56-001](B56-001-jobicy-batch-status.md), decision 4
(recommended as a separate task, accepted 2026-10-15).

## Problem

`fetchJobicyWindow` sends one request with `count=200` and no cursor. Since 2026-10-01
`count` is a per-page limit: the feed is every job published in the last 7 days (3-hour
delay), newest first, continued with `nextCursor` until it is `null` (`hasMore: false`).
Every import so far returned exactly 200, the cap (2026-09-25, 10-08, 10-15), so each run
read only the newest 200. With the worker every 6 hours that may cover the window; a
manual run once a week does not, and nothing reports what was missed.

## What the page asks (snapshot `docs/sources/terms/jobicy-feed.txt`, 2026-10-15)

- Pass the response's `nextCursor` unchanged as `cursor`, keep the filters, stop at
  `null`. A cursor lives 24 hours from the first request; an expired or altered cursor,
  or changed filters, answer 400. Cursors are opaque.
- "Start a new automated pass no more than once per hour; follow its cursor pages
  sequentially to complete that pass." Our interval stays 6 hours.
- Jobs older than 7 days drop out while you paginate; deduplicate by `id`.

## Plan

1. `fetcher.ts`: `fetchJobicyWindow({ count, cursor })`: a cursor is validated as a token
   (the himalayas pattern) or refused locally with no request; the result carries
   `nextCursor` from the shared JSON fetch.
2. `jobicy-adapter.ts`: the transport takes the cursor; one run follows pages sequentially
   up to `maxPages` (default 10, so at most 2,000 jobs and 10 requests per 6 hours).
   - A failure on the first page: as today (`retry_scheduled`, nothing saved, the window
     not consumed).
   - A failure on a later page: the pages already read are imported (a Jobicy run is
     always partial, and absence never closes anything), the run counts, and the report
     says the traversal was interrupted. Discarding them would only fetch the same pages
     again sooner.
   - The report adds `pagesFetched` and `traversal`: `complete`, `page_cap` or
     `interrupted`.
   - A repeated ID is already skipped by `runSnapshotImport`.
3. The worker and `npm run import:jobicy` pass the cursor through.
4. Tests: paging until `null`, the page cap, an interrupted traversal keeps its pages, a
   first-page failure keeps today's behaviour, the cursor reaches the URL unchanged and an
   invalid one sends nothing; the existing single-page transports keep working.

**Risk: normal.** The same endpoint, permission and 6-hour interval; up to 10 requests per
run instead of 1, which the page describes as the normal way to read the feed. Effort
`high`. **Data:** public job postings only. **Spend:** none directly; more postings reach
the extraction queue, whose cap stays 25 calls per source per import (B34).

**Not included:** the himalayas cursor handling (its pass checkpoint is a separate
design); a shorter interval.

## Result (2026-10-15)

**Implemented and tested locally;** committed and pushed at the owner's request on
2026-10-15. The next `import:jobicy` or worker run uses it.

- `fetcher.ts`: `fetchJobicyWindow({ count, cursor })`. A cursor that fails the token
  pattern is refused with no request; the page size is the same on every page; the result
  carries `nextCursor` from the shared JSON fetch (optional in the type, so the existing
  single-page stand-ins in tests still compile and read as the last page).
- `jobicy-adapter.ts`: `runJobicyImport` follows `nextCursor` sequentially up to
  `maxPages` (`DEFAULT_MAX_JOBICY_PAGES` = 10). A failed first page is `retry_scheduled`
  as before; a failed later page imports what was read, uses the window and reports
  `traversal: "interrupted"`. The report adds `pagesFetched` and `traversal`
  (`complete`, `page_cap`, `interrupted`). A job repeated across pages keeps its first
  copy (the pipeline's rule) and that copy's excerpt.
- The worker and `npm run import:jobicy` pass the cursor; the worker's log line adds
  `pagesFetched` and `traversal`.
- **Live smoke (read-only, 2 requests of 5 jobs):** page 1 answered `hasMore: true` and a
  119-character Base64URL cursor, which passes the pattern; page 2 with it returned five
  other jobs and another cursor. How many pages the whole window takes is not measured:
  the next import reports it (`page_cap` would mean the 10-page cap is too low).
- **Found on the way, out of scope:** the shared JSON fetch turns a cursor that fails the
  pattern into `null`, the same as "last page". For Jobicy that only shortens a partial
  run; for himalayas it would make a 25-page run look like a complete pass, so unseen
  postings collect misses and two such runs would mark them stale. Offered to the owner
  as a separate task (B58).

- A `maxPages` below 1 is read as 1, so a run never uses the window without reading a
  page.

### Checks

`npm run check` (unit 358/358, guardrails, lint, typecheck) and `npm run test:coverage`
(unit and DB 480/480; 84.41% lines, 87.68% branches, 93.10% functions, above the
84/87/92 ratchet), exit 0. The DB tests that import Jobicy fixtures through single-page
stand-ins pass unchanged. Not run: `build`, `test:e2e` (no page changed). Two read-only
live requests (above). No spend; coding-host spend unknown.

### Changed files

`src/server/import/fetcher.ts`, `src/server/import/jobicy-adapter.ts`,
`scripts/worker.ts`, `scripts/import-jobicy.ts`, `tests/unit/jobicy.test.ts`; this file,
`tasks/current.json`, `docs/OPEN_GAPS.md` (B57), `IMPLEMENTATION_STATUS.md`.

**Rollback:** `git revert`. Postings a paged run imported stay, like any imported posting,
until retention tombstones them.
