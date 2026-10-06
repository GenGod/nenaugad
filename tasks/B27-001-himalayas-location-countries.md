# B27-001 — Himalayas location restrictions name their countries

**Status: implemented, 2026-10-06.** Tested locally; acceptance is with the owner.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B27, found by the
[B25-001](B25-001-jobicy-country-labels.md) measurement; spec 11.1 (the model holds the
allowed set, the completeness of the list and the original regional text; "Georgia"
alone must not be resolved automatically) and the himalayas paragraph of spec 5.2
(store the source's restrictions; an empty `locationRestrictions` is the source's
worldwide statement).

**Owner go-ahead:** 2026-10-06, this session ("implement B27"). The B25 owner decision
applies unchanged: an incomplete country list never fails a candidate.

## Result and boundaries

**User result:** a himalayas post restricted to "United States" names US on its card,
and matching passes a profile in the US and fails one in Germany instead of asking
every candidate for review. One employer's postings for Peru and for Chile are two
cards again, not one.

**Not included:**
- The text check (B26). A residence rule in the description still replaces the
  locations, as today.
- Stored records. The adapter maps what an import reads from now on. The himalayas
  pass resumes at its cursor (25 pages a run), so the 466 stored posts would only be
  re-read after the whole feed; retention tombstones them first. Re-mapping stored
  records rewrites local data and is a separate owner decision.
- Extending the country dictionary. A name outside it resolves through its `alpha2`
  code when the entry has one; otherwise the list is incomplete.
- Checking the live feed for `alpha2` codes: a live call is the owner's. The stored
  names prove that names arrive.
- Derived artifacts that key on the whole snapshot (embeddings, paid extraction):
  recorded separately.

**Context:** `src/server/import/himalayas-fixture.ts` (`normalizeLocations`,
`geographyFor`), `countryCodeOf` in `src/server/import/geography-text.ts`, GEO-01 and its
completeness rule (`src/domain/matching.ts`, B25), the card line
(`src/domain/snapshot-projection.ts`), the dedup key (`src/domain/dedup.ts`).

**Risk: normal.** An import adapter mapping: it changes what the catalog, matching and
dedup say about himalayas posts with location restrictions. No rights, money or personal
data.

**Data:** synthetic fixtures in the tests. One read-only measurement over the local
snapshots of the two approved sources (`derive_fields` is allowed); only country names
go into the repository.

## Acceptance (fixed before the code)

1. Location restrictions become the allowed countries. An entry resolves by its name
   through the shared dictionary, else by a well-formed `alpha2` code:
   `{alpha2: "DE", name: "Germany"}` → DE, `"United States"` → US,
   `{alpha2: "BH", name: "Bahrain"}` → BH, `{alpha2: "GE", name: "Georgia"}` → GE. Order
   is kept and duplicates dropped.
2. A list whose entries all resolve is complete (`exhaustive: true`). An entry that
   resolves to no country ("Georgia" without a code, "Europe") makes the list
   incomplete (`exhaustive: false`), so GEO-01 fails no one on it. With no resolved
   entry the countries stay unknown, as today.
   2b. *Added during implementation, after reading the code it replaces:* a non-empty
   list never becomes worldwide (spec 11.1). The old code dropped an entry without a
   name, so `[{}]` mapped to worldwide; such an entry is now a restriction without a
   country, and an empty name falls back to the `alpha2` code.
3. The names stay the original regional text (`region_text`, unchanged) and become the
   quote of the location evidence. `allowed_subdivisions` is empty: the entries are
   countries, not subdivisions.
4. On "United States" a US profile passes GEO-01 and a German one fails it (the job is
   ineligible); the card reads "Страны найма: US".
5. Two postings that differ only by their country ("Peru", "Chile") get different dedup
   keys and are no longer merged.
6. Unchanged: empty locations stay worldwide and still meet the text check; a residence
   rule in the text still decides (fixture h-002); the contract fixtures validate;
   jobicy is untouched.
7. Measurement over the local data: re-mapping the 498 stored himalayas records changes
   only the 466 with location restrictions, and only their geography and its evidence;
   the 7 wrong dedup groups split. The report gives the GEO-01 transitions and what a
   new version triggers downstream.

## Plan

1. `himalayas-fixture.ts`: a location entry resolves to a country (name first, then
   `alpha2`); `geographyFor` builds the list, its completeness, the region text and the
   evidence quote.
2. Tests in `tests/unit/source-contract.test.ts`, next to the worldwide test: the entry
   table, completeness, GEO-01, the card line and the dedup split.
3. The measurement: re-map the stored himalayas records with the old and the new code.
4. `docs/OPEN_GAPS.md`, `IMPLEMENTATION_STATUS.md`, this file.
5. Checks: `npm run check:agent` while iterating; then `npm run check`,
   `npm run test:coverage`, `npm run build` and `npm run test:e2e`.

**Rollback:** `git revert` the commit. Stored records are not touched by the change
itself; a record imported after it returns to the old mapping on its next import.

## Approvals and limits

Local code and tests only. No provider, no live AI, no paid source, no live fetch, no
write to the local database. The himalayas policy is unchanged. Coding-host spend: not
visible.

## Result (2026-10-06)

**What changed.**
- `src/server/import/himalayas-fixture.ts`: `normalizeLocations` resolves each entry to a
  country: its name through the shared dictionary (`countryCodeOf`), else its `alpha2`
  code when that is two capital letters. A known name decides, so a well-formed but
  wrong code such as "UK" never replaces GB. Every entry counts: an unreadable one is a
  restriction without a country. `geographyFor` puts the countries into
  `allowed_countries` (order kept, duplicates dropped), marks the list complete only when
  every entry resolved, keeps the names as `region_text` and makes them the quote of the
  `locationRestrictions` evidence; `allowed_subdivisions` is empty. Empty locations and
  the text check are unchanged.
- `package.json`: the branch-coverage ratchet rises from 85 to 86, because branch
  coverage now measures 86.07%.

**Measurement on the local data** (read-only scratch scripts, not committed):
- The old mapper reproduces all 498 stored himalayas snapshots, so the before/after
  comparison is sound.
- Exactly the 466 records with location restrictions change, and only in their geography
  and its evidence quote. 460 get a complete list (437 single countries). 6 hold names
  outside the dictionary (Bahrain, Kuwait, Oman, Georgia, Liberia, Côte d'Ivoire,
  Belize, Guyana, Haiti, Suriname), and the stored data has no codes: 3 become incomplete
  lists and 3 have no country. The 31 worldwide posts and the 1 text-restricted post do
  not change.
- GEO-01 only moves from `unknown` to `pass` or `fail`. A US profile gets 218 passes and
  242 fails, a German one 19 passes and 441 fails, a South African one 32 and 428.
- Exact dedup groups over the whole catalog: 7 before, 0 after. All 7 were one employer's
  postings for different countries; no new group forms.
- What a new version triggers once these records are re-imported: the embedding index
  re-embeds them on its next run (unchanged text, local CPU); `job_llm_fields` and
  `job_events` are empty, so no paid extraction and no seen state is invalidated today.
  Recorded as B28: after the first live extraction run, every such re-map would pay
  again.

**Tests.** Three new tests in `tests/unit/source-contract.test.ts`: the entry table (name,
code, Georgia only with a code, "UK" against its name, duplicates) down to the evidence
quote; completeness, malformed codes and unreadable entries, GEO-01 and the card line;
the Peru and Chile postings staying apart. Mutation check: all 10 realistic mutations,
each applied to the real code and reverted, fail at least one test. The first run caught
8: an empty-name fallback survived until its test asserted the whole geography, and one
mutation was written wrong (`[] && x` keeps `x`) and was re-run correctly.

**Scenario walk.** The real `SnapshotCard`, rendered to static HTML for synthetic posts:
"United States" → "Страны найма: US"; Peru and Chile → "Страны найма: PE, CL"; Georgia
without a code plus Poland → "Страны найма: PL (список неполный)"; an empty list reads
worldwide as before. Not walked in a browser: no stored record has the new mapping until
an import re-reads it, and nothing was written to the local database.

**Checks** (on the final code, 2026-10-06):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 297/297 (294 before, 3 new); Biome 234 files, 0 diagnostics; `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 366/366; 82.58% lines, 86.07% branches, 91.54% functions, against 82.56 / 85.87 / 91.49 before. Branches crossed the 86 floor, so the ratchet is now 82/86/91, and the run passes it |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.2 min); the visual baselines are unchanged |

Not run: CI on GitHub (B27 is not pushed). CI for `83ce062` (B24 and B25) passed.

**Acceptance:** 1–7 and 2b met and tested locally. No independent review was run: the
risk is normal, and AGENTS.md requires one only for high-risk diffs.

**Limitations.**
- Stored records keep their old geography until an import re-reads them. For the 466
  local himalayas posts that is after the whole feed, so retention tombstones them first;
  a one-off re-map of the local catalog is the owner's decision.
- Whether the live feed sends `alpha2` codes is unverified. Names arrive (the stored data
  proves it), and the 10 names outside the dictionary resolve only through a code.
- The text check still overrides the locations, and its own pattern is narrow (B26).

**Next small task:** the owner decides on re-mapping the stored records (B24, B25, B27)
and on B28 before the first live extraction run; otherwise B26, the himalayas text check.
