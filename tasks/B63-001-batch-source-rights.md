# B63-001 — the batch relevance path asks the per-source provider right

**Status: accepted by the owner, 2026-11-03.** Implemented and tested locally 2026-11-03;
independently reviewed (no high or medium finding); repair cycle 1 of 2 used on the
coverage gate (tests only). Not committed. Started from
[docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B63, found 2026-11-02 by the S1-006 review (L2).

## Problem

`submitRelevanceBatch` (`src/server/ai/batch-queue-service.ts`) builds one prompt per
eligible posting from its title, company and excerpt and hands them to `submitBatch`
without asking `maySendTextToProvider`. Every other path that sends posting text out asks
it first: the single-call relevance route, its chunked mode (per source, then again per
chunk, B50) and letter generation. The path cannot run today (`isBatchEnabled()` is false
by construction since A3/AI-006), but the day it is switched back on, postings from a
source without `send_to_ai_provider` — Remote First Jobs, whose grant is `unknown` — would
leave the machine.

## Acceptance (fixed before the code)

1. The batch path asks the same per-source right as the relevance route
   (`maySendTextToProvider`, through `partitionSourcesByProviderRights`) for every posting's
   source at the moment the request is built: before it reads any posting's text for a
   prompt and before `submitBatch` (and, once the path is brought behind the guard, before
   any reservation). A source without the right is not read at all.
2. A posting whose source may not send text is skipped and counted: the build reports how
   many postings and which sources were left out; a submitted queue entry carries the count
   (`rightsSkipped`), and the worker's `batch_submitted` log line includes it.
3. None of a skipped posting's title, company, excerpt or id appears in the batch request
   (the JSONL `buildJsonl` would upload) or in the custom_id mapping stored with the queue
   row.
4. When no posting may be sent, the build has no jobs and no mapping, so
   `submitRelevanceBatch` returns null before `submitBatch` (that last step by reading the
   code: it cannot run while the path is closed).
5. A source with no policy, and a grant past its `valid_until`, are refused, as on the
   single-call path.
6. The path stays closed: `isBatchEnabled()` is still false, and `submitRelevanceBatch`
   returns null without touching the database.
7. Unchanged: a posting whose source has the right gets the same prompt and custom id as
   before.

**Risk: high (source rights).** Failing test first, an independent `reviewer` pass, owner
acceptance.
**Data:** synthetic fixtures only (the Himalayas contract fixture and the Remote First Jobs
synthetic fixture, stored in the test database); a labelled stub pool for 6. No provider,
no transport, no money.

**Not included:**
- Re-enabling the batch path, or bringing it behind `executeGuardedOperation` (budget,
  purpose, personal-data boundary, attempts, deadline): that is A3's reviewed re-enable.
  The batch prompt also carries the candidate's target roles and country; the gateway's
  personal-data boundary is not on this path, which is one more reason it stays closed.
- `checkForStaleAnalyses` still counts eligible postings the rights leave out, so a user
  with Remote First Jobs postings stays "stale" each tick; with the batch on that is a
  rebuild with no spend. It belongs to the re-enable.
- The window between the rights question and the upload: there is one provider call, and
  the right is asked right before it (B50's rule is per call).

## Plan

1. Move the request-building step out of `submitRelevanceBatch` into an exported
   `batchJobsFor`, unchanged; write the integration test (Himalayas and Remote First Jobs
   postings in one build) and see it fail on the Remote First Jobs text in the request.
2. Ask the rights per source before reading rows, read only allowed sources, count what is
   left out; `rightsSkipped` on the entry and in the worker log.
3. `npm run check`, `npm run test:coverage`; `reviewer`; status and OPEN_GAPS rows.

**Rollback:** revert the change; nothing is migrated, and the path is closed either way.

## Result (2026-11-03)

- `batchJobsFor` (`src/server/ai/batch-queue-service.ts`) builds the batch request's jobs.
  It asks `sendableNow` — `maySendTextToProvider` per source, the helper the chunked
  relevance route asks before each call — before it reads any row, reads only the sources
  with the right, and returns the jobs, the custom_id mapping, `rightsSkipped` (postings
  left out) and `deniedSources`. The prompt and custom id of an allowed posting are built
  exactly as before.
- `submitRelevanceBatch` calls it after the cache lookup and before `submitBatch`; an empty
  build still returns null before `submitBatch`. A submitted entry carries `rightsSkipped`
  (not stored), and the worker's `batch_submitted` line logs it. `isBatchEnabled()` is
  untouched, so all of this stays unreachable.
- Tests (`tests/integration/batch-rights.test.ts`, test database, synthetic fixtures): a
  build over a Himalayas, a Remote First Jobs and a no-policy posting keeps only the first;
  counts 2 and names both refused sources; neither the Remote First Jobs posting's title,
  company, excerpt, description nor either refused id appears in `buildJsonl` of the jobs
  or in the mapping; no query names a refused source (a labelled spy over the real pool);
  the allowed job equals the old prompt and custom id. At Himalayas' `valid_until` nothing
  is built and nothing is read. A labelled throwing pool shows `submitRelevanceBatch` stays
  closed before any query. The first test failed on the unchanged build step (the Remote
  First Jobs posting was in the request) before the check was added.

## Independent review (2026-11-03, `reviewer`, fresh context)

No high or medium finding: no text of a posting whose source lacks the right (no policy,
`unknown`, past `valid_until`, an id without a colon or with an empty prefix) reaches the
request, the mapping or a prompt; rights come before every read; allowed postings are
unchanged; the path is still closed. The reviewer ran the new tests and `check:agent`, and
in a scratch copy mutated the guard: removing it, reading before asking, asking at the wall
clock instead of `now`, and keeping refused ids in the mapping each fail the tests.
- **L1 (acted on, test only):** counting sources instead of postings passed every test
  (one posting per refused source). A second Remote First Jobs posting now makes it 3
  postings from 2 sources in both rights tests.
- **L2 (acted on, test only):** the lapse moment was a copy of Himalayas' `valid_until`;
  it is now read from the policy, so a renewal does not turn the test red.
- **L3, recorded:** when every posting is refused, `submitRelevanceBatch` returns null and
  the worker logs nothing, so that count is never seen. Acceptance 2 asks for the count on
  a submitted entry only; making the all-refused case visible belongs to A3's re-enable.
- **Not covered, named by the reviewer (acted on, test only):** a posting with no excerpt
  is described by its text, a profile without a country says «не указана», and an allowed
  id with no stored row is left out without counting as a refusal.

Noted while reading, not changed (pre-existing, unreachable while closed):
`submitRelevanceBatch` and `checkForStaleAnalyses` read the profile through the pool they
are given but match through `matchedForUser`'s global pool; in the worker both are the
same database.

## Repair cycle 1 (coverage gate)

The first `npm run test:coverage` passed 566/566 tests and failed the functions ratchet:
749/799 (93.74 %) against 94 %. Hypothesis, recorded first: the new test loads
`batch-queue-service.ts` for the first time, and `--test-coverage-include-all` counts an
unloaded file's lines but none of its functions or branches (such a file shows
`0.00 | 100.00 | 100.00`), so the file's 5 uncovered functions — 3 behind the closed gate —
entered the count. Tests only, no product code, ratchet unchanged:
- the closed `processPendingBatches` returns zeros before any query (with the B63 test of
  `submitRelevanceBatch`);
- `tests/unit/relevance-parsing.test.ts`: `parseRelevanceResponse`, `parseBatchResponse` and
  `buildBatchPrompt`, which had no test (range, rounding, clipping, malformed answers,
  the skills line).

Result: functions 94.25 %, two identical runs. Lines reached 86.94 %, so the lines ratchet
is raised from 85 to 86 in `package.json`: 0.94 points (about 150 of some 16,200 lines) above
the gate, against the line noise B67 measured (CI 85.98 % vs local 85.97 %, the two
`profile-service.ts` lines) and the 86.04 % CI measured at c036137 before these tests.
Branches 89 and functions 94 are unchanged: the branch margin is 0.21 points (about 7
branches) against B67's 0.05-point noise, too thin to raise.

## Checks (final code)

| Command | Result |
|---|---|
| new test file alone, before the check was added | 2 of 3 failed: the Remote First Jobs posting was in the request |
| `npm run check` | exit 0 (unit 431/431, guardrails, tokens, icons, lint, typecheck) |
| `npm run test:coverage` (ratchet 85/89/94), before the repair | exit 1: 566/566 pass; functions 93.74 % < 94 % |
| `npm run test:coverage` (ratchet 85/89/94), after the repair | exit 0, 572/572, 0 skipped; 86.94 / 89.21 / 94.25 |
| `npm run test:coverage` (ratchet 86/89/94) | exit 0, 572/572, 0 skipped; 86.94 / 89.21 / 94.25 |

**Not run:** `npm run build` and `npm run test:e2e` (server-only change behind a closed
gate; the profile route's dynamic import is covered by typecheck).
**Mock/live:** no provider call; a labelled spy over the test pool and a labelled throwing
pool; synthetic fixtures. **Spend:** none visible; coding-host spend unknown.
