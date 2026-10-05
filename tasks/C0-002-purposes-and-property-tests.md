# C0-002 — AI boundaries, part 2: property tests and the purposes package

**Status: done in the unblocked part (implemented), 2026-10-04.** Part 1 of C0
was done earlier (AI-006). Part 2 of the brief splits into three pieces: (a) «make
sure from the code that ownership, atomic budget reservation, persistent counters,
deadline, uncertain billing, cancellation, commit-time revalidation cover the
calls; tests of each property» — done here; (b) new purposes — «each one is
approved separately by the owner», the package below; (c) the quota/ceiling
review — an owner decision.

## Part 1 — re-verified against the code (not from memory)

- `gateway.ts:74` — the purposes whitelist is checked **before** any movement of
  money (`isPurposeApproved` → `PurposeNotApprovedError`); the golden-10-case
  test is below.
- Batch path: AI-006 was closed with the «disable until production» option —
  `openai-batch.ts` with no SDK import, `BATCH_DISABLED` + `BATCH_DISABLED_REASON`,
  the route answers 503 with a re-enablement plan; the `custom_id → snapshot_id`
  mapping hole is closed together with the path.
- The inventory section A audit (AI-004…AI-007) is closed; `LIVE_AI_ENABLED` is the
  gateway kill switch (the «with the flag off, refusal before money» test).

## Property audit: property → where enforced → test

| Property | Where enforced | Test |
|---|---|---|
| Ownership | all spending queries are scoped by `owner_id` (reserve/begin/settle/cancel/get) | **new**: a foreign owner cannot read/settle/cancel (OPERATION_NOT_FOUND); one's own is untouched |
| Atomic budget reservation | `FOR UPDATE` on `ai_budgets` + a conditional UPDATE of held | «concurrent callers cannot double-spend the remainder» |
| Persistent attempt counters | `beginAttempt`: `attempt_count < MAX_ATTEMPTS` in SQL | «attempt counter is persistent…» (+ ATTEMPTS_EXHAUSTED) |
| Deadline | `beginAttempt`: `deadline_at > now`; a separate test | «deadline expiry and uncertain hold semantics» (DEADLINE_EXPIRED) |
| Uncertain billing | `markUncertain` (status-guarded), the hold is kept; release — `npm run ai:holds` | «…uncertain hold semantics» + «…the mock transport path settles honestly» |
| Cancellation | `cancelOperation` (status-guarded, releases the hold) | «settlement converts the hold; cancel releases it; the kill switch…» |
| Commit-time revalidation | `settleOperation`: status ∈ {in_flight, uncertain} otherwise WRONG_STATE; `cancelOperation`: settled/cancelled → WRONG_STATE | **new**: cancelled→settle WRONG_STATE; settled→cancel WRONG_STATE |
| Kill switch | `executeGuardedOperation`: `liveAi` first | «live AI switch: with the flag off the gateway refuses before any money moves» |
| Owner quota | `reserveBudget` checks the owner budget | «registration provisions the owner's quota…missing owner budget» + **new**: exhaustion by settled spend |
| Operation ceiling | `gateway`: `worstCase > operationCeiling` → refusal | «operation ceiling: a reservation above one cent is refused» |
| Personal-data boundary | `personal-data-boundary.ts` (see the package below) | boundary unit tests (existing) |

**4 tests added** to `tests/integration/ai-guards.test.ts`: owner isolation,
two-sided WRONG_STATE (commit-time revalidation), owner quota exhaustion
(not only «the row is missing»), and the documented boundary «deadline stops
new steps but does not block settling an already-sent call».

## Golden 10 (the brief's common list, §4) — holds

The clause reads: «Any AI call — including the existing job_matching path and the
new phase C purposes — outside an approved purpose/budget → fail-closed refusal
(today the batch path violates this condition — see C0)». The violator (batch) is
closed; tests: refusal of an unapproved purpose **before** money (0 operation
rows, 0 held), the kill switch, the operation ceiling, budgets, uncertain without
blind retry. (V5) letter safety tests untouched; `npm run guardrails` green.

## Owner decision package: phase C purposes

**Correction against the code (verified 2026-10-04):** the source right
`send_to_ai_provider` **has already been granted** to all three sources by the
owner decision of 2026-10-01 (AI-005, `source-policies.ts:38,102,170`); earlier
documents (doctrine №3 §4.3, task B3-001) called it blocked — corrected in both.
The owner quota was raised to **$1/mo** (also 2026-10-01); the operation ceiling
**1 cent** was not changed; the environment's global budget is **$10**. Prices:
input **$0.10/MTok**, output **$0.50/MTok** (`provider.ts`, verified 2026-09-25).

| Purpose | For what | Data leaving the contour | Personal-data boundary | task_type | Cost estimate | What is required |
|---|---|---|---|---|---|---|
| `extraction` (C1) | job fields from text | only the job text | **compatible** (`buildJobOnlyPrompt`) | `job_extraction` exists (limit 2 attempts) | ≈0.03 cents/post (1.7k input + ~300 output) — the 1-cent ceiling covers ~30 posts | owner decision on the purpose + a whitelist entry |
| `dedup-confirm` (C5) | confirming a near-dup pair | two job texts | **compatible** | none new → task_type migration | ≈0.06 cents/pair (2×1.5k input) | purpose + task_type migration + attempt limit |
| `matching-scoring` (C2) | the «подходит» rubric for top-K | **candidate facts** (profile) | **refuses** (`PURPOSES_NEEDING_CANDIDATE_FACTS`) | `job_matching` exists | ≈0.7–0.94 cents per top-50 feed — nearly the whole 1-cent ceiling; the $1 quota → ≈106–147 feeds/mo | a narrow reading of doctrine №3 §4.4 (owner) OR a local model; then purpose + a possible ceiling revision |
| `hyde` (research A2) | a hypothetical job from a CV | **the candidate's CV** | **refuses** | none new → migration | input-dominated ≈0.02 cents/CV | the same privacy decision + purpose + migration |
| `eval-judge` (C6) | judging job↔profile pairs | **candidate facts** | **refuses** | none new → migration | ≈0.1–0.2 cents/pair | the same privacy decision + purpose + migration |

Honest framing: two purposes (job-only) are compatible with the boundary today and
need only a whitelist entry (+ a migration for `dedup-confirm`); the other three
run into **one** owner decision — doctrine №3 §4.4 («do we allow transferring
profile facts to a third party»), and that decision is reused here rather than
decided anew. Not a single line of these purposes was added to the code: the
whitelist is the approval mechanism.

## Checks

`npm run test:db` — **62/62** (+4 new property tests); `npm run check` — green;
product code unchanged (tests + documents only), `build`/`e2e` untouched —
recorded honestly.

## Rollback

Delete the 4 tests (the diff is trivial); product behavior unchanged. The purposes
package is a document; revoking the decision = not adding a whitelist entry.

## Next step

The owner decisions from the package (minimum: `extraction` as the first job-only
purpose — it unlocks C1). Or, before the decisions, any C-line that does not
require sending data outward.

## Owner decision and its execution (2026-10-04)

**Decision (verbatim):** «одобряю purpose extraction» [“I approve the extraction
purpose”] — per the package above: job-only extraction of job fields from the
job's text, ≈0.03 cents/post, candidate data does not leave the contour.

**Executed the same moment (the whitelist is the approval mechanism):**
- `provider.ts`: `ApprovedPurpose` and `approvedPurposes` extended with the
  `extraction` value, recording the date and price; an outdated claim in a
  comment was also fixed («`send_to_ai_provider` denied for all» — it was
  granted 2026-10-01, AI-005);
- `gateway.ts`: `PURPOSE_TASK_TYPE.extraction = "job_extraction"` — the
  purpose→bucket mapping stays in the gateway: a call cannot take over someone
  else's attempt counter;
- `personal-data-boundary.ts`: `extraction: false` — an **explicit record** of
  the passed review (job text only, via the single permitted constructor
  `buildJobOnlyPrompt`), not an absent row;
- tests: unit updates (the whitelist — three purposes; the boundary —
  `extraction` does not throw); integration — an approved `extraction` goes
  through the gateway with the mock transport, the operation lands in
  `job_extraction`, settles, and a neighboring unapproved `cv_extraction` still
  refuses before money.

**What this does NOT include (honestly):** there is no calling code for
extraction yet — that is C1; `LIVE_AI_ENABLED=false` still stops any real call
at the gateway's first checkpoint; the 1-cent operation ceiling and the quotas
were not changed — C1 must chunk (≈30 posts per operation at the ceiling);
only a `buildJobOnlyPrompt` prompt may go to the transport.

**Checks:** unit **263/263**, `test:db` **63/63**, `check` + `guardrails` —
green.
