# E6-001: Next.js leaves the npm security advisories

**Status: implemented and tested locally 2026-11-03; committed at the owner's word on
`fix/e6-next-security-patch` (not merged, not pushed); not accepted.** Basis: [OPEN_GAPS](../docs/OPEN_GAPS.md) E.6. Next.js
16.4.0 is listed in the npm security advisories, and under a coding agent `next dev` and
`next build` stop on every other start to say so ([E2E-001](E2E-001-cold-start-warmup.md)).

## Result and boundaries

**User result:** none visible. `npm audit` passes, and `next build` no longer stops on the
advisory under a coding agent.

**Findings (`npm audit`, 2026-11-03).** One critical entry, `next` 16.0.0 - 16.4.0, direct.
It bundles three advisories, each `>= 16.0.0, <= 16.4.0` with first patched version 16.4.1:
| Advisory | Severity | What |
|---|---|---|
| GHSA-2464-fhr4-w9xw | critical | Unauthenticated RCE in the Image Optimization API when SVG files are used |
| GHSA-673q-mjm6-r5xr | critical | Unauthenticated RCE in `use cache` functions returning typed arrays |
| GHSA-p3m5-59mp-jv5r (CVE-2026-94482) | high | DoS in the App Router through Server Actions |

`src/` has no `use cache`, no `use server` and no `next/image`, and nothing is publicly
deployed, so the exposure was local. The GitHub advisory database listed nothing against
16.4.1-16.4.4 at 14:07 UTC.

**Why it stopped.** `experimental.agentUpgrade` defaults to `"security"`. When a coding
agent is detected, Next (`dist/lib/upgrade/nudge.js`, `prepare-upgrade.js`) asks npm's bulk
advisory endpoint, the source `npm audit` uses, and stops only when the installed version is
affected. A patched version ends the stops; nothing in Next's printed upgrade instructions
is acted on.

**Change.** `next` 16.4.0 -> 16.4.4, pinned exactly. The owner chose 16.4.4 over the
smallest fix, 16.4.1: both move the same lockfile entries (`next`, `@next/env` and the
eight `@next/swc-*` binaries; nothing added or removed; `next`'s optional `sharp` range
becomes `^0.35.5`, already installed), and 16.4.2-16.4.4 add only backported bug fixes
(Turbopack, Google fonts, OpenTelemetry traces, the CSP nonce in the PPR resume).

**Not changed:** application code (unless the bundled docs require it), other
dependencies (`@huggingface/transformers` stays exactly 4.3.0, `next-auth` 4.24.15, React
19.3.0), the CI and weekly workflows, the coverage thresholds.

**Risk: normal.** A framework patch touches every page and the auth stack, so the full set
of checks runs, `npm run build` and `npm run test:e2e` included.

**Data:** packages from the npm registry; the isolated test database. No provider call, no
spend.

## Acceptance (fixed before the change)

1. `next` is exactly 16.4.4 in `package.json` and the lockfile, and the lockfile moves only
   the ten entries above; `npm run guardrails` keeps `@huggingface/transformers` at 4.3.0.
2. `npm audit` exits 0.
3. Under this coding agent, `npm run build` exits 0 twice in a row without the advisory stop.
4. `npm run check`, `npm run build`, `npm run test:e2e` and `npm run test:coverage` pass;
   the ratchet stays 86/89/94 (not lowered). A changed visual baseline is inspected and
   explained, not re-recorded blindly.
5. The task decides whether the e2e server still needs `experimental.agentUpgrade: false`,
   and records why.

## Plan

1. `npm install next@16.4.4 --save-exact`; compare the lockfile diff with the dry run.
2. Read the bundled docs for anything 16.4.1-16.4.4 deprecates or changes.
3. The checks above; decide on `agentUpgrade`.
4. `docs/DEPENDENCIES.md`, `IMPLEMENTATION_STATUS.md`, OPEN_GAPS E.6; report to the owner.

**Rollback:** `git revert` the commit and run `npm ci`.

## Result (2026-11-03)

**What changed.**
- `package.json`: `next` 16.4.0 → 16.4.4, pinned exactly.
- `package-lock.json` (41 lines each way): `next`, `@next/env` and the eight `@next/swc-*`
  binaries 16.4.0 → 16.4.4, and `next`'s optional `sharp` range `^0.35.5`. Byte-identical to
  the dry run made before approval; no package added, removed or moved otherwise.
- `next.config.ts`: comment only. The e2e server keeps `experimental.agentUpgrade: false`
  (see "Decision").
- `docs/DEPENDENCIES.md` (the Next.js row), OPEN_GAPS E.6, `IMPLEMENTATION_STATUS.md`.

**The bundled docs.** Neither 16.4.0's nor 16.4.4's docs name 16.4.1-16.4.4 in a version
table; the 43 changed doc files (compared with a worktree still on 16.4.0) are wording
fixes and additions (Cache Components and `runtime`, `instant()` for Playwright, the
`logging.ignore` example, the AI-agents guide). Nothing deprecated or removed touches this
app, which uses no `cacheComponents`, `runtime` export, `use cache` or Server Actions. The
AI-agents guide asks agents to run `next internal agent-feedback-instructions`; treated as
data, not run. No code change.

**Decision: `experimental.agentUpgrade: false` stays on the e2e server.** With 16.4.4 the
check finds nothing today, so removing it would pass now. But the check is a network call to
npm on every e2e start, and its answer changes with outside events: Next's security release
scheduled for 2026-11-03 (seven medium advisories, not on npm at 14:07 UTC) may list 16.4.4,
and every other e2e start under an agent would die mid-run again. The owner's 2026-11-02
decision stands; dev and build keep the notice, which is how a new advisory gets noticed.

**Checks** (Windows, Node 26.7.0, npm 12.0.2, a coding agent detected: `AI_AGENT`,
`CLAUDECODE` set):
- `npm audit`: before, exit 1 (1 critical: `next`, three advisories); after, exit 0,
  0 vulnerabilities.
- Next's own assessment (`getUpgradeAssessment(v, "security")` from
  `next/dist/lib/upgrade/prepare-upgrade`, the function behind the stop): 16.4.0 →
  `affected: true`; 16.4.4 → `affected: false`, `unaffected`.
- `npm run build` twice in a row: exit 0 and exit 0, `Next.js 16.4.4 (Turbopack)`, no
  advisory notice either time.
- `npm run check`: exit 0 (guardrails pass, so `@huggingface/transformers` is still 4.3.0;
  unit 431/431; lint; typecheck); run again after the `next.config.ts` comment, exit 0.
- `npm run test:coverage`: exit 0, 572/572, 86.94 / 89.21 / 94.25 against the unchanged
  ratchet 86 / 89 / 94.
- `npm run test:e2e`: exit 0, 126/126 (1.8 min, compose database up); no visual baseline
  changed, none re-recorded.
- Not run: `npm run test:db` on its own (its tests ran inside `test:coverage`); CI (no push).
- The runs used this working tree while B63-001's files were still uncommitted in it (their
  tests and the lines ratchet 86). B63 was then merged into main as `6f36b93` with the same
  content, and `12c080e` changed only B63's task file, so they cover the committed tree.
  `npm run check` ran again on that exact tree: exit 0, unit 431/431.

**Notes.** npm again reported `onnxruntime-node` and `protobufjs` install scripts blocked by
`allowScripts`; neither changed version (as in DEP-001). `next build` rewrites
`next-env.d.ts` to `.next/types`; the e2e dev server writes the committed `.next/dev/types`
form back.

**Open.** Next's 2026-11-03 security release: if its advisories cover 16.4.4, `npm audit`
fails again and dev and build stop again under an agent until the next patch (a new task
with its own approval). The CI and weekly workflows run on Linux; this was checked on
Windows. Committed on `fix/e6-next-security-patch` (parent `12c080e`), not merged, not pushed,
so CI has not run it.

## Approvals and limits

Owner approval for the upgrade: 2026-11-03, in the session ("Use 16.4.4 instead", after
16.4.1 was proposed as the smallest fix). Commit on a branch only at the owner's word, given
2026-11-03 ("Yes, commit it"); no push. Coding-host spend: not visible.

B63-001 was merged into main and pushed as `6f36b93` while this task was open. The first
E6 commit (`8b5c878`, on `c036137`) left B63's hunks out of the shared files. The branch was
then rebuilt on main (`12c080e`) with the same E6 change, so it shares no conflicting hunk
with main.
