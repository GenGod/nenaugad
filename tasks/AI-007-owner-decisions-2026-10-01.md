# AI-007 — owner decisions 2026-10-01, batch 2: quota, holds, switch, REINDEX, privacy

**Result:** five owner decisions implemented, and not one remained a declaration.
All five closed inventory items (`A1`, `A5`, `A6`, `A8`, `E9`) are now either
enforced by code or executed on the data.

**Order and independence:** REINDEX is a DB operation (needed once), the other
four are code. All checks were run after each change.

## A5 — the $1/month quota, personal budgets created, the operation ceiling compared

- `GPT6_LUNA.ownerMonthlyQuotaMicroCents`: 500 000 → **1 000 000** ($1), with the
  date and the reason in a comment.
- **The quota stopped being uncreated.** Previously the owner row was created only
  for tests, and its absence made the ledger read it as "no personal ceiling" —
  that is, the approved quota had no effect. Now:
  * `registerUser` creates the quota row **in the same transaction** as the user
    (`ensureBudget` takes `Pick<Pool,"query">`, so it works with `PoolClient`);
  * `scripts/seed-ai-budgets.ts` backfills all existing owners;
  * a missing row is a `OWNER_BUDGET_MISSING` refusal, not "unlimited".
- **The operation ceiling (1 cent) is compared** in the gateway, where the
  provider's rate meets the reservation: `OPERATION_CEILING_EXCEEDED` before any
  money. Before, only the seed script printed the value.

**Found and fixed along the way:** `ensureBudget` used
`ON CONFLICT (scope, owner_id, period) DO NOTHING`, and the global row stores
`owner_id = NULL`, which the unique index does not count as a conflict — so
re-creation **failed** on the primary key. The claim "the seed is safe to rerun"
was wrong for exactly the row that the seed creates. Fixed to
`ON CONFLICT DO NOTHING` without a target; verified by two seed runs in a row
(427 users → 427 quota rows, both runs `ok: true`).

## A6 — `npm run ai:holds`: triage of stuck holds

A new command (`scripts/ai-holds.ts`):
- with no arguments — a list of the operations holding money (`reserved`,
  `in_flight`, `uncertain`): id, type, status, attempt count, amount, age, plus
  the budget rows as the source of truth on what is held;
- `--cancel=<operationId>` — releases **one named** hold via `cancelOperation` and
  prints the released amount.

Why a command and not auto-cleanup: releasing a hold means deciding that the
provider did NOT charge. Automation can err in that direction (and then the budget
diverges from the invoice), so the decision stays with a human, and the output
carries the corresponding caveat. First run on the working DB: `holdingOperations:
0`, the owners' quotas visible as `1000000` microcents.

## A1 — `LIVE_AI_ENABLED` became a real switch

- `readConfig`: the flag is read (`"true"` → enabled, absence/`"false"` →
  disabled, any other value → `LIVE_AI_ENABLED_INVALID`, fail-closed). Previously
  the variable was rejected under any setting, and the only enabler was the
  presence of the key in the environment.
- The gateway checks the flag **first**, before purpose, ceiling, budget and
  transport: disabled → `LiveAiDisabledError`, zero movement of money. The routes
  answer `503 AI_LIVE_DISABLED`.
- LIVE_SOURCES deliberately remains without a flag: a source works by its own
  policy (approved + enabled + not expired + permission for the operation), and a
  second, weaker switch would be worse than its absence. Setting the variable is
  still an error.
- `health` and `doctor` no longer lie about AI: they report the actual value of
  the flag.
- **A consequence to know about:** `.env` has `LIVE_AI_ENABLED=false`, which means
  that after this change live calls refuse until the owner sets `true`. That is
  the point of the switch; a key in the environment no longer enables anything.

## A8 — the index defect cured

1. `REINDEX TABLE job_snapshots` → **65 ms**; a control lookup by id, which before
   returned 0 rows, finds the row again.
2. A reachability audit over all the main paths: **0 unreachable out of 2182**
   (previously 12 out of 700 in `job_snapshots.id` alone; `users`,
   `candidate_profiles`, `job_embeddings`, `saved_jobs` were clean).
3. `REINDEX DATABASE atlas_starter` → **152 ms** — insurance against the same
   corruption in the indexes I did not check by name (the rehearsal estimated it
   at 35 ms).
4. `npm run embeddings:index -- --embedder=local` → **12/12** picked up,
   `exit 0`: there are no more vectors skipped because of the defect; himalayas
   is at 498/498.

## Privacy — the personal-data boundary became structural

Owner decision: «все персональные данные остаются внутри контура, иначе продукт
рискует быть запрещён по GDPR и аналогичным законам» ["all personal data stays
inside the contour, otherwise the product risks being banned under GDPR and
similar laws"]. Implemented not by a comment but by code
(`src/server/ai/personal-data-boundary.ts`):

- `PURPOSES_NEEDING_CANDIDATE_FACTS` records which operations are inexpressible
  without candidate data. Both current ones (`cover_letter`, `job_matching`) are
  there, and a value of `true` means a forbidden call.
- `assertNoCandidateFacts(purpose)` — a check that the paying places must pass;
  throws `PersonalDataBoundaryError` (`503 PERSONAL_DATA_BOUNDARY`).
- `buildJobOnlyPrompt` — the **only** prompt builder for the provider: the job
  text only (title, company, description). Not a single profile field.
- Both call sites (relevance scoring, letter generation) ask the boundary
  **before** assembling the prompt; a test checks the gate itself and that both
  places call it (a textual check — otherwise the gate would remain a "dead
  approval", on which the project has already been burned twice).

**A consequence to say plainly: with this, both remaining AI functions are
closed.** Relevance scoring and letter generation require candidate data, so both
refuse while there is no local model (or until the owner narrows the decision, for
example to "agree to send roles and country without identifiers"). Together with
the closed batch path (AI-006) this means: **not a single request of the
application any longer sends the provider anything about the candidate.** The
local part of the contour (embeddings B1, BM25 B2) keeps working.

## Checks

`npm run check` → exit 0 (**235/235** unit, previously 233); `npm run guardrails`
→ pass; `npm run test:db` → exit 0 (**55/55**, previously 52: the switch, the
operation ceiling, the initial creation of the quota); `npm run build` → exit 0;
`npm run test:e2e` → **96 passed**; `npm run seed:budgets` ×2 → both `ok: true`;
`npm run ai:holds` → shows 0 holdings and the created quotas; the `REINDEX`
checks and the vector backfill — above.

## Limitations

1. **The live AI functions currently refuse** — for two independent reasons: the
   switch (`LIVE_AI_ENABLED=false` in `.env`) and the personal-data boundary. This
   is a recorded consequence of the decisions, not a breakage; to bring back
   scoring and letters a local model is needed, not a flag change.
2. The quota is not "monthly" in the strict sense yet: `period = 'monthly'` is
   stored, but there is no calendar reset — the ceiling acts as cumulative. That
   is the next small step if the owner wants exactly monthly windows.
3. `ai:holds` releases the hold but does not record that the provider charged
   after all: the command prints a warning and leaves the decision to a human. No
   journal of manual decisions is kept.
4. The privacy boundary is about candidate data. Job text can still go to the
   provider (that is employer data), and the source policies permit it (AI-005);
   if the owner wishes, this can be closed too.
5. `auth: "not_implemented"` in `health`/`doctor` remains (inventory item B14):
   auth is implemented, but the reporting of it is not fixed — outside this batch
   of decisions.

## Risk and rollback

The risk: closing the AI functions reduces the product's capabilities — that is a
consequence of the privacy decision, and it is rolled back in one of two ways: a
local model (the right path) or a narrowing of the decision by the owner (then
`PURPOSES_NEEDING_CANDIDATE_FACTS` changes in one place). The technical rollback —
`git revert` of the task; REINDEX is reversible in its consequences (the indexes
are rebuilt), and so is the vector backfill (they can be deleted;
`job_embeddings` follows the snapshots).
