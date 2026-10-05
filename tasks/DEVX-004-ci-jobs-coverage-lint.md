# DEVX-004 — CI as three jobs (code quality, build, tests), a coverage ratchet, Biome's recommended rules

**Status: implemented, 2026-10-05.** Owner decisions of 2026-10-05: three parallel CI jobs,
a coverage ratchet, and the stricter lint with today's findings fixed. Risk: normal (CI
and lint fixes). The diff touches two high-risk files, `src/server/ai/openai-transport.ts`
and `src/server/source-policies.ts`, with a parameter rename and a type-only import, so it
got an independent fresh-context review.

## What was done

1. **`.github/workflows/ci.yml`**: three parallel jobs, each its own status check.
   - **Code quality:** Biome lint (warnings fail), strict `tsc`, guardrails, token and
     icon drift.
   - **Build:** `next build`.
   - **Tests:** unit and DB tests in one run with the coverage ratchet (under
     `DATA_BACKEND=postgres`), a summary on the run page, then Playwright e2e; a unit or
     DB failure skips the browser install. Failure screenshots are kept for 7 days.
2. **`npm run test:coverage`**: unit and DB tests in one run, with Node's built-in
   coverage over the `src/**/*.ts` files, including files no test loads
   (`--test-coverage-include-all`). An untested new module therefore lowers the number
   instead of staying invisible. The run fails below 82% lines, 85% branches or 91%
   functions; today it measures 82.14 / 85.19 / 91.10. The 0% files are mostly API route
   handlers, which only e2e reaches. Raise the thresholds when coverage rises; never lower
   them to get green.
3. **Biome's recommended rules** (`biome.json`), with four rules off on purpose:
   - `style/noNonNullAssertion`: 135 hits, a style rule;
   - `style/useTemplate`: style-only notices, partly in the money and auth files, which
     SP 1.0 forbids refactoring "while at it";
   - `complexity/noUselessConstructor`: the 10 constructors it flags narrow the accepted
     error codes to a union (for example `BudgetError` in `src/server/ai/spending.ts`
     and `RegistrationError` in `src/server/users.ts`). Its autofix would widen them to
     any `string`;
   - `correctness/useUniqueElementIds`: all 17 static ids are in single-instance page
     parts; they pair labels with inputs, and two are e2e selectors.
   `npm run lint` and the per-edit hook now fail on warnings.
4. **Today's findings, fixed** (Biome 2 also enables its React and Next.js rule domains
   from `package.json`, which a config outside the repository does not see):
   - explicit types for five implicit-`any` `let`s;
   - the two pipeline sinks in `scripts/models-fetch*.ts` were generators that never
     yield; they are plain async functions now (old and new forms hash a 5 MB file
     identically);
   - `complementarity()` lost an unused `cutoff` parameter: the top-k cut happens in
     `collectTopK`, and the only caller passed 10 as if it mattered;
   - unused parameters prefixed with `_` (the OpenAI transport, two fixture mappers). In
     the jobicy mapper the unused text is a real gap, which is now recorded next to the
     code and as `docs/OPEN_GAPS.md` B24 (see the review below);
     `import type` in `source-policies.ts`; `const` in `scripts/tokens.mjs`;
   - suppressions with a stated reason: control characters in the query check
     (`src/domain/job.ts`) and in the ANSI stripping (`scripts/ci-status.ts`); the index
     key of a static list (`letter-editor.tsx`); the brand `<img>` (`shell.tsx`); and in
     `globals.css`, the reduced-motion `!important` reset and `.actions` after
     `.hero .actions`.

## Checks

- Strict Biome over 232 files: 0 diagnostics. `tsc --noEmit`: exit 0.
- `npm run test:coverage`: 344/344; 82.14 / 85.19 / 91.10 with never-loaded files
  counted, 94.50 / 85.19 / 91.10 without them. With a 99% line threshold: exit 1 and
  "94.50% line coverage does not meet threshold of 99%". `src/` has no
  platform-specific code, so Linux should measure the same.
- Independent review (fresh context, Opus): every source change is behaviour-neutral,
  including `_operation` in the OpenAI transport, which is never referenced, and
  `import type` in `source-policies.ts`, whose three names are type-only exports. The
  workflow's fail-fast, pipefail, summary and artifact logic was checked, and nothing
  the old single job ran is missing. Three findings, all handled:
  1. The jobicy geography gap, now `docs/OPEN_GAPS.md` B24, not fixed here.
  2. Coverage ignored never-loaded files; `--test-coverage-include-all` was added and the
     thresholds were re-measured.
  3. The reason given for keeping `noUselessConstructor` off was wrong, and is corrected
     above.
- actionlint 1.7.12 on all three workflows: exit 0.
- Rehearsal on a clean clone with this diff applied, no `.env`, a fresh pgvector
  database and the CI environment, before the review's coverage change: lint, typecheck
  and drift exit 0; build exit 0 (50 s); unit and DB tests 344/344 with the same
  coverage (21 s); e2e 99 passed (95 s; on Windows the visual baselines held).

## Rollback

`git revert` the commit: one CI job again, the four-rule lint, no coverage step.

## What remains

- After the first run on GitHub, confirm that the Linux coverage numbers match.
- Owner: B24, the jobicy geography gap. It needs its own task with tests, because it
  changes what the catalog shows.
- Dependabot PR #1 edits `ci.yml`; Dependabot rebases it on the new layout.
