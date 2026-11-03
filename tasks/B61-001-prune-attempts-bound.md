# B61-001: one prune of expired login counters deletes at most 100 rows (B61)

**Status: accepted by the owner, 2026-11-03.** Implemented, independently reviewed and
checked locally 2026-11-02. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B61,
found 2026-11-02 by the main session while it fixed the PERF-002 coverage gate.

## Evidence (2026-11-02, local test database, PostgreSQL 17)

- `tests/integration/auth-attempts.test.ts`, "expired windows are pruned, and a locked row
  is skipped, not waited for (B53)", fails at `assert.equal(await left(), 50)` with `0`:
  in the local full `npm run test:coverage` (2 runs of 2) and sometimes alone. It passed on
  CI's fresh database.
- `EXPLAIN` of the prune on the local test database showed a Nested Loop Semi Join with the
  limited subquery on the inner side.
- Reproduced on the isolated test database (2026-11-02, a scratch script inside rolled-back
  transactions, 150 expired rows): with the default settings the plan is a Hash Semi Join
  and the prune deletes 100. With `enable_hashjoin`, `enable_mergejoin`, `enable_hashagg`,
  `enable_sort` and `enable_material` off, the plan is a Nested Loop Semi Join that
  rescans `Subquery Scan → Limit → LockRows → Seq Scan` for every outer row, and the prune
  deletes **150**. The same settings with the select-and-lock in a CTE give
  `CTE doomed` (evaluated once) under the nested loop, and the prune deletes 100.

**Root cause:** `pruneAttempts` runs `DELETE … WHERE key IN (SELECT key … LIMIT 100 FOR
UPDATE SKIP LOCKED)`. When the planner puts that subquery on the inner side of a nested
loop, it is rescanned for each outer row. A rescan's `LockRows` skips the rows this
statement has already deleted (PostgreSQL treats a row the current command deleted as
gone), so `LIMIT 100` reaches further rows each time and the statement deletes every
expired row.

**Impact:** only rows whose window has ended are deleted, so no limit is bypassed and no
live counter is lost. What breaks is B53's bound: one login does at most 100 deletions of
pruning work. With many expired counters (for example after a burst of guesses across
emails), one login could delete all of them.

## Result and boundaries

**Change.** `pruneAttempts` selects and locks the keys once, in a `MATERIALIZED` CTE, and
deletes by joining it: `WITH doomed AS MATERIALIZED (SELECT key … LIMIT 100 FOR UPDATE SKIP
LOCKED) DELETE FROM auth_attempts a USING doomed d WHERE a.key = d.key`. A CTE scan reads
the CTE's stored rows on a rescan, so the limit applies once, whatever join the planner
picks. `MATERIALIZED` says so explicitly: PostgreSQL 17 already keeps a `FOR UPDATE` CTE
apart, but that is a planner detail.

**Not changed:** which rows are pruned (window ended, `window_started_at <= now − 15
minutes`), the bound (100), skipping rows another transaction holds, the caller
(`checkLogin` in `src/server/users.ts`), the schema and the index.

**Risk: high (auth).** A test that fails first, an independent `reviewer` pass, and the
owner's acceptance before merging.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code)

1. A new integration test forces a rescanning nested loop in its own transaction
   (`SET LOCAL` the five planner settings above off), prunes 150 expired rows and finds 50
   left; a second prune leaves 0. It uses a window start no other test writes, so only its
   own rows are expired. It fails on the current query and passes on the fix.
2. The existing B53 test (pruning past a locked row, and the 100-row bound under the
   default plan) passes unchanged.
3. `npm run test:db` and `npm run test:coverage` pass in full twice in a row; `npm run
   check` exits 0; coverage thresholds are not lowered.
4. An independent review finds no blocking issue.

## Plan

1. The test (1), run against the current query: it must fail.
2. `npm run task -- repair` with the hypothesis, then the CTE in `pruneAttempts`.
3. Checks (3); review (4); docs (`docs/OPEN_GAPS.md` B61, `IMPLEMENTATION_STATUS.md`).

**Rollback:** `git revert` the commit. No migration, no data change.

## Result (2026-11-02)

**What changed.**
- `src/server/auth-attempts.ts`: `pruneAttempts` runs `WITH doomed AS MATERIALIZED (SELECT
  key … LIMIT 100 FOR UPDATE SKIP LOCKED) DELETE FROM auth_attempts a USING doomed d WHERE
  a.key = d.key`; its comment says why, and that the bound is on deletions (review 4).
- `tests/integration/auth-attempts.test.ts`: the new test of acceptance 1 (150 rows with a
  window start of 2000-01-03, the five planner settings off in its own transaction, then 50
  left and 0 after a second prune; its rows are deleted in `finally` even when it fails).
  The B53 test is unchanged.
- Docs: `docs/OPEN_GAPS.md` (B61), `IMPLEMENTATION_STATUS.md` (the auth line).

**Test first.** On the old statement the new test failed 3 times of 3 with `0 !== 50`
(all 150 deleted). After the change the test file passed 9/9 three times.

**Checks (2026-11-02, the worktree with the main checkout's env file loaded by node's
`--env-file`; the worktree has no `.env` of its own).** In one sequence, all exit 0:
`npm run test:db` 123/123, again 123/123; `npm run test:coverage` 508/508, again 508/508
(lines 84.67 %, branches 88.14 %, functions 93.30 % against 84/88/93, thresholds not
changed); `npm run check` (385 unit tests, lint, typecheck). Not run: `npm run build` and
`npm run test:e2e` (no page, route or build input changed).

**Mock/live:** the isolated test database only; no provider call, no spend.

## Independent review (2026-11-02)

A `reviewer` agent in a fresh context read this file and the working-tree diff.
**Verdict: no blocking issues.** It ran the old and new statements in rolled-back
transactions on PostgreSQL 17.11, with 150 and 1,000 expired rows, under 7 plan settings.
The old statement deleted 150 / 1,000 under every forced nested loop, and 100 under hash,
merge or materialized plans. The new statement deleted 100 under all of them, including a
nested loop that rescans `CTE Scan on doomed` for every outer row. It held five expired
keys open in other transactions (`FOR UPDATE`, an uncommitted resetting upsert, an
uncommitted delete, `FOR KEY SHARE`, `FOR SHARE`) and pruned with `lock_timeout = 1s`:
3–5 ms, no error, only the five unheld rows deleted. It ran the new test against HEAD's
statement (failed 2 of 2, `0 !== 50`), the test file (9/9), the integration suite with the
same env file (123/123) and `npm run check:agent` (exit 0).

Findings and what was done:
1. *Note:* root cause, bound and B53's skip-locked and expired-only properties confirmed;
   the window re-check under a concurrent update rests on reading the code (it is the same
   `FOR UPDATE` re-check as before) → nothing to do.
2. *Note:* the test relies on `enable_material = off`; with it on, the old statement gets a
   `Materialize` and the test would pass vacuously → it is among the five settings.
3. *Note:* the guard depends on PostgreSQL 17's planner; a later major version could plan
   the old statement differently, and the test would no longer catch a revert → recorded
   under Limitations.
4. *Note:* the comment said "one login never does unbounded work", but on a small table the
   plan still reads the whole table (a seq scan, as before this change) → the comment now
   says at most 100 deletions.
5. *Note:* the status line said "whatever plan PostgreSQL picks", wider than the tests →
   now "under a nested-loop plan too".
6. *Note:* in scope; no security test or threshold weakened.

## Limitations

- The new test forces the bad plan with planner settings on PostgreSQL 17. It proves the
  bound under that plan, not under every plan a future major version could choose; the
  argument that a materialized CTE is read once covers those.
- Bounded deletions are not bounded reads: on a small table the planner still scans it.
  The window index (B53 review 3) serves large tables.

## Approvals and limits

Requested by the main session on 2026-11-02 as its own branch and review. **The owner
accepted B61-001 on 2026-11-03** («Accept B61-001», in this session). The fix (`5482f05`) was
already merged into `main` (`4866519`); this record of the acceptance is a separate commit.
Coding-host spend: not visible.
