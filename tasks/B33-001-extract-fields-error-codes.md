# B33-001 — The extraction CLI prints a code, never an error message

**Status: implemented, 2026-10-07.** Tested locally; acceptance is with the owner.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B33, found by the independent review of
[B31-001](B31-001-stuck-extraction-operations.md) (finding 7). Owner request, this session.

## Result and boundaries

**User result:** when `npm run extract:fields` fails, it prints a code the owner can act
on and nothing else. Its header promises counts, ids and reason codes only; its failure
line printed `error.message`, and a database error's message can quote the data it
failed on, posting text included.

**Not included:**
- Other scripts. `dedup-candidates` prints titles and company names by design, so a
  message quoting one is no worse than its normal output; `embeddings-index` writes only
  vectors and hashes. Neither promises codes only.
- The CLI's success output: unchanged.

**Context:** `scripts/extract-fields.ts`, `src/server/ai/extraction-pass.ts`
(`failureCode`, used by `runExtractionPassAfterImport` since B31).

**Risk: low.** One output line of an owner-run CLI; no money, no data written.

## Acceptance (fixed before the code)

1. On a failure other than a configuration error, the CLI prints `code:
   "EXTRACT_FIELDS_FAILED"` and `detail` set to a code: a ledger code, or the error's own
   code when it is a plain code (a PostgreSQL SQLSTATE, say), otherwise
   `EXTRACTION_FAILED`. Never the message.
2. A configuration error prints as before (its message is the configuration code).
3. `failureCode` is tested on the cases above, including a database error whose message
   quotes a posting, and a code that is itself text.

## Plan

1. Test first in `tests/integration/extraction-pass.test.ts` (the module loads `pg`, so
   not in the offline unit tests).
2. Export `failureCode`; the CLI prints it as `detail`.
3. Checks; docs (OPEN_GAPS B33, IMPLEMENTATION_STATUS).

**Rollback:** `git revert`.

## Approvals and limits

Local code and tests. No provider, no live AI, no spend. Coding-host spend: not visible.

## Result (2026-10-07)

**What changed.** `src/server/ai/extraction-pass.ts` exports `failureCode` (unchanged
logic). `scripts/extract-fields.ts` prints it as `detail` for every failure except a
configuration error. `tests/integration/extraction-pass.test.ts`: one test over a ledger
code, a database error whose message and detail quote a posting (its SQLSTATE is
printed), a bare message, a code field that is itself text, and non-error values. It
failed before the change (no export).

**Mutation check:** 2 of 2 fail the test: any string code accepted as a code, and any
error's message returned.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 302/302; guardrails, Biome 237 files, `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 385/385 (1 new); 83.01% lines, 86.48% branches, 91.83% functions |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.0 min) |

Not run: CI on GitHub (not pushed); the CLI's failure path end to end, which needs live AI
and a failing database. The one changed line in the CLI is verified by reading.

**Acceptance:** 1–3 met and tested locally. No independent review: the risk is low.

**Also in this change:** the owner deleted `backups/excerpts-2026-10-06` (B30-001), so
its "waiting for the owner" line is gone from the status snapshot.

**Next small task:** B32, the last open item before live AI.
