# DEVX-002 — CI on GitHub Actions: rehearsed before its first run, plus agent tooling

**Status: implemented, 2026-10-05; CI's first run on GitHub is green (`d679a9d`).**
Owner request of 2026-10-05: implement the CI scripts for GitHub Actions. Risk: normal
(CI and tooling; no product code).

## Why

CI had never run; DEVX-001 enabled it on pushes to `main`. Before the first push, a
rehearsal reproduced the job locally: a clean clone without `.env`, `npm ci` from the
lockfile, a throwaway `pgvector/pgvector:0.8.6-pg17` database and CI's exact
environment. It showed that the first run would have failed: 8 of 69 `test:db` tests
(A7 digest, A9 shadow, A10, B23) answered `fixture_backend`. The job sets
`DATA_BACKEND=fixture` for every step, while the DB suite exercises the PostgreSQL
backend; locally these tests pass only because the developer's `.env` selects it.

## What was done

1. **`.github/workflows/ci.yml`**
   - `test:db` runs with `DATA_BACKEND=postgres` (the fix). The tests bring their own
     pool on `TEST_DATABASE_URL`, so `DATABASE_URL` is not needed.
   - `setup-node` caches npm downloads (`cache: npm`).
   - The database health check runs over TCP: during the first boot, the temporary
     init server answers only on the socket.
   - On failure, `test-results/` (Playwright's failure screenshots) is kept as an
     artifact for 7 days.
2. **`.github/workflows/actionlint.yml`**: runs only when a workflow changes;
   actionlint 1.7.12 with shellcheck 0.11.0, pinned by image digest.
3. **`npm run ci:status`** (`scripts/ci-status.ts`): one line per GitHub Actions run of
   `HEAD`. For a failed run it prints the last 40 lines of each failed step, grouped by
   step, without timestamps or colour codes, and exits 1. The parser is unit-tested
   (`tests/unit/ci-status.test.ts`).
4. **Docs:** AGENTS.md (commands) and `docs/TESTING.md` (what CI proves and what it does
   not: the visual baselines are Windows-only).

Not needed: skipping the CUDA download of `onnxruntime-node` on Linux. npm 12, which
ships with Node 26.7.0 locally and in CI, blocks install scripts that `allowScripts`
does not cover, so it never runs.

## Checks

- Rehearsal on a clean clone of `3a73e9f` with the CI environment and a throwaway
  pgvector database on 127.0.0.1:55432:
  - `npm ci` exit 0 (18 s, warm cache); `check` exit 0 (17 s); `build` exit 0 (45 s,
    without `.env`);
  - `test:db` with the job's fixture backend: 61/69, the defect above. With
    `DATA_BACKEND=postgres`: 69/69 (12 s), on a used database and again on a freshly
    created one;
  - `test:e2e`: 99 passed (92 s), and 99 again (87 s) after the DB suite on the freshly
    created database, the order CI uses. On Windows the pixel comparisons ran and
    passed.
- actionlint 1.7.12 on both workflows: exit 0, no findings.
- `npm run check:agent`: exit 0, 275/275 (the two new tests included).
- `npm run ci:status` against GitHub: "No GitHub Actions run for 3a73e9f" (not pushed).
- GitHub Actions, the first run ever (run 37358307037, `d679a9d`, pushed with owner
  approval): success in 9 min 17 s. `npm ci` 19 s, `check` 18 s, `build` 20 s,
  `test:db` 10 s, Playwright install 5 min 37 s, `test:e2e` 1 min 54 s. Of the
  Playwright install, 5 min 3 s was an Ubuntu mirror serving 32 MB of OS packages at
  106 kB/s, while the browser downloads took 14 s; a typical run should take about
  4 minutes. Workflow lint (run 37358307259): success.

## Rollback

`git revert` the commit: the workflow returns to the DEVX-001 version, whose DB step
fails on GitHub as described above.

## What remains

- The optional extras (a scheduled `terms:check`, a weekly `npm audit` and Dependabot
  for action versions) were approved and are handled in
  [DEVX-003](DEVX-003-weekly-checks.md).
