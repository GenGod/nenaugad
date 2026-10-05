# AI-005 — `send_to_ai_provider`: the grant issued and verifiable for the first time

**Result:** the owner approved sending source text to the provider
(2026-10-01). The grant was entered into the rights matrices (three policies,
versions raised) and — more importantly — an **enforceable gate** appeared,
which no AI path had before this task: until 2026-10-01 relevance and letters
sent job text to the provider without asking the matrix at all
(`docs/OPEN_GAPS.md` A2). Now the question «may the text of this source be
sent» has one answer in one place, and revoking the grant immediately stops the
flow.

**Trigger:** an audit of existing functionality (A2/A3) plus the owner's
approval.

**Not included:** the batch path's money guards (reservation, the attempt
counter, deadline, `uncertain`) — they are still bypassed; that is the next
item of C0-part-1; `LIVE_AI_ENABLED` as the kill switch (A1); the reserve as an
upper bound (A4); the owner quota and the operation ceiling (A5); releasing
`uncertain` holds (A6); idempotency (A7).

## What changed

**The rights matrices** (`src/server/source-policies.ts`):

| Source | Was | Became | Version |
|---|---|---|---|
| `atlas-fixtures` | `send_to_ai_provider: denied` | `allowed` | 2 → 3 |
| `himalayas` | `denied` | `allowed` | 4 → 5 |
| `jobicy` | `denied` | `allowed` | 3 → 4 |

`train_model` stays `denied` for all three; `process_with_ml` for jobicy stays
`denied` (it is a separate, weaker right, and the owner held it there on
2026-09-30); `publish_full_text` for the live sources stays `denied`. Each
policy carries `reviewed_at: 2026-10-01` and an `approval_reference` with the
decision.

**An honest note about jobicy.** The approval came as one line in reply to the
inventory, where item E8 said «all three». The jobicy policy comment records
outright that on September 30 the owner had held even the weaker
`process_with_ml` there, so this grant is a separate, stronger and later
decision. If a narrow reading was meant (fixtures and himalayas only), the
rollback is one line in the policy plus the corresponding test line, and that
is a deliberate action, not a silent expansion.

**The enforceable gate** (the same module, next to the policies — the answer
here is legal, not an «AI» one):

- `maySendTextToProvider(sourceId, now): boolean` — `true` only with an
  explicit `allowed` on an enabled, approved and unexpired policy; `unknown`
  and expiry give `false`, never «probably fine»;
- `partitionSourcesByProviderRights(sources, now)` — splits the sources into
  permitted and rejected.

**Where it is now asked** (the four places that send text outward):

1. `src/app/api/v1/relevance/route.ts` — the OpenAI batch mode
   (`mode: "openai-batch"`): rejected sources do not enter the submission, the
   response carries `rightsSkipped`;
2. same file — the synchronous batch (`batch: true`): the same, `rightsSkipped`
   in the response;
3. same file — the single analysis: `403 SOURCE_RIGHTS_DENIED` if the policy
   forbids;
4. `src/app/api/v1/cover-letters/[id]/generations/route.ts` — the job excerpt
   in the letter prompt: the same 403 refusal.

Plus `relevanceFailure` now distinguishes a revoked purpose (`403
AI_PURPOSE_NOT_APPROVED`) instead of masking it as `500 ANALYSIS_FAILED`.

## Protocol V0–V6 (condensed)

- **V1.** The rule was checked against `AGENTS.md` («Approved
  source/purpose/provider» — all three are needed) and against the spec that
  separates local inference from sending to the provider; the grant is not
  derived from `process_with_ml`.
- **V2.** An unknown source and an expired policy answer `false`; the refusal
  is shown honestly (`rightsSkipped`, `403`), not hidden as «no jobs».
- **V3.** `npm run check` → exit 0 (**230/230** unit, was 229; biome; tsc);
  `npm run test:db` → exit 0 (**51/51**); `npm run build` → exit 0;
  `npm run test:e2e` → **96 passed** (the live path not broken).
- **V4.** The new «owner decision 2026-10-01» test: all three sources have the
  grant, `maySendTextToProvider` answers `true` for them, `false` for an
  unknown source and `false` for an expired policy,
  `partitionSourcesByProviderRights` splits the list correctly. The matrix pin
  tests were updated deliberately (they exist precisely so that widening a
  grant is explicit).
- **V5.** Existing checks not weakened: `train_model`, `publish_full_text`,
  `process_with_ml` for jobicy stayed `denied` and remain pinned by tests; the
  «disabled clone denies everything» test untouched.

## Limitations and what remains

1. **The batch path's money guards are not fixed.** Rights are now checked,
   but reservation, the attempt counter, deadline and `uncertain` handling are
   not: the batch mode still spends money outside the budget. That is A3, the
   next item of C0-part-1.
2. **Functionally nothing changed** — and this must be said plainly: the text
   was sent before too (the code did not check the matrix); now it is sent with
   the grant. The change is that **revoking** the grant will now actually stop
   the flow, and that the matrix stopped being a document.
3. `jobicy` receives the grant while `process_with_ml` is held — the asymmetry
   is recorded in the policy and in the test; the narrow reading is rolled back
   with one line.
4. Sending the candidate's profile is a separate question the grant does not
   settle: it is about source text. For letters and relevance scoring the
   profile already goes to the provider; that is an owner privacy decision from
   §6.5 of decision №2 and it remains open (`OPEN_GAPS` E, profile privacy).
5. The grants are valid until `valid_until = 2026-12-23`; after that date
   `maySendTextToProvider` will return `false` by itself and the AI paths will
   stop — this is intended, but it means the ToS review by December is
   mandatory, otherwise the feature will quietly switch off.

## Risk and rollback

Low risk, and in the tightening direction: a prohibition was added, not a
permission; no existing call is rejected (all three sources are allowed).
Rollback — return `denied` in the policy of the source in question (one line;
the test will point out the mismatch) or `git revert` of this task: the gate
disappears and the matrix becomes a document again.
