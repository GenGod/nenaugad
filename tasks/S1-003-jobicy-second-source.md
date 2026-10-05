# S1-003 — the second source Jobicy (rights → adapter → activation)

**Result:** the Jobicy source is connected on the same track as Himalayas:
an owner approval of the rights matrix → an adapter (a 200-record window) →
cards with attribution in the catalog and matching → activation by a separate
owner decision.

**Not included:** the paid Bearer option of direct links ($0.01/record —
without a budget and a separate approval), the affiliate `?u=`, closure HEAD
checks (the next lifecycle task), taxonomy filters, MCP.

**Context:** spec 5.1/5.2 (Jobicy), 6 (rights), 11.1 (geography: a region ≠ a
list of countries); the registry jobicy (S02); a live smoke 2026-09-25: id — a
number, pubDate ISO+00:00, jobGeo = USA/UK/Anywhere/Europe…, jobDescription
HTML, salary nullable, a 200 window ≠ a full snapshot. Documentation: «normal
integrations do not require a separate agreement»; attribution + a canonical
URL are mandatory; polling ≤1/hour.

## Acceptance
1. The jobicy policy is approved by the owner (the matrix, terms_hash,
   valid_until); until then enabled=false and nothing works, rollback —
   without UI edits.
2. The mapper per the live contract: jobGeo "Anywhere"→worldwide; a concrete
   country → restricted ISO; regions (Europe/APAC) → region_text without an
   invented list of countries; pubDate ISO validation; excerpt=jobExcerpt; a
   salary without an invented currency; the HTML description only as text.
3. Import: the 200 window is always partial (absence ≠ closure, miss counters
   do not grow); idempotency and versions — as for Himalayas; a 6h poll gate.
4. Jobicy cards in the catalog/matching/saved with attribution and a backlink
   to the canonical Jobicy URL; the projection gates and the matching rules
   work without edits.
5. Negative tests: a disabled policy → 0 cards; invalid records are rejected;
   transport only in the allowlist (extend the fetcher with jobicy.com).
6. Activation is a separate owner decision; the e2e fixture backend does not
   change.

**Risk:** high (source rights). **Rollback:** enabled=false; the tables are
shared.
**Data:** public Jobicy listings; personal data are not involved.
