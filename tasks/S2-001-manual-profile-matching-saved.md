# S2-001 — manual profile, explainable matching, saving

**Result:** a signed-in user creates a confirmable manual profile, sees a
deterministic explainable matching over the Himalayas snapshots (eligible /
needs_review / ineligible with reason codes) and saves jobs for themselves.

**Not included:** CV/upload (S3), letters, embeddings/LLM, hiding with reasons,
an applied mark, a DST-exact 12-month calculation (the seasonal minimum with
two points), account deletion (profiles only), a second source.

**Context:** spec 4.1/4.3, 9.2, 11, 13; the CandidateProfile/SearchProfile
schemas (03_DOMAIN_CONTRACTS.schema.json); SP 2, 8 (ownership + negative tests
of two users), 7 (Matching without generative tokens).

## Acceptance
1. Auth: next-auth@4.24.15 (a JWT session, httpOnly), registration with an
   scrypt hash; private operations only via the server session;
   unauthorized → 401.
2. Profile: country (ISO-2|null), an IANA timezone, availability windows,
   target roles, cooperation forms, zero_mandatory_attendance, a minimum
   salary (currency/period/strict), show_needs_review; saving = a new version
   (version history is kept); deletion deletes all of the user's profile
   versions.
3. Matching: deterministic rules v1 (geography, employment, attendance,
   salary, overlap) with the outcomes pass/fail/unknown/not_applicable, reason
   codes from the base set of spec 13.2; AND-within-option /
   OR-between-options aggregation; the remote/lifecycle/policy gates →
   not_evaluated is not shown.
4. Explanation: for every card — a list of rules with outcomes, reason codes
   and an explanation; needs_review in a separate visible tab; ineligible is
   hidden.
5. Saving: save/unsave/list only for the owner; user B does not see or change
   A's saved items (a negative integration test).
6. unknown never becomes either fail or pass; an incomparable salary —
   SALARY_INCOMPARABLE, not a comparison through an invented rate.
7. Fixture backend: /matched is honestly empty (no source data), no mocks.

**Risk:** high (auth, personal data). A separate owner review before
acceptance; profiles do not go to any external service.

## Rollback
The migration cannot be dropped blindly: `DROP TABLE saved_jobs, search_profiles,
candidate_profiles, users CASCADE` only by owner decision; the UI pages
return to stubs via a commit revert.
