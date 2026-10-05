# BFIX-001 — section B defect closure ([docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md))

**What this is.** The owner directed closing the section B defects of the inventory
(`docs/OPEN_GAPS.md`, 2026-10-01) — unfinished work in already shipped functionality.
One defect — one minimal complete change with a test; all of it together — one
campaign, with a full run of the checks at the end.

**Status:** in_progress.

## Campaign rules

- Close only what closes locally and without a new owner decision:
  bugfixes, missing validation, missing data wiring, the honesty of reports.
- Items requiring an owner decision or a separate review are marked
  "deferred" with a reason and remain in `OPEN_GAPS.md` (B9, B11, B13, B23).
- The golden set (A1) thresholds are not lowered: if a ranker change worsens
  NDCG@5/@10 or R@5 — the change is rolled back, not the threshold.
- The DB schema does not change, except where a defect cannot be closed without it
  (then — with a new migration 0018+ and a `test:db` run).

## Scope (B1…B23, open as of 2026-10-02)

| # | What we fix | Approach |
|---|---|---|
| B1 | Clicks are not sent | wire the client click report next to the impression |
| B2 | `propensity` is NULL in the product | server-side computation (together with B20) |
| B3 | `v0-*` labels in the journal | the version label of what actually ranked |
| B4 | `showNeedsReview` is not applied | apply the flag on the matching read path |
| B5 | Requirements are not shown in the UI | requirement fields in `MatchedJob` + a block in the card |
| B6 | The role boost is a substring | word boundaries + head synonyms, measured on golden |
| B7 | Ghost marking only in matching | the same marking in the `/jobs` catalog |
| B8 | The «на чём основано» ["what it is based on"] panel is not rendered | render the evidence in letters |
| B9 | The letter repair loop | **deferred:** letters are closed by the personal data boundary until a local model; code without a reachable consumer is forbidden by project rules |
| B10 | If-Match for letters | support If-Match on the server |
| B11 | Account deletion | **deferred:** deletion is a high-risk zone (AGENTS.md), needs a separate review and owner acceptance |
| B12 | The DST-exact window of TIME-01 | month-by-month offset checks instead of January/July |
| B13 | Jobicy without vectors | **deferred:** the `process_with_ml` right for jobicy was withheld by the owner 2026-09-30 |
| B14 | health/doctor lie | actual values |
| B15 | `src/server/ai/README.md` is outdated | rewrite it to the actual state |
| B16 | `smoke-ai.ts` is not wired up | an npm script + a mention in the docs |
| B17 | Dead code | delete (`isPurposeApproved` stays — it is alive) |
| B18 | Swallowed errors | worker: do not lose the attempt record; profile: report the failure |
| B19 | `totalCostMicroCents` is always 0 | return the actual cost from the ledger |
| B20 | propensity/rankerVersion from the client | compute on the server, do not trust client values |
| B21 | — | closed in AI-006 (out of scope) |
| B22 | CV is read/deleted with uploads off | the same gate as at intake |
| B23 | The ranker is not in the product path | **deferred:** switching the feed is an owner decision (OPEN_GAPS E.3); the A9 gates are ready |

## Check commands

`npm run check` · `npm run test:db` (isolated DB) · `npm run build` ·
`npm run test:e2e` · `npm run eval:matching` (do not lower the thresholds) ·
`npm run guardrails`.

## Result

**18 defects closed:** B1–B8, B10, B12, B14–B20, B22. Deferred with a reason:
B9 (letters are closed by `PERSONAL_DATA_BOUNDARY` until a local model), B11 (account
deletion — a high-risk zone, a separate owner review), B13 (the `process_with_ml`
right for jobicy — no owner decision exists), B23 (switching the product
feed — an owner decision, OPEN_GAPS E.3).

**Measured beyond the requirement:** B6 gave a gain on the frozen golden set —
NDCG@5 0.914340 → 0.918614, NDCG@10 0.916478 → 0.920153 (p-frontend-latam
0.974 → 1.000), no profile worsened; the ratchet thresholds were raised in
`tests/unit/matching-eval.test.ts` (lowering them remains forbidden).
B12 changes the behavior of the TIME-01 rule, so `RULESET_VERSION` was raised to 3;
on the golden set the numbers and the guards did not move.

**Checks (2026-10-02):** `npm run check` → exit 0 (unit **240/240**, biome 210
files, tsc clean); `npm run test:db` → exit 0 (**55/55** on an isolated DB);
`npm run build` → exit 0; `npm run test:e2e` → **96 passed** (3 letter-page
baselines updated deliberately — the evidence panel, B8); `npm run
eval:matching` → guards 0/0, the thresholds raised; `npm run guardrails` — a static
check of the CV gate was added (B22).

**New files:** `src/domain/feed-order.ts`, `src/server/cv/gate.ts`,
`src/components/click-reporter.ts`, `src/components/tracked-job-link.tsx`,
`src/server/ai/README.md` (rewritten). Deleted: `src/server/ai/disabled.ts`,
`src/components/unavailable.tsx`.

**Coverage — what exactly the new tests verify:** the CV gate and its shape
(`tests/unit/cv-gate.test.ts`), the truthfulness of health/doctor
(`status-reporting.test.ts`), the role boost (`role-match.test.ts` — word
boundaries, head synonyms, "engineering" ≠ "engineer"), server-side propensity and
the feed label (`tests/integration/events.test.ts`: 80→1, 40→0.5, NULL without a score),
the rejection of client propensity and the closed set of feed keys
(`tests/unit/events.test.ts`), the click payload (`click-payload.test.ts`),
`versionFromIfMatch` (`letter-if-match.test.ts`), the DST-exact window
(`tests/unit/matching.test.ts`: the Ramadan shift Casablanca → unknown, UTC+0 →
pass), the ghost in the catalog (`tests/integration/ev-signal.test.ts`).

**Deliberately not covered:** e2e for the click report and for the conditional tab render —
e2e runs against the fixture backend, where matching is honestly empty (the same
reason as in OPEN_GAPS D). The route level of `/api/v1/events` has no route harness: the
validation is covered by the parser unit tests, the writing by the service integration tests.

**Costs:** coding-host — `unknown`.
