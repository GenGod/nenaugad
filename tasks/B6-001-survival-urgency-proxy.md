# B6-001 — urgency/survival proxy model (buckets + hazard window)

**Status: in progress (in_progress), 2026-10-04.** Basis: card B6 of the brief
[docs/design/2026-09-27-matching-implementation-brief.md](../docs/design/2026-09-27-matching-implementation-brief.md)
§6 («Urgency/survival proxy model»); research part 2 B3; inventory —
`docs/OPEN_GAPS.md` C12. The dependencies A5 (freshness) and A10 (the ghost
layer over closure signals) are done; closure-checks (S1-005) collect data.

**What the brief designed:** buckets «published recently / several weeks / long
ago» from observable age and closure statuses; the UI shows only coarse
buckets, never «осталось N дней»; replacing the A10 m_urgency with a model
estimate goes behind the A9 guardrails. Verification: (V4) a synthetic
distribution of disappearances → the buckets are monotone; (V2) honest wording
(a copy test).

**An honest correction to the premise (data inventory, 2026-10-04):** the local
catalog has **no observable disappearances** — 700 records all `active`,
`closure_checks` empty, `full_pass_misses`=0 for all, all ages ≈ 9.3 days (a
single import on 2026-09-25). There is nothing to fit a hazard curve on, so
phase 1 is the **proxy structure**: provisional constants + honest signal
integration + synthetic tests; re-fitting the constants once observations
accumulate is a change of numbers, not a redesign.

## Plan

1. `src/domain/survival.ts` (version `survival-l1`): `urgencyDemotion` — a
   hazard window (provisionally 14→45→90 days, peak −6; outside the window 0:
   long-lived jobs are often evergreen per the research, we add no demotion
   beyond A5 for them, and give no «relief» either — A5 measured the boost for
   old age as harmful); `survivalBucket` (recent/weeks/long/unknown);
   `availabilityNoteFor` — the single honest line for the card (composed with
   the A10 ghost note: the strong fact first; for long — the soft «возможно,
   уже неактуально», without numbers or promises).
2. Ranker: an `urgency` layer (a separate toggle, like freshness/ghost),
   RANKER_VERSION → v5-…; `RankedJob.urgency` for transparency; the control
   `rankJobsWithoutUrgency`; a ratchet test «the layer does not worsen».
   Strict improvement is not guaranteed: only j33 (45 days) falls into the
   window in the golden set, and the order there is already correct via A5 —
   this will be measured and recorded, not claimed.
3. UI: `matched` and `SnapshotCard` replace the direct `ghostNote` call with
   `availabilityNoteFor(firstSeenAt, now, closure)` — one honest source of the
   line instead of two.
4. Tests: unit `survival.test.ts` (V4: bucket and demotion monotonicity on a
   synthetic age distribution; boundaries; V2: a copy guard — no digits,
   «осталось», «скоро закроется»; determinism); a ratchet in
   `matching-eval.test.ts`; runs of `eval:matching` and `eval:shadow`
   (A9 guardrails).
5. Checks: `check`, `test:db`, `build`, `e2e`; the task, OPEN_GAPS C12, status.

**Rollback:** remove the urgency layer from the ranker and return
RANKER_VERSION v4, delete `survival.ts` and the tests, return `ghostNote` to
the UI. The product order on current data was not changed (the layer is inert:
all posts are younger than the window) — the rollback is trivial.

## Result (2026-10-04)

**Status: done (implemented), 2026-10-04.** Local checks were run; acceptance
is with the owner.

**Data inventory (an honest correction, before implementation):** no observable
disappearances — 700 records all `active`, `closure_checks` empty,
`full_pass_misses`=0, all ages ≈ 9.3 days. Therefore phase 1 is a proxy
structure with provisional constants (recorded in the module header); re-fitting
as observations accumulate is a change of numbers, not a redesign.

**What was done:**
- `src/domain/survival.ts` (`survival-l1`): the hazard window (14→45→90 days,
  peak −6; outside the window 0 — long-lived jobs are often evergreen per the
  research, and there is no «relief» either: A5 measured the boost for old age
  as harmful); the buckets `recent/weeks/long/unknown` (unknown is a separate
  bucket, not «recent»); `availabilityNoteFor` — one honest line for the card:
  the strong fact first (the A10 check failure), otherwise soft caution for
  long-listed, without numbers or promises.
- Ranker: the `urgency` layer (a separate toggle), `RANKER_VERSION` →
  **v5-status-skills-role-must-stale-preference-ghost-urgency**;
  `RankedJob.urgency` for transparency; the control `rankJobsWithoutUrgency` +
  a registry entry (`v5-minus-urgency`); a «does not worsen» ratchet test (per
  profile and aggregate).
- UI: `matched` and `SnapshotCard` take the line from one source
  (`availabilityNoteFor`) — a composition of the A10 ghost note and the B6 age
  caution.
- Tests: unit **263/263** (+7: survival — bucket monotonicity on a synthetic
  age distribution (V4), the window shape without cliffs and without positive
  values, the V2 copy guard (no digits, «осталось», «скоро закроется»), the
  choice of the strongest fact, determinism; the urgency ratchet in
  matching-eval; the updated freshness pair test — the j33/j34 pair now
  demonstrates BOTH layers independently).

**Measurements:**
- `eval:matching`: the metrics are **identical** to the baseline (R@5 0.611 ·
  R@10 0.850 · NDCG@5 0.875 · NDCG@10 0.892 · MRR 1.000, guards 0/0) — the
  ratchet thresholds were not moved.
- `eval:shadow`: all guardrails controls **pass**; the `v5-minus-urgency`
  control moves **0/189 positions and 0 top-10 positions** — the layer's
  marginal effect on current data is zero, and this is measured, not claimed.
  The reason: the only post in the window (golden-j33, 45 days) is already
  lowered by the A5 layer below its fresh twin; the layer awaits an age
  distribution and closure data.
- Layer matrix (reports/local/b6-layer-matrix.mjs, gitignored): without
  freshness NDCG@10 0.878463 vs 0.892047 for the product — A5 keeps its strict
  contribution; urgency is exactly marginal.

**Checks (exit 0):** `check` (263/263 + lint + typecheck), `test:db` **58/58**,
`build`, `e2e` **99** (visual baselines NOT changed — for current data the
card line is identical), `eval:matching`, `eval:shadow`.

**Files:** `src/domain/survival.ts`; `src/domain/match-ranker.ts` (the layer +
control); `src/domain/ranker-registry.ts`; `src/domain/ev-multipliers.ts` (the
slots entry); `src/app/matched/page.tsx`; `src/components/snapshot-card.tsx`;
`tests/unit/survival.test.ts`; `tests/unit/freshness.test.ts`;
`tests/unit/matching-eval.test.ts`.

**Limitations:** the layer's marginal effect on the golden set is zero
(measured); no new promises in the UI (with a provisional curve any precision
would be invented — V2); the constants need a re-fit once
`closure_checks`/closed lifecycles fill up (the trigger is recorded here and in
the module header).

**Rollback:** remove the `urgency` layer and return `RANKER_VERSION` v4, delete
`survival.ts`/the tests/the registry entry, return `ghostNote` to the UI. The
feed order was not changed (0/189 per shadow) — the rollback is trivial.
