# B23-001 — the ranker in the product path (owner decision No. 4, item 1)

**Result:** `/matched` is sorted by the shipped deterministic ranker v4 instead of
"AI score, then catalog". The decision's key measurement: the catalog order gave
NDCG@10 **0.421**, the ranker v4 — **0.892** on the golden set (39 × 6).
Eligibility (the gates) was not changed; the AI score remained in the UI as an
informational badge.

**Out of scope:** revising the gates themselves; new ranker candidates
(B2-merge/B3 — when they appear, they enter the shadow via `candidateId`);
retention (RET-001).

## What changed

- `src/server/matching-service.ts` — the single feed order: after collecting the
  shown posts, one call of `rankJobs(shown, profile, now, { disliked })`; both
  tabs inherit it (the filter by status). Hidden jobs are no longer "invisible"
  to ranking: their group yields `dislikedPosting` (company + stack), and the
  neighborhood is demoted — «понижение, не скрытие» ["demotion, not hiding"]
  (A6-002) now acts in the product, exactly as it was measured.
- `src/server/ranker-shadow-service.ts` — the default champion =
  `RANKER_VERSION` (the shipped order), the candidate is optional; without a
  candidate `diff: null`, the guardrails are computed, the log honestly writes
  `candidate: null` and zero diffs.
- `src/domain/feed-order.ts` — the journal labels of both tabs =
  `RANKER_VERSION` (the B3 promise fulfilled: the label is the ranker version,
  not an invented order name).
- `src/app/matched/page.tsx` — the AI-score sorting removed (the order comes from
  the server); the copy: «Порядок — детерминированный ранкер по условиям, роли и
  свежести» ["The order — a deterministic ranker by conditions, role and
  freshness"]; the AI-score badge and the batch-analysis button kept as information.
- `src/domain/ranker-registry.ts` — the registry comment brought to the fact: the
  champion is the ranker registered with B23; `feed-default-order` is the
  baseline of the measurements, not what the candidate receives.
- `scripts/eval-shadow.ts` — the champion = v4, the candidates — the other
  registered versions (the controls); the output and the JSON updated for the
  optional diff.

## Checks (2026-10-02)

- `npm run check` → exit 0 (**240/240** unit, biome 210, tsc clean);
- `npm run test:db` → exit 0 (**56/56**; the new test "delivered feed follows the
  shipped ranker's order" + the updated shadow test: champion = v4, candidate =
  null in the log, the feed does not depend on the shadow);
- `npm run build` → exit 0; `npm run test:e2e` → **96 passed** (the page on the
  fixture backend does not render the tabs — the baselines untouched);
- `npm run eval:matching` → exit 0, guards 0/0, the aggregate unchanged (0.892);
- `npm run eval:shadow` → the champion v4: `feed-default-order` moves 177/189
  positions, the controls — 61/49/34; **guardrails pass for all**.

**Not verified:** the live `/matched` page on the working DB with real sessions —
the coverage is service-level (integration) and the e2e baselines; a manual
review by the owner is still owed.

**Limitations:** the order of the «Нужно уточнить» ["Needs clarification"] tab is
now ranked too (the same order, the status does not change) — this matches the
measurement on the common shown pool. The shadow without a candidate is
"dormant": the infrastructure and the guardrails live, the diff will appear with
the first registered candidate.

**Rollback:** `git revert` of the commit — the feed returns to AI-score/catalog,
the journal to the former labels; the shadow returns to the
`feed-default-order` champion.

**Costs:** coding-host — `unknown`.
