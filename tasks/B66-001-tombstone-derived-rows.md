# B66-001 — clearing a posting deletes the rows derived from its text

**Status: accepted by the owner, 2026-11-03, with the residual race as the next task (B67).**
Implemented and tested locally 2026-11-03; reviewed three times; both repair cycles used
(REPAIR_LIMIT); committed on `fix/b66-tombstone-derived-rows`; not merged, not pushed. Started from [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B66, found by
[B62-001](B62-001-withdrawn-source-text.md).

## Problem

Retention clears a posting into a tombstone (RET-001; every verbatim field since B62-001)
and deletes its embeddings, but two kinds of row derived from its text stay:

- `job_llm_fields`: the AI extraction of the posting (accepted rows carry salary and
  requirement fields quoted from the text; rejected rows the raw model output).
- `job_relevance_scores`: a user's relevance score with the model's explanation of the
  posting.

Migration 0019 says retention that removes a posting's text must remove its derivatives,
but only a deletion of the posting cascades, and RET-001 replaced deletion with tombstones.
The money record is not in these rows: `ai_operations` holds every paid call's status,
attempts and amounts, and no posting text.

Local database (read only, 2026-11-03): 5 extraction rows (all accepted, himalayas,
265 μ$ in all) and 9 relevance scores; all 5 and 7 of the 9 belong to postings already past
their retention window, so the next worker run clears those postings.

## Owner decision (2026-11-03)

Delete both kinds of row when the posting is cleared.

## Acceptance (fixed before the code)

1. Clearing a posting, by an import's retention or the worker's pass, deletes its
   `job_llm_fields` and `job_relevance_scores` rows in the same transaction as its
   embeddings. Rows of postings that stay live are untouched; `ai_operations` and
   `ai_budgets` are untouched.
2. No derived row is written onto a cleared posting: storing an extraction or a relevance
   score for a tombstoned posting writes nothing, also when the posting is cleared while
   the write waits for it (shared lock on the posting row, re-read after the wait).
3. A stored extraction of a live posting still answers a repeat without a second paid call;
   a posting its source lists again after clearing can be extracted again (within the
   existing caps), and the earlier call stays in `ai_operations`.
4. A second retention pass deletes nothing.

**Risk: high (deletion, next to money).** An independent `reviewer` pass and owner
acceptance before it is relied on. **Data:** synthetic fixtures in the test database; the
owner's local database is read only.

**Not included:** `ai_operations`, budgets and holds; the extraction caps; a backup of the
deleted rows (they hold text derived from the posting, which is what retention removes);
the migration 0019 table comment ("Deleted with the snapshot"), left as written.

## Plan

1. A failing DB test: a cleared posting keeps neither row; a live one keeps both; a store
   onto a tombstone writes nothing.
2. `tombstoneExpiredSnapshots` deletes both kinds of row for the ids it clears.
3. `storeExtraction` and `storeScore` insert through a `SELECT … FOR SHARE` of the live
   posting.

**Rollback:** revert the change. Rows already deleted are not restored; their paid calls
stay in `ai_operations`.

## Owner decision after the first review (2026-11-03)

A cleared posting relisted with the same text met its own settled call under the same key
and could never be extracted again (acceptance 3 not met). Decision: allow one new paid
call per relisting.

## Result (2026-11-03)

- **Deletion:** `tombstoneExpiredSnapshots` deletes the cleared ids' `job_llm_fields` and
  `job_relevance_scores` rows with their embeddings, in the same transaction.
- **No write onto a tombstone:** `storeExtraction` and `storeScore` insert through
  `SELECT … FROM job_snapshots WHERE id = … AND tombstoned_at IS NULL FOR SHARE`; the shared
  lock waits for a retention batch holding the row and re-reads it.
- **Relisting (cycle 1):** migration 0026 adds `job_snapshots.cleared_count`; retention adds 1
  to it; an import's revival keeps it. `extractionKey(snapshot, clearedCount)` appends
  `:cleared-N` only when N > 0, so never-cleared postings keep their keys and records.
- **Stale rows (cycle 2):** after a missing record, the service reads the posting's
  `tombstoned_at` and `cleared_count` from one row before any money moves; a cleared
  posting returns `tombstoned` (the pass counts it as `tombstoned_skipped`), and a ledger
  refusal carries the key the call used (`ExtractionCallRefused`), which the pass looks up.
- **Owner's local database (read only):** all 5 extraction rows and 7 of 9 relevance
  scores belong to postings already past 720 h; the next worker run (which applies
  migration 0026 first) clears those postings and deletes the rows. Their 265 μ$ stay in
  `ai_operations`. No tombstone exists locally, so nothing was left behind earlier.

## Independent reviews (`reviewer`, fresh context each)

1. **First (original change):** no high. **M:** a relisted posting with the same text was
   blocked for good → owner decision above, cycle 1. **L:** rows on tombstones made before
   B66 are not swept (none locally); a result not stored is still reported as extracted;
   test gaps (second pass, budgets) → test tightened.
2. **Second (cycle 1):** no high. **M:** a pass working from rows read at its start sent a
   posting cleared mid-pass under the new key, paid for it and spent the key its relisting
   needs → cycle 2. **L:** the refusal lookup recomputed the key → cycle 2; relevance has
   the same relisting gap (latent: scoring is closed) → recorded; revival not tested →
   test added (it guards a regression; it passed before the change too).
3. **Third (cycle 2):** no high; `test:db` 131/131 run by the reviewer. **Not fixed
   (repair limit):**
   - **M (B67):** if, during one long pass, retention clears a posting and an import
     revives it with *new* text, the pass still holds the old text: the record lookup by
     the old input hash misses, the live state passes, and the old text is sent, paid
     under `cleared-1` and stored on the live posting; the next pass pays again for the new
     text. Needs two processes at once and a pass that outlasts a retention and an import.
     Suggested fix: the same single-row read returns the stored input hash and the service
     refuses (or uses the stored text) when it differs.
   - **L:** between the state read and the call, a retention commit can still let one
     cleared posting's text go out (one wasted call; the relisting key stays free);
     closing it would hold a lock across a network call.
   - **L (tests):** no test fails if the pass looks up a refusal under the count-0 key
     (it would report a held relisted call as blocked); no test covers `FOR SHARE` in
     `storeScore` (the extraction store's lock is covered).
   - **L:** a paid result that could not be stored is counted as `extracted`.

## Checks (final code)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 425/425, lint, typecheck) |
| `npm run test:coverage` | exit 0, 556/556, 0 skipped; 85.96 / 89.06 / 94.04 (ratchet 85/89/94) |
| `npm run build` | exit 0 (after one Next.js advisory stop, E.6) |
| `npm run test:e2e` | exit 0, 126/126 |

Each new test was seen failing before its change (the revival test excepted, as noted).
**Mock/live:** labelled mock transports only; no provider call. **Spend:** none visible;
coding-host spend unknown.

## Limitations

- B67 and the low findings of the third review above.
- Relevance scores: a relisted posting scored before cannot be scored again for the same
  profile version (its key has no clearing count); latent while scoring is closed.
- The migration must run before the new code: the worker and every CLI script migrate at
  start; the web app does not read the column.

## Approvals and limits

Local code and tests only. No provider call, no deploy, no push, no write to the owner's
data. Coding-host spend: unknown.
