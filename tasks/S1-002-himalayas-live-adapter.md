# S1-002 — the Himalayas live adapter (fetch → saving → catalog)

**Result:** the real Himalayas source is imported into PostgreSQL and enters the public
catalog as cards with attribution — after the owner enables it.

**Not included:** a second source, worker/queue (a manual CLI run), the search endpoint,
full detail hosting (the full text is not published — only an excerpt + a backlink).

**Context:** the approved himalayas policy (d48bcfe); smoke 2026-09-24: guid = URL,
dates Unix seconds, totalCount ~100k, excerpt as a separate field. Spec 5.2, 6, 7, 14,
17; SP 2, 7, 8.

## Acceptance
1. Transport only in `src/server/import/fetcher.ts` (the guardrail allowlist): pinned
   https://himalayas.app, an opaque cursor with validation, `redirect: "error"`, a
   timeout, a size limit, 429/5xx → classified outcomes.
2. The import respects the policy: a refusal when disabled/pending, a poll gate ≥86400s
   (a failed run does not consume the window), retention 720h + deletion by staleness.
3. A cursor walk with a page budget and a checkpoint; the budget limit = partial
   (without miss accruals); a full walk = complete; 429/5xx do not touch records.
4. Migration 0002: `job_snapshots` (a CHECK kind/id, himalayas only) + `import_state`;
   a repeated import is idempotent (version grows only on a meaning change).
5. The card: an excerpt (not the full text), the attribution "Himalayas", a rel=nofollow
   backlink, the salary in its original form, geography without inventions; the S1-001
   projection gates apply.
6. Disabling the source (enabled=false) removes the cards without UI edits; a snapshots
   DB error is not masked by an empty successful status of the main catalog (the code
   is logged).
7. Activation is a separate owner decision: `enabled: true` + a diff review + smoke
   `scripts/smoke-himalayas.ts` + the first `npm run import:himalayas`; the e2e update
   (the catalog counter) — at activation time.

**Risk:** high (external ingress, rights). Negative/fault tests are mandatory.
**Rollback:** `enabled: false`; the 0002 tables stay (provenance), records are not
deleted blindly.
**Data:** only public Himalayas listings; CVs/profiles are not involved.
