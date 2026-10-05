# Owner decision packet No. 4 (inventory section E, 2026-10-02)

**Status: the owner's answers were received on 2026-10-02 for items 1–4 (recorded below
verbatim); items 5–7 remain open — recommendations in §9.** The facts are verified
against code and measurements as of 2026-10-02. Like No. 02/No. 03, this file is a record of
decisions; the items of inventory section E are closed, the next tasks are in §10.

---

## 1. Switching the product result ordering to the ranker (E.3, brief item 11)

**What is being decided.** What `/matched` is sorted by. Today: a cached AI score, then
the catalog order. The AI part is unreachable — the personal data boundary (AI-007)
closed scoring, no new scores will appear, so the actual order today is
**catalog order**.

**Facts (measurement on golden v4, 39 jobs × 6 profiles, 2026-10-02):**

| Order | R@5 | R@10 | NDCG@5 | NDCG@10 | MRR |
|---|---|---|---|---|---|
| catalog order (what is visible today) | 0.179 | 0.302 | 0.312 | **0.421** | 0.352 |
| ranker v4 (deterministic) | 0.611 | 0.850 | 0.875 | **0.892** | 1.000 |

Shadow A9 already compares v4 with the catalog order and logs diffs on live data
(the last run: `compared 1, moved 0` on the sparse local result set); guardrails
and ratchet thresholds are ready.

**What «yes» means.** A separate task (B23): `/matched` is sorted through
`rankJobs` (v4) with hides as a preference downgrade and closure as a ghost
downgrade; the journal starts writing `RANKER_VERSION` instead of the feed-order label;
shadow changes its champion. Eligibility (gates) does not change; the AI score in the UI remains
information, but no longer sorts.

**Owner decision (2026-10-02): «Да, переключить на v4» [yes, switch to v4].** The next task is
in §10 (B23): sorting `/matched` through `rankJobs`, the journal writes
`RANKER_VERSION`, shadow changes its champion; eligibility and the UI do not change.

**Executed 2026-10-02 (task B23-001).** `matching-service` ranks both
tabs with a single `rankJobs` order (v4), hidden jobs feed the preference
downgrade, closure feeds the ghost downgrade; the page no longer sorts by AI score
(the badge is for information, the order comes from the server); the journal writes `RANKER_VERSION`
(feed-order labels replaced); shadow: champion = v4, candidate is optional (currently
`null` — there is nothing to compare against, guardrails keep being computed on every request);
`eval:shadow` was switched to the v4 champion, the controls remained candidates. Checks:
`check` 240/240, `test:db` **56/56** (including the new result-order test),
`build` 0, `e2e` 96, `eval:matching` 0.892/guards 0/0, `eval:shadow` guardrails
pass for all controls.

---

## 2. Batch path and scoring: privacy versus operability (E.1, §C0)

**What is being decided.** The fate of OpenAI Batch (closed in AI-006) and of synchronous
scoring — both are closed by the personal data boundary (AI-007): `job_matching` and
`cover_letter` are inexpressible without candidate data, the calls refuse.

**Facts.** The batch relaunch plan — 5 items in
[AI-006](../tasks/AI-006-c0-part-1.md): reservation at submit, settlement at
retrieve, a deadline for the asynchronous operation (24 h versus 120 s for the synchronous one),
server-side mapping (the client does not send it), one send attempt. The operation
cap of 1 cent does not cover a request for the catalog (≈1.05 cents) → either a chunk of ≈285
posts, or a separate decision on the cap for the asynchronous operation. The batch gives a 50%
discount. Without a privacy decision, any relaunch will refuse anyway.

**Options.**
(a) Keep it closed until a local generative model. An embedding model cannot score;
a local generative one is a new dependency and hardware (right now Onnx
takes ~4.6 GB per batch of 8 at 2000 tokens; a generative one will be heavier).
(b) Allow scoring through the provider — a partial cancellation of AI-007 for
`job_matching`: the cheapest and the fastest, but the candidate's profile goes to a third
party.
(c) Order a separate task evaluating a local generative model (hardware,
speed, rubric quality) — option (a) becomes concrete.

**Owner decision (2026-10-02): «Закрыто + задача оценки локальной модели» [closed + a local model evaluation task].**
Batch and scoring remain closed (the AI-007 privacy is not cancelled); a
separate task is created to evaluate a local generative model — hardware, speed,
rubric quality (MODEL-001, §10).

**Executed 2026-10-02 (task MODEL-001).** The candidates Qwen3-1.7B and Qwen2.5-1.5B
(ONNX q8, Apache-2.0; the artifacts were downloaded at pinned revisions and verified by
sha256) were run on this machine with the already installed CPU runtime — without new
dependencies. Outcome: they do **not serve** the shipped rubric — 0 valid JSON out of 6
runs without scaffolding (the models «narrate»); with JSON prefill — 8/8 valid,
but Spearman(scores vs manual ratings) **−0.156**, gross errors (an irrelevant
design job — 85, a keyword trap — 85) and 6.7 tok/s. The GPU (RTX 5060, 8 GB)
is not used by the installed runtime: CUDA is a new dependency and a separate
owner decision. Recommendation: scoring remains closed; if local scoring
is wanted, the next step is a CUDA runtime + a 7–8B model (a separate task,
a repeat measurement with the same matrix). Details —
[tasks/MODEL-001](../tasks/MODEL-001-local-generative-eval.md).

---

## 3. The `process_with_ml` right for jobicy (E.2, B13)

**What is being decided.** Whether to give jobicy the right to local ML — then the dense
leg will index its posts (currently B13: `process_with_ml: denied`, the leg does not work
for jobicy).

**The conditions were re-read 2026-10-02 (Fair Use, §08) — key wording:**
- «The Jobicy API is designed for websites, applications, newsletters, research
  tools, **AI products**, and other services that help users discover remote work
  opportunities.»
- «Most integrations, including job boards, newsletters, career tools, **AI
  assistants**, and internal applications, can use the public API without a
  separate agreement.»
- Limitations we comply with: attribution and the canonical Jobicy URL
  are preserved (cards lead to the listing); `train_model` remains denied — the
  text does not insist on this right, and the matrix does not change it.

**Owner decision (2026-10-02): «Да, выдать process_with_ml» [yes, grant process_with_ml].** Executed in
the same session: jobicy policy v4 → v5 (`process_with_ml: allowed`,
`reviewed_at` 2026-10-02, `approval_reference` supplemented, the snapshot's `terms_hash` did not
change — the text is the same), the tests were updated to match the decision;
`npm run embeddings:index -- --embedder=local --source=jobicy` indexed
**202/202** posts — **B13 is effectively closed**. The himalayas email
(`hi@himalayas.app`) remains a recommended owner action.

**Owner decision:** _(pending)_

---

## 4. Retention: the event journal and closed source records (E.4)

**What is being decided.** How long to keep the journal of impressions/clicks and what to do with
closed source records.

**Facts.** `job_events` is deleted only together with the profile, there is no TTL; the seen-set
lives 7–14 days; future ranking (LTR/OPE) wants months of history. Closed
source records are currently deleted entirely through the policy window (720 h for both
sources) — after that, dedup and provenance lose the trace (question S1-005).

**Options.**
(a) A 12-month journal (a constant with a recorded reason) + a «tombstone» for closed
records: id, source, content_hash, closure date — without text; minimization
is satisfied, dedup/ghost history is preserved.
(b) A 6-month journal, closed records deleted entirely, as now.
(c) No TTL until traffic appears.

**Owner decision (2026-10-02): «Журнал 12 мес + tombstone» [12-month journal + tombstone].** The next
task is RET-001 (§10): a 12-month TTL for `job_events` (a constant with a recorded
reason) and a tombstone for closed source records (id, source, content_hash,
closed_at — without text) instead of full deletion by the policy window.

**Executed 2026-10-02 (task RET-001).** Migration 0018 adds
`job_snapshots.tombstoned_at`; retention no longer deletes the record but anonymizes
it: id, source, dates and content_hash remain, the text (title / company_name /
description / excerpt) is cleared, lifecycle → `tombstoned` (the domain already
allowed this value), derived vectors are deleted together with the text. A repeated listing
revives the record: a new pipeline branch `revived` restores the text and version+1,
keeping the original `first_seen_at` (provenance survives the tombstone). Journal:
`EVENT_RETENTION_MONTHS = 12` and the `purgeExpiredEvents` pass in the worker
(`--no-retention` disables it). Checks: `check` 241/241, `test:db` **57/57**
(tombstone with an empty-text check, idempotency of a repeated pass,
revival, purge), `build` 0, `e2e` 96; the migration was applied locally. The test
caught a real bug before commit: `setUTCFullYear(year−12)` was subtracting 12 years instead of
months — fixed to `setUTCMonth`.

---

## 5. reason codes and the structural filter «don't show company X» (E.5)

**Facts.** 7 fixed hide reasons (including `company_uninteresting`);
A6-002 already downgrades the company neighborhood (−12), but does not hide it entirely.
**Options.** (a) leave as is; (b) a separate task «hide the whole company»
with an explicit undo. **Recommendation:** (a) now, (b) — when frequency appears in the data.

**Owner decision:** _(pending)_

---

## 6. ESCO as external reference content (E.6)

**Facts (A3-001 §V1).** The license and redistribution conditions are not confirmed
(the conditions page has not been read); the import has not started; dictionary v2 (aliases, RU) and
the worklist work; Russian morphology is a separate question. **Recommendation:** do not
connect it now; come back with a separate task that reads the conditions, if catalog growth
shows the dictionary is insufficient.

**Owner decision:** _(pending)_

---

## 7. Email alert channel (E.7)

**Facts.** `send_email: denied` in all three matrices; the in-app «What's new»
works; there is no mail infrastructure in `compose.yaml`. **Recommendation:**
keep in-app; email is a separate task with a decision on the channel (local SMTP
or an ESP) and rights.

**Owner decision:** _(pending)_

---

## 8. Thresholds and weights (E.9)

Not a decision now: the constants await accumulated data, the journal has been collecting them
since 2026-10-02 (BFIX-001). Recorded so that it is not lost.

---

## 9. Summary of the implementer's recommendations

| # | Question | Owner decision (2026-10-02) |
|---|---|---|
| 1 | Result ordering | **Switch to ranker v4** (0.892 versus 0.421 for catalog order) → task B23 |
| 2 | Batch/privacy | **Remains closed** + a local generative model evaluation task (MODEL-001) → measured: 1.5–1.7B on CPU do not serve the rubric; **MODEL-002** is registered — a CUDA spike (7–8B, RTX 5060) |
| 3 | jobicy ML | **Grant `process_with_ml`** — executed: policy v5, indexing 202/202, B13 closed |
| 4 | Retention | **12-month journal + tombstone** for closed records → task RET-001 (executed) |
| 5 | Company filters | **Leave as is** (hiding a job + weight downgrade of the neighborhood already work); come back when frequency appears in the data |
| 6 | ESCO | The conditions were **read verbatim** (handbook §5): a mandatory line «This service uses the ESCO classification of the European Commission.» + «Any modified or adapted version of ESCO must be clearly indicated as such»; the occupations part — ISCO/ILO («can be adapted and reproduced with permission»), the skills part — EU (Decision 2011/833/EU). **Decision: connect the skills part** → task [ESCO-001](../tasks/ESCO-001-import-skills.md) |
| 7 | Email | **Remains in-app**; the email channel — a separate task later (`send_email` denied in all matrices) |

## 10. Next tasks following the decisions of packet No. 4

| Task | From decision | Scope |
|---|---|---|
| B23 | §1 | switching `/matched` to ranker v4 — **executed 2026-10-02** |
| RET-001 | §4 | journal TTL of 12 months + tombstone — **executed 2026-10-02** |
| MODEL-001 | §2 | evaluation of a local generative model on CPU — **executed 2026-10-02** (negative result, the numbers are in the task) |
| MODEL-002 | §2 | **registered**: a spike of local scoring on CUDA (RTX 5060, 7–8B model), with the same measurement matrix |
| ESCO-001 | §9 item 6 | **registered**: connecting the skills part of ESCO with attribution (the conditions have been read, see §9) |
| E.5–E.7 | — | decisions taken 2026-10-02 (see §9) |

Separately, by the owner's decision of 2026-10-02 (a minor interface fix): the AI analysis
buttons («Analyze all with AI» and «AI rating» on the card) were removed from `/matched`, since
scoring is closed by the boundary and the buttons always answered 503; the badges of cached
ratings are marked «for information: new ones are not computed». The records — task EDEC-002.

Recommended order: B23 (the gain is measured, the gates are ready) → RET-001
(policy + migration) → MODEL-001 → ESCO (per the decision) → MODEL-002 (spike).
