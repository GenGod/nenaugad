# A6-001 — seen-set: "seen, not clicked" does not return early

**Result:** matching stopped showing jobs the candidate had already seen and not
touched. A job returns when the pipeline has seen its content change (a new
`content_hash`), or when the shown period has expired (14 days). The journal gained
the fact of "what exactly was shown", and the client sends impressions from the
feed for the first time — the half of A8 that it left to the next task. An empty
list is explained honestly («скрыто N, вернутся при изменении или через 14 дней»
["N hidden; they return on change or after 14 days"]), not with silence.

**Out of scope:** weight demotion of the neighborhood of the hidden (the second
part of item A6 — a separate small task A6-002, so that each has its own
reviewable diff); structural filters "do not show company X" (an extension of the
reason codes — an owner decision); push alerts and the digest (A7); reading the
journal in the UI.

**Context:** [the brief](../docs/design/2026-09-27-matching-implementation-brief.md)
(item A6, dependency A8); [the
research](../docs/research/2026-09-26-job-matching-research.md) part 2 C1
(seen-set) and C2 (negative preferences — in A6-002).

## What was added

- `migrations/0015_job_events_shown_hash.sql` — the `shown_content_hash` column in
  `job_events`: the content fingerprint at the moment of showing. It is filled by
  the **server** from `job_snapshots.content_hash`, not by the client (a client
  fingerprint would make it possible to claim "you did not see this" and return a
  hidden job to the feed). NULL = "what was shown is unknown", and unknown never
  hides.
- `src/domain/seen-set.ts` — the rule: no record → show; there was an action
  (click/save) → show; the fingerprint is different → show immediately; otherwise
  the window `SEEN_TTL_DAYS = 14`; at the window boundary — return. Without
  evidence (no fingerprint, an unreadable time, a timestamp far in the future) —
  show: a wrongly hidden job is a silent loss. `SEEN_CLOCK_SKEW_TOLERANCE_MS =
  5 minutes` — the journal stamps time with DB clocks while the caller passes its
  own; a divergence of seconds is the norm, and without the tolerance the rule
  would silently switch itself off entirely.
- `src/server/seen-service.ts` — the impression registry is **derived from the
  journal**, not from a new table: "shown at such a time with such content" is
  already a fact of the journal, and a second copy would create a second source of
  truth and a second place that can be forgotten at deletion. Reads are
  owner-scoped (ids only from the session); `acted` — a click in the journal or a
  save.
- `src/server/events-service.ts` — recording an impression: a separate
  parameterized SELECT of fingerprints + an array insert via `unnest` (no
  string-built SQL). A click mark carries no fingerprint: a click is not an
  impression.
- `src/server/matching-service.ts` — the feed applies the rule to the whole
  duplicate group (the candidate saw the job, not a copy on a particular board)
  and counts the hidden per tab: an empty tab says why it is empty, instead of
  "nothing found".
- `src/components/impression-reporter.tsx` — client-side sending of impressions:
  ids and positions, position = the place in the rendered list; a report error
  never affects the feed. "Impression" is defined honestly: the job was in the
  rendered list; tracking of the visible area is not claimed.
- `src/app/matched/page.tsx` — the honest line «Скрыто как уже показанное: N»
  ["Hidden as already shown: N"], an empty state with a reason, and an explicit
  feed-order label in the journal (`v0-ai-score-then-catalog` /
  `v0-review-catalog-order`): there is no versioned ranker in the production path
  yet (A9), and its version must not be invented.
- `.gitignore` — `.playwright-mcp/` (the snapshot directory of the browser tool
  the client was checked with).

## Protocol V0–V6

- **V0.** A separate task; migration 0015 is the only schema change (additive, one
  column). The plan was written into this file before the code.
- **V1.** Item A6 and part 2 C1 re-read: «явный dismiss — навсегда; seen-no-action
  — TTL 7–14 дней, возврат только при изменении вакансии (content-hash или
  version+1)» [an explicit dismiss is forever; seen-no-action — a TTL of 7–14
  days, a return only on a job change (content-hash or version+1)]. Confirmed in
  the code: `job_snapshots.content_hash` and `version` do grow on a semantic
  change (`pipeline.ts`), that is, fingerprint comparison is an existing fact, not
  a new heuristic. Weight demotion (part 2 C2) is moved to A6-002, so that the
  diffs stay reviewable.
- **V2.** Principles: golden 9 — one candidate's signals do not affect another's
  (an integration test of two users); unknown is not guessed — without evidence
  the job is shown, "shown" without a fingerprint does not hide; deleting the
  profile deletes the journal, and with it the registry (test), because the
  derivative does not live separately; nothing fake — no impressions without a
  real render, the propensity is still NULL until A10.
- **V3.** `npm run check` → exit 0 (**170/170** unit, previously 163; biome 163
  files; tsc clean); **`npm run test:db` → exit 0, 37/37** (previously 31; 6 new
  A6 tests on a live test DB); `npm run build` → exit 0; **`npm run test:e2e` → 93
  passed**; `npm run eval:matching` → exit 0, the numbers did not change (the
  ranker untouched): R@5 0.742 · R@10 0.877 · NDCG@5 0.914 · NDCG@10 0.916 ·
  MRR 1.000, guards 0/0. Additionally the scenario was walked manually on the
  local dev DB in postgres mode: the first load of the «Нужно уточнить» ["Needs
  clarification"] tab — 46 cards, **46 impressions recorded with fingerprints**
  (`v0-review-catalog-order`, positions 0..45); a second load — all 46 hidden, the
  tab at 0, the line «скрыто 46 ... вернутся через 14 дней» ["46 hidden ... they
  return after 14 days"]; the repeat created no duplicates; the test user's
  records were deleted after the check.
- **V4.** The golden cases of A6: "a dismiss does not return" — the existing
  hiding (`hidden_jobs`) was not changed; "seen-TTL returns after a change, not
  earlier" — a unit test at the window boundary + an integration test on a real
  content change (a re-import with a new title → a new fingerprint → the job
  returned); golden 9 — an integration test of two users.
- **V5.** Existing tests were not weakened and were not changed; `check:offline`
  (including the guardrails) green; the diff reviewed in full; unrelated files not
  touched (`next-env.d.ts`, rewritten by the dev server, restored).
- **V6.** This file + a record in `IMPLEMENTATION_STATUS.md`.

## Important from the e2e check (environment, not code)

The first `test:e2e` run gave 90 passed / 3 failed: `DELETE /api/v1/profile`
failed on `job_events`, because the local dev DB had been migrated only to 0013 —
migration 0014 (A8) had not been applied to it, and A8 did not run e2e. That is an
environment gap, not a defect of the change: `npm run db:migrate` applied 2
migrations (0014, 0015), after which 93/93 were green. A useful fact for the
following tasks: **after an additive migration it must be applied to the local dev
DB**, otherwise the e2e path of profile deletion goes red.

## Repair cycles: 2/2 (the limit is exhausted, the work is green)

1. The first checks run: an unclosed generic in the `MatchedResult` type (`};`
   instead of `}>;`) — a biome parse error; a test took "the first row of
   snapshots" in the shared test DB, where snapshots of other sets already lie; an
   impression recorded milliseconds after the passed clocks was read as a
   timestamp from the future. Hypothesis: the red is defects around the rule (the
   type, a nondeterministic fixture key, a clock divergence), not in the rule.
   Confirmed: the type fixed, the fixture key deterministic (`jobicy:<id>` after
   resetting the source state), the clock tolerance an explicit constant, and a
   far-future timestamp still does not hide.
2. One red test remained, "the content changed": a re-import within
   `min_poll_interval` is correctly skipped by the adapter (`retry_scheduled`), so
   no content change happened at all. Hypothesis: the test must imitate the next
   scheduled poll (a reset of `import_state`), not wait for the window. Confirmed.

There are no further cycles and none are needed: all checks are green.

## Limitations

1. "Impression" = the job was in the rendered list; the visible area is not
   tracked and not claimed. For OPE (D7) this definition will have to be refined.
2. The 14-day window is the upper bound of the researched 7–14 range, fixed as a
   constant. There is nothing to tune on: no traffic; changing it — only with a
   measurement.
3. The registry is derived from the journal, so the journal's retention (owner
   decision #8) also bounds the memory of impressions: old events are "not seen
   again".
4. The feed order in the journal is labelled `v0-*`: there is no real versioned
   ranker in the production path yet (A9 will wire it in and replace the label).
5. The `/jobs` catalog remains a browsing showcase: the seen-set acts in matching
   (`/matched`), it does not hide jobs from the catalog.
6. Client-side sending is not covered by e2e (e2e runs against the fixture
   backend, where there are no snapshots) — verified manually on the local DB
   (the numbers above).

## Risk and rollback

Ordinary risk: an additive migration + a feed rule + a client component. Rollback
— `git revert` of the commit; the `shown_content_hash` column may remain
(additive, read by no one after the code rollback).
