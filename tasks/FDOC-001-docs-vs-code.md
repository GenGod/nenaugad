# FDOC-001 — documents versus code (inventory section F)

**What this is.** The owner directed closing section F of
[docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md): the documents decisions are made from
describe the state of 24–27 September and mislead in both directions. The edits —
factual statements only; the rules and the decisions of the documents are not changed.

**Status:** implemented (2026-10-02).

## Scope

| Document | What we fix |
|---|---|
| `docs/ARCHITECTURE.md` | «AI/profile/upload не реализованы» ["AI/profile/upload are not implemented"], «любой live-флаг отклоняется» ["any live flag is rejected"], «unit не имитируют идемпотентность» ["unit tests do not mock idempotency"] |
| `docs/SAFETY_GATES.md` | CV / Paid AI / letters — «Не реализовано» ["Not implemented"] |
| `README.md` | «auth, CV, реальные источники, платный AI не реализованы» ["auth, CV, real sources, paid AI are not implemented"] (3 places) |
| `AGENTS.md` | the "What exists" paragraph — state, not rules |
| `reports/COVERAGE.md` | privacy/upload, budgets, letters «Не реализовано» ["Not implemented"] (restore — still absent) |
| `reports/DELIVERY.md` | «не выполнено» ["not done"] — in fact done after installation; mark as done, preserving the environment record |
| `docs/DEPENDENCIES.md` | no rows for `next-auth@4.24.15`, `openai@7.23.0` |
| `src/server/ai/README.md` | already fixed in B15 — remove the F row |

## Rules

- Historical records are not rewritten: where a document records the state of
  preparation, a «выполнено позже» ["done later"] note is added with a link to the facts.
- No rule (AGENTS.md, the safety discipline, the sources) is weakened.

## Result

**Section F is closed.** All eight rows of the table were brought in line with the code:

- `docs/ARCHITECTURE.md` — an ADR update on top + the «устарело 2026-10-02»
  ["outdated as of 2026-10-02"] notes on three statements (the flags,
  idempotency, "AI/profile/upload"); the ADR decisions were not changed, the
  document remained a decision record with an honest evolution note.
- `docs/SAFETY_GATES.md` — the column «Состояние в коде (2026-10-02)» ["State in
  code (2026-10-02)"] was rewritten to the facts (the sources, the profile, CV,
  Paid AI, letters — implemented with their gates; the repair loop and restore —
  deferred and named); the gate composition and the beta prohibition were not changed.
- `README.md` — the header, «граница поставки» ["the delivery boundary"], «что в
  коде» ["what is in the code"], the structure, the checks, CI and «что дальше»
  ["what is next"] were brought to the actual state; all instructions preserved.
- `AGENTS.md` — the "What exists" paragraph (real sources, the worker, S2–S4, the
  AI contour, "Not beta"); the rules and the boundaries of the file untouched.
- `reports/COVERAGE.md` — the table rewritten to the facts; the only «Не
  реализовано» ["Not implemented"] left is restore (SP-T22).
- `reports/DELIVERY.md` — a note was added that the preparation environment was
  torn down (the installation and the lockfile done, check/build/test:db/e2e
  green, S0 accepted 2026-09-24); the historical record preserved.
- `docs/DEPENDENCIES.md` — rows added for `next-auth@4.24.15` (S2-001) and
  `openai@7.23.0` (AI-002, the only permitted SDK, guardrails) + a note about the
  lifted S0 block.
- `src/server/ai/README.md` — the row removed: fixed earlier in B15.
- Outside the table, `START_HERE.md` was added — a status header: it remains an
  archival record of day one, but is no longer read as a description of the
  current code.

**Checks:** no code changed; `npm run check:offline` → exit 0 (unit 240/240,
guardrails, tokens, icons); the diff — only `.md` files, the task and `current.json`.

**Limitations, stated honestly:** the documents are a description, not proof;
every statement rests on the code/tests named in the text, and on discrepancy the
priority belongs to the code and `IMPLEMENTATION_STATUS.md`. «Первый день» ["Day
one"] in `START_HERE.md` is deliberately preserved as a historical record under
the status header.

**Costs:** coding-host — `unknown`.
