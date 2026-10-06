# B24-001 — Jobicy geography reads the posting text

**Status: implemented, 2026-10-06.** Tested locally; acceptance is with the owner.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md)
B24, found by the [DEVX-004](DEVX-004-ci-jobs-coverage-lint.md) review; spec 11.1 (an
employer's exclusion beats a broad permission; "worldwide except X" is worldwide plus
excluded), spec 5.2 and SP 1.0 §2 (a source's worldwide claim holds only without a
contradiction in the description).

## Result and boundaries

**User result:** a jobicy post labelled "Anywhere" whose text says "applicants must
reside in the US" is no longer shown as worldwide. Its card names the hiring country,
a profile in Germany does not get it as a match, and the contradiction is recorded as
`geography-source-vs-text`, as the himalayas adapter already records it.

**Not included:**
- Country and region labels ("USA", "Europe"). The text is read only to test the
  worldwide claim; a specific label is already narrower than worldwide.
- Multi-country labels ("Canada, USA") and single countries missing from the label map
  ("Portugal"). They stay region text, an honest unknown; that is a separate gap.
- Work authorization and citizenship ("must be authorized to work in the US"). That is
  a different attribute, and no matching rule reads it.
- States, cities and metro areas. They are not modelled; on a worldwide label they make
  the country set unknown.
- The himalayas adapter, whose own detector is narrower. Changing it changes its
  catalog, so it is a separate task.

**Context:** `src/server/import/jobicy-fixture.ts` (`geographyFor`, `mapJobicyRecord`),
the himalayas counterpart `src/server/import/himalayas-fixture.ts:172`, catalog
visibility `src/domain/snapshot-projection.ts:44`, GEO-01 `src/domain/matching.ts:55`,
the import fingerprint `src/server/import/pipeline.ts:39`.

**Risk: normal.** A domain rule in an import adapter: it changes what the catalog and
matching say about affected jobicy posts. No rights, money or personal data.

**Data:** synthetic fixtures in the tests. One read-only measurement over the local
snapshots of the two approved sources (`derive_fields` is allowed); no posting text is
copied into the repository.

## Acceptance (fixed before the code)

1. "Anywhere" with "Applicants must reside in the US" in the text maps to `restricted`,
   `allowed_countries: ["US"]`, `exhaustive: true`, conflict `geography-source-vs-text`.
   The label stays as `source_field` evidence and the text quote is added as `rule`
   evidence (confidence 0.9). The post stays in the main catalog: geography is not the
   catalog gate, and the card no longer claims worldwide.
2. Matching for that post: a profile in DE fails GEO-01 and is not eligible; a profile
   in the US passes GEO-01.
3. "Anywhere" with a restriction that names a place outside the country dictionary (a
   region such as Europe or the Schengen Area, a state, an ambiguous name such as
   Georgia) maps to `restricted`, no countries, `exhaustive: false`. GEO-01 is
   `unknown`. It is never worldwide and never an invented country list.
4. "Anywhere" with "we hire worldwide, except in Brazil" or "we are unable to hire in
   Brazil" maps to worldwide with `excluded_countries: ["BR"]`, and the conflict is
   recorded. A profile in BR fails GEO-01; a profile in DE passes it.
5. No false contradiction. Each of these leaves an "Anywhere" post worldwide with no
   conflict: an office line ("we are based in San Francisco"), a privacy notice ("if you
   are located in the EEA"), "must reside outside of a 50 mile radius of our office", a
   negation ("you don't need to be based in the US"), "anywhere in the world", a benefit
   note "(US only)", a timezone requirement. The three contract fixtures map exactly as
   before.
6. Country and region labels map exactly as before. Over the 202 local jobicy snapshots
   only worldwide-labelled posts with a text restriction may change.

## Plan

1. `src/server/import/geography-text.ts`: `readTextGeography(text)` returns the
   restriction and the exclusion a text states, each with its quote. It uses anchored
   candidate-eligibility phrasing and a fixed country dictionary.
2. `geographyFor` in the jobicy adapter: a worldwide label consults the text; label and
   text evidence; the conflict.
3. Tests: `tests/unit/geography-text.test.ts` (a phrase table including the traps of
   acceptance 5) and `tests/unit/jobicy.test.ts` (the adapter and the GEO-01 outcome).
4. The measurement: re-map the 202 stored jobicy records before and after, and run the
   detector over all 700 local posts to check its precision by hand.
5. `docs/OPEN_GAPS.md` B24, `IMPLEMENTATION_STATUS.md`, this file.
6. Checks: `npm run check:agent` while iterating; then `npm run check`,
   `npm run test:coverage` (the ratchet), `npm run build` and `npm run test:e2e`.

**Rollback:** `git revert` the commit. An affected record that is already stored returns
to worldwide on its next import, because the content hash covers the whole mapped
snapshot.

## Approvals and limits

Local code and tests only. No provider, no live AI, no paid source. The jobicy policy is
unchanged. Coding-host spend: not visible.

## Result (2026-10-06)

**What changed.**
- `src/server/import/geography-text.ts`: `readTextGeography(text)` returns the
  restriction and the exclusion a posting states, each with its quote.
  - Restriction cues: "must reside/live/be based/be located in", "open to candidates
    residing in", "we can only hire in", "this role is based in", "work from anywhere
    in", and, followed by "only", "residents of X", "X-based candidates" and
    "Remote (X only)".
  - Exclusion cues: "worldwide, except X", "we are unable to hire in X", "not open to
    candidates in X".
  - Places come from a fixed dictionary of 104 countries (115 spellings), matched
    case-sensitively, with "the" allowed. A region, a state, a city or an ambiguous
    name resolves to no country. Georgia, Korea, England and America are left out on
    purpose.
  - Guards: a negated cue, "anywhere in the world", a time-zone rule and an unresolved
    "only" phrase are not rules. One unresolved rule makes the whole country set
    unknown.
- `src/server/import/jobicy-fixture.ts`: only a worldwide label consults the text. The
  label stays `source_field` evidence (`ev:…:geo`), the text adds `rule` evidence
  (`ev:…:geo:restriction` or `ev:…:geo:exclusion`, confidence 0.9, field path
  `jobDescription` or `jobExcerpt`), and `geography-source-vs-text` is recorded. When
  the text states no rule, the snapshot is exactly what it was.

**Measurement on the local data** (read-only scratch scripts, not committed):
- A re-map of the 202 stored jobicy records with the old code reproduces the stored
  snapshots exactly, so the before/after comparison is sound. With the new code, **0 of
  202 records change**: all five "Anywhere" posts say worldwide in their own text too.
  No stored record gets a new version on its next import. The three contract fixtures
  map identically.
- The detector over all 700 local posts (498 himalayas, 202 jobicy) took 177 ms.
  - On the 36 worldwide posts it finds **no contradiction**.
  - On restricted posts it finds 60 rules, and all 60 are genuine residence rules on
    reading: 39 resolve to countries; 21 stay unresolved (US states, Canadian
    provinces, sales territories, the EU, "Korea", "the country noted in this
    description").
  - Recall on live data cannot be measured: no local post with a worldwide label states
    a restriction. The synthetic phrase table covers the B24 shape.
- Found along the way and recorded: B25 (52 of 202 jobicy posts name countries in a
  label the map does not read) and B26 (the himalayas text check is narrower than this
  one).

**Tests.** `tests/unit/geography-text.test.ts` (8 tests: resolved, unresolved and
combined rules, the trap table, exclusions, the quote bound) and six new tests in
`tests/unit/jobicy.test.ts`: the B24 case down to the card and GEO-01, a region,
an exclusion, an excerpt-only rule, the traps, a country label. Mutation check: 14 of 15
realistic mutations, each applied to the real code and reverted, fail at least one test.
The uncaught one makes place names case-insensitive, a defensive choice with no
realistic input that tells the two apart.

**Checks** (on the final code, 2026-10-06):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 289/289 (275 before, 14 new); Biome 234 files, 0 diagnostics; `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 358/358; 82.51% lines, 85.64% branches, 91.39% functions, against 82.14 / 85.19 / 91.10 before; `geography-text.ts` 100 / 100 / 100. The 82/85/91 thresholds stay: no integer floor was crossed |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.2 min) |

Not run: CI on GitHub (nothing is pushed).

**Acceptance:** 1–6 met and tested locally. No independent review was run: the risk is
normal, and AGENTS.md requires one only for high-risk diffs.

**Limitations.** The cues are English, as jobicy's descriptions are. The country
dictionary is fixed, so a country outside it makes a rule unknown, never wrong. States
and cities are not modelled. An exclusion that names no country ("except sanctioned
countries") is not resolved. Work authorization and citizenship are not read.

**Next small task:** B25, reading multi-country jobicy labels. It needs one decision
first: a label that mixes regions and countries cannot be an exhaustive country list
while GEO-01 ignores `exhaustive`.
