# B67-001 — an extraction sends only the text stored now

**Status: accepted by the owner, 2026-11-03.** Implemented and tested locally 2026-11-03;
independently reviewed (no high finding); committed on `fix/b67-stale-extraction-text`,
merged into main with B66 and pushed at the owner's word (59d1a77). That push's CI run failed
on the branch-coverage gate alone; repair cycle 1 added tests (below). Started from [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md)
B67, found by the third review of [B66-001](B66-001-tombstone-derived-rows.md) (whose repair
limit was reached); the owner accepted B66 with this as the next task.

## Problem

An extraction pass works from postings read at its start, and the service sends the
caller's copy. Since B66 it reads the stored row's retention state before any money moves,
but not its text. So if, during one long pass, retention clears a posting and an import
revives it with new text, the pass sends the old text, pays for it under the `cleared-1`
key and stores its record on the live posting; the next pass pays again for the new text.
The same holds without a clearing: a posting whose text an import changed after the pass
read it is paid for with the old text (one wasted call, a record for text no longer
stored). It needs two processes at once (a CLI extraction or a second worker beside the
worker).

The third review also named two untested guarantees: the pass must look up a refused call
under the key that call used (else a held call of a relisted posting reads as blocked and
the pass goes on while money is held), and `storeScore`'s shared lock.

## Acceptance (fixed before the code)

1. Before any money moves, the service compares the text the caller read with the text
   stored now (title, company, description, by the extraction input hash); if they differ,
   or the posting is no longer stored, it returns `stale`: nothing is sent, reserved or
   paid, and nothing is stored. The pass counts it apart and goes on; its next run reads
   the new text.
2. The B66 scenario: a posting extracted, cleared and relisted with new text while a pass
   holds the old copy is not paid for with the old text; the new text is extracted once,
   under the relisting key.
3. A pass over a relisted posting (count 1) whose call ends uncertain stops as `held` and
   names the operation under the relisting key (not the old settled one).
4. A relevance score that waits on a posting while a retention batch clears it is not
   written (the shared lock in `storeScore`, tested on its own).
5. Unchanged: a stored record still answers a repeat without a call; a posting read
   unchanged is extracted as before.

**Risk: high (paid AI calls).** An independent `reviewer` pass and owner acceptance.
**Data:** synthetic fixtures and labelled mock transports only.

**Not included:** the window between this read and the call (closing it would hold a lock
across a network call); a paid result that could not be stored still counted as
`extracted`; relevance keys after a relisting (scoring is closed).

## Plan

1. Failing tests for acceptance 1–4.
2. `retentionStateOf` also returns the stored title, company and description; the service
   compares input hashes and returns `stale`; the pass counts `stale_skipped`.

**Rollback:** revert the change; nothing is migrated or written outside tests.

## Result (2026-11-03)

- `retentionStateOf` (`src/server/storage/snapshots.ts`) reads the stored title, company and
  description in the same row as the tombstone flag and the clearing count.
- `extractPostingFields` returns `stale` when that text's input hash differs from the
  caller's copy or the posting is not stored, after the record lookup and before the key,
  the prompt or any reservation. The pass counts it as `stale_skipped` and goes on; it adds
  no call, no cost and no result entry.
- The B28 test fed the service a rewritten description that was never stored; its setup now
  stores it first, as the import's upsert does. Its assertions are unchanged.

## Independent review (2026-11-03, `reviewer`, fresh context)

No high finding. The reviewer ran `test:db` (134/134) and, in a scratch copy, a round trip of
stored text with CRLF, U+2028/2029, emoji, combining marks, a BOM, quotes, backslashes,
control characters, an empty string and 200,000 characters: the stored row's hash always
equalled the pass's, so no posting read unchanged is refused.
- **M (acted on, test only):** the pass's handling of `stale` had no test. Added: a pass
  whose first call rewrites a second posting's text counts it `stale_skipped`, sends it
  nothing and still extracts the third (fails if the pass stops at the stale posting).
- **L, recorded — a deviation from acceptance 1's wording:** a stale copy whose *old* text
  still has a stored record is answered `already_extracted` from that record instead of
  `stale` (the record lookup comes first). No money moves and nothing is stored; the next
  pass reads the new text. Checking first would add a query for every answered posting.
- **L, recorded:** no service-level test of a text change without a clearing; the pass
  test above covers that path.

The new tests fail without what they guard (mutations by the reviewer and here); the held
relisting and `storeScore` lock tests guard B66's mechanisms and passed before this change.

## Checks (final code)

| Command | Result |
|---|---|
| `npm run check` | exit 0 (unit 425/425, lint, typecheck) |
| `npm run test:coverage` | exit 0, 560/560, 0 skipped; 85.98 / 89.04 / 94.04 (ratchet 85/89/94) |
| `npm run build` | exit 0 (after one Next.js advisory stop, E.6) |
| `npm run test:e2e` | exit 0, 126/126 (before the test-only addition) |

**Mock/live:** labelled mock transports only; no provider call. **Spend:** none visible;
coding-host spend unknown.

## CI repair after the push (2026-11-03, repair cycle 1)

The first CI run of the pushed main (59d1a77, run 41629010802) passed all 560 tests and
failed only the coverage gate: 88.99 % of branches against the 89 % ratchet. Local runs of
the same code gave 89.04 % and 89.01 %: the branch counts of `pipeline.ts` (47 or 45) and
`profile-service.ts` (lines 94–95 run or not) varied between runs, and the gate sat inside
that noise.

Hypothesis, recorded first: tests for older uncovered branches that do not vary lift coverage
enough to stay above 89 % run after run, with the ratchet unchanged. Two of the four
candidates named there had no honest test: `ExtractionStoreError` is never thrown (dead code),
and the pass's last rethrow is reached by no refusal the ledger makes without an operation.
Tests only, no product code:

- Saving and hiding refuse a malformed posting id before any query, and a database failure (a
  closed pool) surfaces as itself, not as a missing posting (`profiles.test.ts`,
  `feedback.test.ts`). Each fails when its guard is removed (both mutations run).
- The terms fingerprint decodes `&#8212;` and `&#x2014;` like `&mdash;` and leaves zero, out of
  range, past a safe integer and unknown entities as written (`terms-fingerprint.test.ts`).

Result: three coverage runs gave the same 563/563 and 2853 / 3197 branches (89.24 %), 7
branches above the gate; `npm run check` exit 0 (unit 426/426, lint, typecheck).

Recorded, not fixed: `&#X2014;` (capital X) is not decoded, since the entity pattern matches
only a lowercase `x` and the `#X` branch is unreachable. The change detector errs safe: a page
that switched to that spelling would read as changed and be re-read by a human.

## Limitations

- The window between this read and the call stays (not included).
- A paid result that could not be stored is still counted as `extracted`.
- The acceptance-1 deviation above.

## Approvals and limits

Local code and tests only. No provider call, no deploy, no push, no write to the owner's
data. Coding-host spend: unknown.
