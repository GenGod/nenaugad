# B34-001 — Extraction after an import makes at most 25 calls per source

**Status: implemented, 2026-10-07.** Tested locally; acceptance is with the owner.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B34, found by the
[B32-001](B32-001-extraction-pass-progress.md) review.

**Owner decision (2026-10-07, this session):** the import scripts cap extraction at 25
calls per source, like the worker. The alternatives, skipping extraction in the scripts
or adding a flag, were declined.

## Result and boundaries

**User result:** with live AI on, a manual `npm run import:himalayas` or
`npm run import:jobicy` extracts at most 25 postings of that source, as one worker tick
does. Today it runs the pass with no limit and would pay for every posting without a
record, bounded only by the extractor's budget.

**How.** The cap lives in `runExtractionPassAfterImport`, the one helper every caller
after an import must use (B31-001, enforced by a guardrail), so the worker and both
scripts share one number and no caller can leave it out. The worker's own constant goes.

**Not included:**
- The CLI (`npm run extract:fields`): it keeps `--limit`, and no limit when none is given;
  the owner runs it deliberately.
- What the limit counts: provider calls, as B32-001 defined.

**Context:** `src/server/ai/extraction-pass.ts` (`runExtractionPassAfterImport`),
`scripts/worker.ts` (`EXTRACTION_PER_TICK_LIMIT`), `scripts/import-himalayas.ts`,
`scripts/import-jobicy.ts`.

**Risk: normal.** It lowers the most an existing path can spend; the ledger, the pass's
rules and the worker's number (25) are unchanged.

**Data:** synthetic postings and a labelled mock transport; nothing is sent or paid.

## Acceptance (fixed before the code)

1. `runExtractionPassAfterImport` makes at most 25 provider calls per source and takes no
   limit from its caller.
2. The worker and both import scripts use it unchanged otherwise; the worker's tick still
   makes at most 25 calls.
3. Unchanged: the pass, the CLI's `--limit`, the never-throwing contract.

## Plan

1. Test first: 26 postings that need a record; the helper makes 25 calls.
2. The constant and the cap in the helper; the worker drops its own limit.
3. Checks; docs (OPEN_GAPS B34, IMPLEMENTATION_STATUS).

**Rollback:** `git revert`.

## Approvals and limits

Local code and tests. No provider, no live AI, no spend. Coding-host spend: not visible.

## Result (2026-10-07)

**What changed.** `src/server/ai/extraction-pass.ts`: `EXTRACTION_CALLS_AFTER_IMPORT = 25`;
`runExtractionPassAfterImport` takes its parameters without `limit` and always passes the
cap. `scripts/worker.ts`: its own `EXTRACTION_PER_TICK_LIMIT` is gone; it calls the helper
without a limit. `scripts/import-himalayas.ts`, `scripts/import-jobicy.ts`: comments only;
they were already calling the helper. `tests/integration/extraction-pass.test.ts`: 26
postings that need a record, and the helper makes 25 calls. It failed before the change
(no export).

**Mutation check:** the helper without the cap fails the test (26 calls). A caller that
passes `limit` no longer type-checks.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 304/304; guardrails, Biome 239 files, `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 391/391 (1 new); 83.04% lines, 86.49% branches, 91.99% functions |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.0 min) |

Not run: CI on GitHub (not pushed); a live import (live AI is off).

**Acceptance:** 1–3 met and tested locally. No independent review: the risk is normal (it
only lowers what an existing path can spend).

**Limitations.** A manual import right after a worker tick can make another 25 calls for
the same source: each run has its own cap, and the caps add up per run, not per hour.

**Next small task:** with B28–B34 closed, no known defect stands before the first live
extraction run; what remains is the owner's switch (see "Waiting for the owner").
