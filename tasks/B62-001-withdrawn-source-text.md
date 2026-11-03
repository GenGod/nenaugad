# B62-001 — a source that stops publishing leaves the private lists, and retention runs without an import

**Status: implemented and tested locally 2026-11-03; independently reviewed (no critical or
high finding), the review's fixes applied in repair cycle 1 of 2. Committed on branch
`fix/b62-withdrawn-source-text` (not merged, not pushed); owner acceptance pending.** Started from [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B62, found by the
S1-006 review (M1).

## Problem

The catalog, matching, extraction and embeddings ask the source policy before they use a
posting. The private surfaces and retention do not:

1. `/saved`, its hidden list, `GET /api/v1/saved` and `GET /api/v1/hidden` show the excerpt
   and the salary of a posting whose source is disabled, unapproved, past `valid_until` or
   without `publish_excerpt`. `GET /api/v1/hidden` also returns the whole stored snapshot,
   `description_text` included — full-text republication, which is denied for himalayas and
   Remote First Jobs **even while they are enabled** (found while reading the code for this
   task; no client reads that body).
2. Retention (`tombstoneExpired`, 720 h, RET-001) runs only inside a source's own import.
   A disabled or lapsed source is never imported, and an enabled one whose import keeps
   failing (paused) is not either, so their stored text stays.
3. A tombstone is not text-free. It blanks title, company, description and excerpt, but
   keeps every verbatim quote of the posting: evidence quotes (all 4,080 stored rows have
   them), salary text (1,515 rows), region text (3,810 rows), and the authorization,
   schedule and requirement text fields. No row has been tombstoned locally yet.

All three source policies carry `valid_until = 2026-12-23`.

## Owner decisions (2026-11-03)

1. **Private lists of a source that no longer publishes:** keep the title, the company,
   the link to the original listing, the applied mark and remove, with a note that the
   source is withdrawn; drop the excerpt and the salary. Retention later blanks the title
   and company too.
2. **Retention:** the worker clears expired records for every source on each run, with
   the same window (`max_retention_hours`, else 720 h, plus the 7-day expiry rule),
   whether or not the source is enabled or importing.
3. **Tombstone text:** blanked in this task. The 5 stored LLM extraction rows (they double
   as the record of paid calls) become a separate gap (B66).

## Acceptance (fixed before the code)

1. For a posting whose source does not publish at `now` (disabled, not approved, past
   `valid_until`, or `publish_excerpt` not allowed): `/saved` shows no excerpt and no salary
   and says the source is withdrawn; `GET /api/v1/saved` and `GET /api/v1/hidden` return an
   empty excerpt. Title, company, source name, the listing link, the applied mark and
   remove stay. While the source publishes, nothing changes.
2. `GET /api/v1/hidden` returns no stored snapshot: only the id, the reason, the date and
   the excerpt allowed by (1).
3. A tombstoned posting reads «Вакансия недоступна» on `/saved` (both lists) and on the
   letter page instead of an empty title. The letter page shows title and company only,
   as before.
4. The worker runs retention for every source that has live rows, on every tick, outside
   the per-source import loop: an enabled, a disabled, a lapsed and a paused source alike.
   Each source keeps its own window. `--no-retention` switches it off, as it does the
   journal purge. An import still runs retention itself.
5. A tombstone holds no verbatim source text: title, company, description, excerpt,
   evidence quotes, requirement, salary, region, authorization and schedule text are
   empty or null. Identifiers, URLs, dates, the hash and the structured fields stay; the
   tombstone still passes the snapshot contract; the PostgreSQL and in-memory stores
   produce it with the same function.
6. Negative checks: a publishing source keeps its excerpt and salary; a row inside its
   window is untouched; a second pass tombstones nothing; the catalog and matching are
   unchanged.

**Risk: high (source rights).** An independent `reviewer` pass and owner acceptance before
the change is relied on. **Data:** synthetic fixtures in the test database; the owner's
local database is read only (counts), never printed.

**Not included:** the LLM extraction rows and other derived tables (B66); renewing the
policies before 2026-12-23 (owner action); B63; deleting rows (tombstones stay, RET-001);
the letter page's stale provider footnote.

## Plan

1. `tombstoneSnapshot` (domain) blanks every verbatim field; a unit test plants a marker
   in each and checks the contract.
2. Storage: one `tombstoneExpiredSnapshots` that both the import and the new
   `runSnapshotRetentionPass` call; rows are read under `FOR UPDATE`, mapped by
   `tombstoneSnapshot` and written in one statement.
3. Worker: the pass beside the journal purge.
4. `sourcePublishesSnapshot(snapshotId, now)` beside the policies; the saved and hidden
   list functions take `now`, report `publishes` and blank the excerpt when it is false.
5. `/saved`, both APIs and the letter page follow; tests for each acceptance item.

**Rollback:** revert the change. Tombstones made meanwhile stay blank (as under RET-001);
a posting still listed revives on its source's next import.

## Result (2026-11-03)

- **Tombstone** (`src/domain/snapshot-projection.ts` `tombstoneSnapshot`): also blanks evidence
  quotes, requirement, salary, region, authorization and schedule text. The PostgreSQL path
  (`src/server/storage/snapshots.ts` `tombstoneExpiredSnapshots`) now reads the due rows
  under `FOR NO KEY UPDATE`, maps them with that same function and writes them in one
  statement, so the two stores cannot drift; a row that fails the contract keeps only what
  the table's checks require. Embeddings of exactly those rows are deleted, as before.
- **Retention without an import:** `runSnapshotRetentionPass` runs it for every source that has
  live rows, with the policy's window (else 720 h); the worker calls it on every tick beside
  the journal purge (`--no-retention` switches both off), outside the import loop. One
  source's failure is logged (`snapshot_retention_failed`) and leaves the others to run.
  Within a tick the imports run first, so a source that is still imported refreshes what it
  sees before retention; only a disabled, lapsed, paused or failing source loses text
  earlier than before.
- **Private lists** (`sourcePublishesSnapshot` in `src/server/source-policies.ts`, the catalog's
  `policyPublishes` by the snapshot id's source): `listSavedJobsWithApplied`, `listSavedJobs`
  and `listHiddenJobs` take `now`, report `publishes` and return an empty excerpt when it is
  false. `listHiddenJobs` returns title, company and the listing link instead of the stored
  snapshot, so no caller can pass the full description on; `GET /api/v1/hidden` returns id,
  reason, date and excerpt. `/saved` drops the salary and shows «Источник отключён: описание и
  зарплата скрыты» (hidden list: «…описание скрыто»), links to the original listing, and shows
  «Вакансия недоступна» for a tombstone; the letter page and its evidence panel do the same.
- **Owner's local database (read only, 2026-11-03):** 1,138 of 2,981 himalayas and 201 of 601
  jobicy rows are already past 720 h (no import since 2026-10-15); remote_first_jobs 0 of 498.
  The next worker run (or the next import) tombstones them, minus what its imports see again
  first. 0 saved jobs locally. Nothing was written.

## Independent review (2026-11-03, `reviewer`, fresh context)

No critical or high finding; nothing lets a source's text be shown, returned or kept
against its policy. Acted on (repair cycle 1, hypothesis recorded first):
- **M (tests):** the hidden API's no-full-text guarantee rested on the route alone. Fixed in
  the service as above; a test checks the record's fields and that the stored description
  does not reach it (it failed before the fix, passes after).
- **L:** the letter evidence panel showed an empty title for a tombstone: fixed.
- **L:** `FOR UPDATE` blocked foreign-key inserts (saving, hiding, the journal) while a batch ran:
  now `FOR NO KEY UPDATE`.

Recorded, not changed:
- **L:** a CLI import running at the same moment as the worker's pass can write back a row
  the pass has just tombstoned (it loaded the row before). The import's own retention
  tombstones it again at its end, or the next tick does: self-healing, no lock added.
- **L:** a row whose dates do not parse stops retention for its whole source (logged every
  tick), as it already stopped the import; a contract-failing row without `last_seen_at` is
  never selected. No contract-valid write produces either.
- **M (tests), partly open:** the worker's three-line call and `--no-retention` have no test (a
  worker run would import from the live sources), and every policy has the same 720 h window,
  so a per-source window bug would not show. The UI states (badge, salary hidden) are not
  covered by e2e: its fixture backend has no external postings.
- **Info:** the badge says «отключён» for a lapsed or unapproved source too; kept, as the
  user-facing reading of all those cases.

## Checks (final code)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 424/424, lint, typecheck) |
| `npm run test:coverage` | exit 0, 552/552, 0 skipped; 85.90 / 89.06 / 94.01; ratchet raised 85/88/93 → 85/89/94 |
| `npm run build` | exit 0; every other run first stops on the Next.js advisory notice (OPEN_GAPS E.6) |
| `npm run test:e2e` | exit 0, 126/126 (2.0 min), visual baselines unchanged |

The new unit test of the tombstone fails on the old function (checked). Not done: a browser
look at the withdrawn state (it needs a lapsed policy or a changed clock); the service tests
cover its data. **Mock/live:** synthetic fixtures only; no provider call. **Spend:** none
visible; coding-host spend unknown.

## Limitations

- The 5 stored AI extraction rows of a tombstoned posting stay (B66, owner decision 3).
- All three policies lapse 2026-12-23: from then on the private lists hide excerpts and
  salaries, and 30 days after their last import the worker blanks the rows. Renewing the
  policies is an owner action.

## Approvals and limits

Local code and tests only. No provider call, no deploy, no push, no write to the owner's
data beyond what the worker would do on its own when run. Coding-host spend: unknown.
