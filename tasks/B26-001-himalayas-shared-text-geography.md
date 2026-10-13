# B26-001: Himalayas geography reads the posting text with the shared detector (B26)

**Status: accepted by the owner, 2026-10-13.** Implemented and checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B26,
found 2026-10-06 by B24-001. **Owner decision 2026-10-13:** the text may change a posting's
countries only when Himalayas claims worldwide (an empty `locationRestrictions`), the same
rule as Jobicy (B24); a source's own country list stands.

## Result and boundaries

**User result:** a Himalayas posting the source calls worldwide whose text says "must
reside in the US", "must be based in the United States" or "we are unable to hire in
Brazil" is no longer shown or matched as worldwide; today's single pattern ("must be based
in" plus one or two capitalized words, with "United States" in its map unreachable) missed
all three.

**Root cause.** `src/server/import/himalayas-fixture.ts` reads the text with its own
`RESTRICTED_COUNTRY_PATTERN`, much narrower than the shared `readTextGeography` that Jobicy
uses (B24), and applies it even to a posting with its own country list, letting the text
override the source.

**Measured on the local database (read-only, 996 Himalayas postings, 215 ms).**
- 67 the source calls worldwide: the shared detector finds no contradiction in any — no
  change.
- 916 with the source's own list: under the owner's rule the text is not consulted — no
  change. (Had the text kept overriding the list, 80 would have changed: 54 only by a
  recorded conflict, 20 from a precise list to an unknown region, 6 to other countries.)
- 13 restricted today by the narrow pattern ("must be based in Germany", …): the shared
  detector reads the same country from the same sentence. Their original lists are not
  stored: on the next import each keeps that country if its list is empty, or takes its
  own list.

**Change.**
1. `worldwideUnlessTextSays` moves from the Jobicy adapter to `geography-text.ts`, unchanged
   but for a `fieldPathOf(quote)` argument naming where a quote came from, so both sources
   share one rule.
2. Himalayas `geographyFor`: an empty list goes through `worldwideUnlessTextSays` (the source
   field as evidence, plus the text quote when it contradicts); a non-empty list stays the
   source's restriction, as today. The narrow pattern and its country map are removed. The
   hiring option and the snapshot carry the geography's evidence list.
3. A posting the source calls worldwide whose text does not contradict it maps to the same
   geography and the same evidence as before, so it gets no new version on the next import.

**Not changed:** the shared detector; Jobicy's behaviour; the workplace (office/temporary)
markers; the catalog gate (geography is not it, so no posting appears or disappears); no
migration.

**Risk: normal.** A domain rule in an import adapter, as B24: it changes what cards and
matching say about the affected postings. No rights, money or personal data.

**Data:** synthetic records in the tests; one read-only measurement above.

## Acceptance (fixed before the code)

1. Empty list + "Applicants must reside in the US": `restricted`, `["US"]`, exhaustive,
   conflict `geography-source-vs-text`; evidence: the source field (quote null) and the
   text quote (`rule`, 0.9, `field_path: "description"`). "Must be based in the United
   States" maps the same.
2. Empty list + a region ("must be based in Europe"): `restricted`, no countries,
   `exhaustive: false`, conflict recorded.
3. Empty list + "we are unable to hire in Brazil": `worldwide`, `excluded_countries: ["BR"]`,
   conflict recorded.
4. A list `[US]` + "must be based in Germany" in the text: `restricted` to US from the list,
   no conflict (the owner's rule; today it became DE).
5. Empty list + text without a rule ("we are based in San Francisco", "anywhere in the
   world"): `worldwide`, no conflict, and evidence identical to today's source-field form.
6. The synthetic fixture h-002 (empty list, "must be based in Germany or the Netherlands")
   stays `restricted` to DE and NL with the conflict; Jobicy's tests pass unchanged.
7. `npm run check`, `npm run test:db`, `npm run test:coverage`, `npm run build` and
   `npm run test:e2e` pass; thresholds not lowered.

## Plan

1. Tests first in `tests/unit/source-contract.test.ts`, next to acceptance 4 of S1.
2. Move the helper; the Himalayas `geographyFor`; the snapshot's evidence.
3. Checks; docs; the owner.

**Rollback:** `git revert`. A record already re-imported under the new rule returns on its
next import (the content hash covers the mapped snapshot).

## Approvals and limits

Owner decision 2026-10-13, in the session. No provider call, no spend, no fetch from the
source. Coding-host spend: not visible.

## Result (2026-10-13)

**What changed.**
- `src/server/import/geography-text.ts`: `worldwideUnlessTextSays` (moved from the Jobicy
  adapter, with a `fieldPathOf` argument); the header says both adapters use it.
- `src/server/import/jobicy-fixture.ts`: calls the shared helper; behaviour unchanged (its
  tests pass as they were).
- `src/server/import/himalayas-fixture.ts`: `geographyFor` tests only an empty list against
  the text, through the shared helper; a list stands. `RESTRICTED_COUNTRY_PATTERN`,
  `COUNTRY_ISO` and `detectRestrictedCountries` are removed. The hiring option and the
  snapshot carry the geography's evidence list.
- Tests: `tests/unit/source-contract.test.ts` — "himalayas: a worldwide claim the text
  contradicts is read by the shared detector" (1–3) and "himalayas: a source's own country
  list stands; text without a rule leaves worldwide as it was" (4–5); S1's acceptance 4
  (fixture h-002) still passes (6).
- Docs: `docs/OPEN_GAPS.md` (B26), `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change both new tests failed: "must reside in the US",
"United States", a region and an exclusion were missed, and a US list became DE.

**Mutation check:** 4 of 4 caught: the text consulted for every list; never consulted; the
quote's field path swapped; the hiring option's evidence reduced to the source field.

**Checks.** `npm run check` exit 0 (342 unit tests); `npm run test:db` exit 0 (104 tests);
`npm run test:coverage` exit 0 (446 tests; `geography-text.ts` 100 %; 83.49 / 87.31 / 92.42
against 82 / 86 / 91, thresholds unchanged); `npm run build` exit 0; `npm run test:e2e`
exit 0 (102 of 102, no visual baseline changed).

**When it shows.** The mapping runs at import: stored postings change on their next
`npm run import:himalayas` pass, and by the measurement above only the 13 narrowed today
can change at all.

**Limitations.** As for Jobicy (B24): states, cities and metro areas are not modelled (on a
worldwide claim they make the country set unknown); work authorization is a different
attribute; a source list that disagrees with the text is not flagged.
