# S1-001 — the first approved source, one end-to-end scenario

**Result:** one approved source -> saving -> a public catalog/detail without personal
data and without AI.

**Dependency:** S0 accepted. This is the next task, not an instruction to bypass the
installation.
**Candidate:** Himalayas from the old spec; the current access, fields and rights are
rechecked. A working URL does not prove permission. Without approval only a contract
fixture of the future adapter is allowed, and the live feature stays off.

## Not included
A second source, profiles, salary analytics, embeddings, NLP agents, a public deploy.

## Context
Product spec sections 3–6 and 14, the source registry, the domain schema; SP sections
2,6–9.
StarterJob / atlas_demo_jobs must not be used as the real canonical contract.
Before changing the schema, map the actual SourceRecord/JobSnapshot and the UI projection.

## Acceptance
1. A valid source policy fixes the purpose, the restrictions and the owner review.
2. The real contract is verified / the fixture is explicitly marked, IDs and versions stable.
3. Repeating one import creates no duplicate and does not update the meaning without a
   text change.
4. Remote and geography are not mixed; unknown/contradictory data receive no fictitious
   verified status.
5. The card has the actual source, dates and an approved application route.
6. 429/5xx/an incomplete snapshot do not close jobs in bulk; there is a finite retry.
7. Disabling the source works without UI edits and does not turn on false mock results.

## Risk / limit
High (source rights, external ingress). A separate review is needed before live.
Without an external eligibility gate, continue local contracts, do not request every
file.
One task / at most two repair cycles; the owner assigns the new current task.

## Rollback
Disable the source; remove unconfirmed records from the public feed;
do not delete provenance or other people's data. Do not reset the schema blindly.
