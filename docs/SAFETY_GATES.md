# Protection before enabling a risk

**Update 2026-10-02 (FDOC-001):** the table was brought in line with the actual state
(previously it described the starter «до S1» [before S1] and was misleading). The gates themselves have not
changed — this is still the mandatory minimum that must be implemented
and verified BEFORE the corresponding risk is enabled; «реализовано» [implemented] below means exactly
this, and not permission to activate.

| Feature | Minimum gate | State in the code (2026-10-02) |
|---|---|---|
| Real source | A valid approval for each operation, contract, polling, attribution, provenance, correct closure | Implemented (S1-001…S1-005): source policies with rights matrices and terms_hash, Himalayas/Jobicy adapters, a polling scheduler and closure-checks in the worker, attribution and provenance on the cards |
| Private profile | A verified auth library/service, owner from the session, negative tests of two users, deletion | Implemented (S2-001): next-auth + scrypt, owner from the session only, negative tests, deletion of the profile and derived data (CV, events, vectors) |
| CV | Private storage, a parser without network, file/CPU/time/ZIP limits, schema, manual confirmation, deletion of derived data | Implemented (S3-001), except extraction into the profile: a private offline intake of txt/md/docx/pdf with limits and without network, behind the `UPLOADS_ENABLED` flag and with a gate on all routes (B22). Nothing is transferred into the profile automatically — field extraction is C1, still ahead |
| Paid AI | One allowed transport, approvals, atomic reserve, root attempts, quota, deadline, uncertain, cancellation, commit gate | Implemented (AI-001…AI-007): the single reviewed transport (guardrails), the purpose whitelist, the atomic reserve, persistent counters, quotas and the operation ceiling, deadline, uncertain with the manual `npm run ai:holds`, commit validation; the live switch `LIVE_AI_ENABLED` (currently `false`) |
| Letter | Private CRUD/versions, evidence, checking the whole body, up to one repair, protection of edits, review/copy without sending | Implemented (S4-001/002), except the repair loop: private CRUD and versions, a whole-body validator, the evidence panel, If-Match and version comparison; generation is closed by the personal data boundary until a local model; the repair loop is deferred (B9) |
| Beta | All relevant critical tests, manual review of real AI results, restore, observability, kill switch, owner acceptance | Not accepted: restore (SP-T22) is not implemented, there is no public deploy, there is no owner acceptance |

The SP 1.0 project limits are not purchased quotas. Neither an API key nor a bool means approval.
Do not apply source/PII/finance rights on the basis of generated output.

`npm run guardrails` is a limited static tripwire, not a firewall, not a pen test,
not proof of isolation and not a bypass of owner decisions.

Extending the list of allowed imports/transports in guardrails requires an explicit
review of that feature. Do not disable the check for the sake of a green CI.

## Local secrets
setup creates a random DB password in .env. It must not end up in git/archives/reports.
A provider key may sit in the local environment, but it is not a switch:
live calls are forbidden while `LIVE_AI_ENABLED` is not `true`, and personal data does not
leave the contour (`src/server/ai/personal-data-boundary.ts`, owner decision
2026-10-01). Do not publish the application through a tunnel with personal data. A useful
first security review before beta is a separate task, not an AI promise.
