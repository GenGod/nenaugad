# Coverage of the starting template

**Update 2026-10-02 (FDOC-001):** the table was brought in line with the actual state.
The only remaining «не реализовано» [not implemented] item is restore. The checks are run
locally with the commands from `IMPLEMENTATION_STATUS.md` (`check`, `test:db`, `build`,
`test:e2e`); CI does not run the DB or the browser.

| Requirement | Now | Limitation |
|---|---|---|
| SP-T03 source rights | Executable source policies and static guardrails | Licences/terms are checked by hand (`npm run terms:check`); jobicy `process_with_ml` is withheld by the owner |
| SP-T04 repeated seed | Idempotent seed and integration on a separate PostgreSQL (`npm run test:db`) | Runs locally; CI has no DB |
| SP-T06 remote/office | Deterministic rules; a conflict between tag and text keeps unknown | The text extractor is a heuristic, not an LLM |
| SP-T07 unknown geography | The full eligibility engine (`src/domain/matching.ts`): pass/fail/unknown, AND within an option / OR between options | unknown is not guessed; TIME-01 has been DST-accurate since 2026-10-02 |
| SP-T20 external transition | An apply route per the source policy; a backlink with attribution; there is no auto-application | Nothing is sent on the candidate's behalf |
| SP-T21 no AI | AI behind the guarded gateway, `LIVE_AI_ENABLED=false`; scoring and letters refuse on the personal data boundary | Scoring/letters will come alive after a local model, not by a flag |
| SP-T01/02/09 privacy/upload | Privacy of profiles and CVs (behind the flag), minimization, deletion of derived data, ownership tests | Real CVs — locally only; there is no OCR |
| SP-T08 DST/hiring/salary rules | TIME-01 with a DST-accurate window (`RULESET_VERSION` 3); SAL-01 an honest unknown | The cross-language cases are not measured (section D of the inventory) |
| SP-T10–17 budgets/queue | Spending ledger: atomic reserve, quotas, persistent counters, `npm run ai:holds`; the batch path is closed | Re-enabling the batch is an owner decision (the plan is in AI-006) |
| SP-T18–19 letters | Private CRUD, versions, a whole-body validator, If-Match, the evidence panel; generation behind the boundary | The repair loop — B9, until a local model |
| SP-T22 restore | Not implemented | Mandatory before beta |

The «не реализовано» [not implemented] item is gating backlog, not a passed check under the principle
«нет функции — нет ошибки» [no feature — no bug]. Before the corresponding feature is enabled,
real negative/integration/fault tests appear.
