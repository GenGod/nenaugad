# B40-001: talent-pool postings are not shown, matched or extracted (B40)

**Status: accepted by the owner, 2026-10-13.** Implemented and checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B40,
found 2026-10-07. **Owner decision 2026-10-13:** hide them — not shown in the catalog, not
matched, not extracted (no spend); detected by a fixed list of title phrases; the import
still stores them, so the rule can change later without data loss.

## Result and boundaries

**User result:** "Join Our Talent Community", "Talent Pool", "General Application – …" and
the like no longer appear in the catalog, on a job page, or in the matched feed, and
extraction does not pay for them. Today 5 of 1398 local postings (all Himalayas):

| Title | Company |
|---|---|
| Join Our Talent Community | 86Borders |
| Talent Pool | Cyntegrity |
| Case Manager - TALENT POOL | ReWorks Solutions |
| Talent Network Application - Contract Public Relations & Communications Professi… | Curley & Pynn |
| General Application - CMMC Services | Coalfire |

**The rule.** A title containing "talent community", "talent pool" or "talent network", or
"general application" or "open application" (whole words, any case) names an invitation to
a candidate pool, not a vacancy. Checked against all 1398 local titles: exactly the five
above; the 26 titles that contain "talent" or "application" otherwise (Talent Acquisition,
Talent Sourcer, Application Developer, Application Security, Business Applications…) do not
match.

**Change.**
1. `isTalentPoolTitle(title)` in `src/domain/vacancy.ts` (pure): the rule above.
2. `classifySnapshot` (`src/domain/snapshot-projection.ts`) answers `excluded` for such a
   posting. That gate is shared by the snapshot catalog, the job page (it reads the same
   cards) and the matched feed (counted as not evaluated), so they all drop it at once.
3. The extraction pass skips such a posting before any spend and counts it
   (`not_a_vacancy`), as it does a tombstone.

**Not changed:** the import and the stored snapshots (the rule applies on read, so it can be
changed later without re-importing); the synthetic catalog (no such postings); the batch
path (closed); a letter already created for such a posting stays readable.

**Risk: normal.** It changes what the catalog and the matched feed show, and removes paid
calls, never adds them.

**Data:** the local database read-only for the check above; the isolated test database. No
provider call, no spend.

## Acceptance (fixed before the code)

1. `isTalentPoolTitle`: true for the five titles above and for each phrase in any case;
   false for the near misses (Talent Acquisition Partner, Talent Sourcer, Mobile
   Application Developer, Staff Application Security Engineer, Product Manager – Business
   Applications, Head of Talent & Performance) and for an empty title.
2. `classifySnapshot`: a snapshot that is `main_catalog` becomes `excluded` when its title is
   a talent pool, and nothing else about it changes the answer.
3. The extraction pass, over a source with a talent-pool posting and an ordinary one, calls
   the transport for the ordinary one only and counts the other in `not_a_vacancy`;
   nothing is reserved for it.
4. `npm run check`, `npm run test:db`, `npm run test:coverage`, `npm run build` and
   `npm run test:e2e` pass; thresholds not lowered.

## Plan

1. Tests first: 1–2 in `tests/unit/vacancy.test.ts`; 3 in
   `tests/integration/extraction-pass.test.ts`.
2. `vacancy.ts`; the gate; the pass.
3. Checks; docs; the owner.

**Rollback:** `git revert`. No data migration (nothing stored changes).

## Approvals and limits

Owner decision 2026-10-13, in the session. No provider call, no spend. Coding-host spend:
not visible.

## Result (2026-10-13)

**What changed.**
- `src/domain/vacancy.ts` (new): `isTalentPoolTitle`.
- `src/domain/snapshot-projection.ts`: `classifySnapshot` answers `excluded` for a talent
  pool, right after the lifecycle check.
- `src/server/ai/extraction-pass.ts`: a talent pool is skipped before any spend and counted
  in `not_a_vacancy`; the header lists the rule.
- Tests: `tests/unit/vacancy.test.ts` (new, 1–2); `tests/integration/extraction-pass.test.ts`
  — "a talent-pool posting is not extracted: no call, no reservation" (3).
- Docs: `docs/OPEN_GAPS.md` (B40), `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change the unit tests failed (no module) and the pass test
failed on the missing count.

**On the local catalog (read-only).** The snapshot catalog serves 1383 cards, none of them
a talent pool.

**Checks.** `npm run check` exit 0 (340 unit tests); `npm run test:db` exit 0 (104 tests);
`npm run test:coverage` exit 0 (444 tests; `vacancy.ts` 100 %; 83.52 / 87.33 / 92.41
against 82 / 86 / 91, thresholds unchanged); `npm run build` exit 0; `npm run test:e2e`
exit 0 (102 of 102, no visual baseline changed).

**Limitations.** A title rule: a pool named otherwise ("Future Opportunities", "Join our
team") still shows, and a real vacancy whose title contains one of the phrases would be
hidden (none in today's 1398 titles). Extending the list is a one-line change to
`vacancy.ts` and its test.
