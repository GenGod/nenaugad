# DEP-001: the weekly audit's three high-severity findings are fixed

**Status: accepted by the owner, 2026-10-13.** Implemented and checked locally the same day. Basis: the scheduled "Weekly checks" run of
2026-10-12 (run 38265407509, on `c1417f4`) failed its `npm audit --audit-level=high` step
(DEVX-003). The owner approved the dependency upgrade on 2026-10-13.

## Result and boundaries

**User result:** none visible; `npm audit --audit-level=high` passes again, and the weekly
check is green.

**Findings (from the run's log).**
| Package | Installed | Advisory | Fix |
|---|---|---|---|
| `next` | 16.3.6 (pinned, direct) | six: `use cache` draft-mode leak, SSG/ISR cache poisoning (two), dev-server MCP endpoint disclosure, metadata image route disclosure, image-optimisation SSRF | 16.4.0, outside the pin |
| `sharp` | 0.35.4 (via `@huggingface/transformers` 4.3.0 and `next`, both `^0.35.4`) | librsvg CVE-2026-96889 | ≥ 0.35.5, inside both ranges |
| `source-map-js` | 1.2.1 (via `next` → `postcss` 8.5.23, `^1.2.1`) | event-loop DoS through indexed source-map offsets | a fixed 1.2.x, inside the range |

**Change.**
1. `package.json`: `next` 16.3.6 → 16.4.0, still pinned exactly. Read 16.4's upgrade notes
   in `node_modules/next/dist/docs/` first and act on anything that touches this app.
2. `npm audit fix` (no `--force`): lockfile-only updates of `sharp` and `source-map-js`
   (or whatever 16.4.0 already brings).
3. No other dependency moves: `@huggingface/transformers` stays exactly 4.3.0 (the
   guardrail pin), `next-auth` 4.24.15, React 19.3.0.

**Not changed:** application code, unless the upgrade notes require it; the CI and weekly
workflows.

**Risk: normal.** A framework minor bump touches every page and the auth stack, so the
full set of checks runs, `npm run build` and `npm run test:e2e` included.

**Data:** packages from the npm registry; the isolated test database. No provider call,
no spend.

## Acceptance (fixed before the change)

1. `npm audit --audit-level=high` exits 0.
2. `next` is exactly 16.4.0 in `package.json` and the lockfile; `@huggingface/transformers`
   is still exactly 4.3.0 (`npm run guardrails`); `sharp` ≥ 0.35.5; `source-map-js` is a
   fixed version.
3. `npm run check`, `npm run test:db`, `npm run test:coverage`, `npm run build` and
   `npm run test:e2e` pass; thresholds not lowered. Any visual baseline that changes is
   inspected and explained, not re-recorded blindly.

## Plan

1. `npm install next@16.4.0 --save-exact`; read the upgrade notes; `npm audit fix`.
2. The checks above; the diff of `package.json` and the lockfile.
3. Docs; the owner.

**Rollback:** `git revert` the commit and run `npm ci`.

## Approvals and limits

Owner approval for this upgrade: 2026-10-13, in the session. No provider call, no spend.
Coding-host spend: not visible.

## Result (2026-10-13)

**What changed.**
- `package.json`: `next` 16.3.6 → 16.4.0, pinned exactly.
- `package-lock.json` (161 lines each way): `next` and its nine `@next/*` platform packages
  16.3.6 → 16.4.0; `sharp` and its sixteen `@img/sharp-*` platform packages 0.35.4 → 0.35.5;
  the ten `@img/sharp-libvips-*` binaries 1.3.3 → 1.3.4 (where the librsvg fix lives);
  `source-map-js` 1.2.1 → 1.2.2. Nothing else moved: `@huggingface/transformers` 4.3.0,
  `next-auth` 4.24.15, React 19.3.0, `postcss` 8.5.23, `onnxruntime-node` 1.30.0.
- `AGENTS.md`: `next dev` 16.4.0 rewrote its managed block's heading (`#` → `##`);
  committed with this change, as the block's own note says.
- `docs/DEPENDENCIES.md`: the Next.js and `sharp` rows.

**The upgrade notes.** The docs bundled with 16.4.0 name it only in version-history
tables, and every entry is an addition (`navigation`, `prefetch`, `ensureStatic`,
`experimental.agentFeedback`, `agentUpgrade`, three Turbopack options, `agentRules: false`
removing the managed block); nothing is deprecated or removed. The app uses none of the
renamed canary APIs (`unstable_navigation`, `unstable_prefetch`). No code change.

**Checks.** Before: `npm audit --audit-level=high` exit 1 (3 high). After: exit 0, 0
vulnerabilities. `npm run check` exit 0 (334); `npm run test:db` exit 0 (102);
`npm run test:coverage` exit 0 (436, thresholds unchanged); `npm run build` exit 0;
`npm run test:e2e` exit 0 (102 of 102, every visual baseline unchanged, none re-recorded).
`npm run guardrails` keeps `@huggingface/transformers` at exactly 4.3.0.

**Notes.** npm reported that `onnxruntime-node` and `protobufjs` install scripts are not
in `allowScripts` and were not run; neither package changed version, and the installed
`onnxruntime-node` binaries are in place: its native binding loads (`InferenceSession`
present). No test loads it (the local embedder runs from scripts, with the downloaded
model). The lockfile diff is 38 version changes, no package added or removed. `next build` and
`next dev` rewrite `next-env.d.ts` between `.next/types` and `.next/dev/types`; the
committed form is the dev one, as before.

**Limitations.** The CI and weekly workflows run on Linux; this was checked on Windows.
The weekly check goes green only on its next scheduled run (or a manual dispatch).
