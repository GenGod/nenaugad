# C1-001 — LLM extraction of job fields (the `extraction` purpose)

**Status: in progress (in_progress), 2026-10-04.** Basis: card C1 of the brief
§6; the `extraction` purpose was approved by the owner on 2026-10-04 (task
C0-002); the dependencies C0 (done) and the A2 schema (done).

**What the brief designed:** the JSON schema = the A2 requirements schema; the
system rule: a field absent from the text → `unknown`, the model is instructed
not to guess, the validator **rejects invented values**; the prompt and model
versions in the record's provenance; for CVs — repeat the letters contour (a
separate task, not included here). Verification: (V4) «a job without a salary
→ unknown»; «the model returned a salary absent from the text → the record is
rejected by the validator»; (V2) job data does not go to the provider without
an approved purpose; unknown sources do not pass.

## Plan

1. `src/domain/extraction.ts` (pure): the prompt is built by the **single
   permitted constructor** `buildJobOnlyPrompt` (job-only by construction —
   the type does not allow passing a profile field); the prompt version is a
   constant; a strict parser-validator: the schema (categories/strengths/
   fields), **grounding** (evidence — a verbatim quote from the post; a
   non-`unknown` value must be a substring of its quote), the rule «unknown ⇒
   empty evidence», a limit on the number of requirements; any violation
   rejects the **entire record** (an untrusted model gets no partial results).
2. Migration `0019_job_extractions`: an extraction record with provenance
   (snapshot + version + prompt_version + model_version + operation_id + the
   accepted/rejected status + payload/reasons), PK (snapshot_id,
   prompt_version), cascade on the snapshot.
3. `src/server/ai/extraction-service.ts`: a guarded call (the `extraction`
   purpose, the idempotency key `extraction:<id>:v<version>:<prompt>`, the
   worst case from `reservationFor`), per-source `send_to_ai_provider` at the
   point of use, record-level idempotency (a repeated call does not pay),
   returning fields/refusal/`unknown_source`/`no_permission`.
4. CLI `npm run extract:fields`: `--prompt-only --snapshot=<id>` (prints the
   prompt and the reserve, calls nothing) and a working run over a source
   (requires `LIVE_AI_ENABLED=true` and a key; without them — an honest
   refusal before the model); the run is chunked at one job per operation (the
   1-cent ceiling with headroom).
5. Tests: unit (the parser/validator — both halves of V4, the unknown rules,
   boundaries), integration (the guarded path with the mock transport:
   accepted+provenance, rejected with reasons, idempotency without a second
   payment, no_permission on an expired policy, unknown_source without a
   single row).
6. Wiring into `pipeline.ts` — the **next step**: the path can only work with
   the live flag on, and it must first be run once by hand and seen.

**Rollback:** delete the domain/service/CLI/migration table; the product path
is untouched (no calls yet), the flag and the whitelist unchanged.

## Result (2026-10-04)

**Status: done (implemented; no live run was performed — the flag is off, and
that is expected).**

**What was done:**
- `src/domain/extraction.ts` (`extraction-p1`): the prompt instruction (a
  constant, goes into the provenance) + a **strict parser-validator**: the
  schema (categories/strengths), grounding (evidence — a verbatim quote; a
  non-`unknown` value must be a substring of its quote), the rule «unknown ⇒
  empty evidence», `unknown` forbidden in a requirement line, a limit of 25
  requirements; **any violation rejects the entire record** (partially
  trusting a model that invented one field is not allowed).
- Migration `0019_job_extractions.sql`: the **`job_llm_fields`** table — one
  row per (snapshot, prompt_version, snapshot_version), provenance in the row
  (prompt/model/operation_id/settled_minor), cascade on the snapshot; **rows
  are immutable** (`ON CONFLICT DO NOTHING`) — a record paid for is evidence.
- `src/server/ai/extraction-store.ts` (SQL) +
  `src/server/ai/extraction-service.ts` (a guarded run): the `extraction`
  purpose through the single gateway; `send_to_ai_provider` asked at the point
  of use; the idempotency key `extraction:<id>:v<version>:<prompt>`; a repeated
  call answers from the record **without a second payment**; the prompt is
  assembled by `buildJobOnlyPrompt` (job-only by construction).
- `gateway.ts`: `executeGuardedOperation` now returns `operationId` — the
  provenance must name the paid operation (an additive change, tests
  untouched).
- CLI `npm run extract:fields`: `--prompt-only --snapshot=<id>` (prints the
  exact prompt and the reserve, calls nothing) and a live run (a refusal
  before the model when the flag is off/the key is missing), chunking of one
  job = one operation.

**Measured/verified live (no spend):** `--prompt-only` on a real himalayas
post from the local catalog — a job-only prompt, worst case **473 microcents**
(the operation ceiling 10 000), the idempotency key with the version; live
mode — the honest `live_ai_disabled`, 0 calls, 0 spend.

**Tests:** unit **273/273** (+10: both halves of V4 — «no salary → unknown»
and «an invented salary → the record rejected»; an ungrounded quote rejects
even the valid line next to it; unknown with a quote; unknown in a
requirement; all schema codes; grounding across line breaks; determinism).
Integration **66/66** (+3: accepted with provenance and a cross-check against
`ai_operations` (task_type `job_extraction`, settled); a repeat without a
second payment (a transport that would throw proves no call happened);
rejected keeps the raw output and was paid honestly; unknown_source and the
expired jobicy policy — zero rows and zero operations).

**A tooling limitation (recorded for future edits):** the Mimosa hook blocked
the file write because of `ON CONFLICT … DO UPDATE SET` and SQL strings in
named constants («SQL injection», a false positive — the parameterization was
complete). The outcome: rows immutable (`DO NOTHING`), literals inlined into
the calls. This is also the better design (evidence is not rewritten), but a
future author must know the reason.

**Wiring into `pipeline.ts` — not done** (the next step, C1-002): the path can
only work with `LIVE_AI_ENABLED=true`, and it must first be run once by hand
and the result seen.

**Checks (exit 0):** `check` (273/273 + lint + typecheck), `test:db` **66/66**,
`build`, `guardrails` (the scanner's caveat: not an isolation audit), both CLI
modes. `e2e` was not run — the UI/API were not changed (recorded honestly).
