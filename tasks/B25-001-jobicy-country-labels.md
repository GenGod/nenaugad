# B25-001 — Jobicy country labels keep their countries

**Status: implemented, 2026-10-06.** Tested locally; acceptance is with the owner.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B25, found by the
[B24-001](B24-001-jobicy-text-geography.md) measurement; spec 11.1 (the model holds the
allowed set, **the completeness of the list** and the original regional text; "Europe",
"EU", "EEA" and "EMEA" are not interchangeable with a country set).

**Owner decision (2026-10-06, this session):** a label that mixes regions and countries
("EMEA, LATAM, Canada, USA") keeps its named countries as an **incomplete list**
(`exhaustive: false`), and GEO-01 starts reading completeness: a candidate in a named
country passes, anyone else is `unknown`, never `fail`. The alternative, leaving mixed
labels unknown for everyone, was declined.

## Result and boundaries

**User result:** a jobicy post labelled "Canada, USA" or "Portugal" names its hiring
countries on the card, and matching passes a profile in a listed country and fails one
elsewhere instead of asking for review. A post labelled "EMEA, LATAM, Canada, USA" passes
a profile in Canada or the US, leaves everyone else in review, and its card says the
country list is incomplete.

**Not included:**
- Expanding a region (EMEA, LATAM, Europe, APAC) into countries. Spec 11.1 forbids it,
  and no local label names an unambiguous union such as the EU.
- The himalayas adapter. Its own geography is a separate gap (B26 and one found here).
- Showing the region names on the card. The card says the list is incomplete; the label
  stays in `region_text` and in the label evidence.
- Separators other than the comma the live feed uses. Such a label stays one unknown
  part, so its countries stay unknown, never invented.
- Re-mapping stored records. A stored record takes the new geography when the jobicy
  window lists it again; one that never reappears keeps today's honest unknown.

**Context:** `src/server/import/jobicy-fixture.ts` (`GEO_COUNTRY_ISO`, `geographyFor`),
the country dictionary in `src/server/import/geography-text.ts`, GEO-01
`src/domain/matching.ts` (`ruleGeography`, `RULESET_VERSION`), the card projection
`src/domain/snapshot-projection.ts` (`projectCard`), its two renderers
`src/components/snapshot-card.tsx` and `src/app/matched/page.tsx`, the dedup key
`src/domain/dedup.ts` (`geographyKey`, also the near-dup geography veto).

**Risk: normal.** A domain rule (GEO-01) and an import adapter mapping: they change what
matching and the card say about affected jobicy posts. No rights, money or personal data.

**Data:** synthetic fixtures in the tests. One read-only measurement over the local
snapshots of the two approved sources (`derive_fields` is allowed); only label shapes,
not posting text, go into the repository.

## Acceptance (fixed before the code)

1. A label made only of countries is the complete list. It maps to `restricted`, the
   countries in label order without duplicates, `exhaustive: true`, `region_text` = the
   label. Countries come from the shared dictionary, matched as whole names in any case:
   "Portugal" → `["PT"]`, "Canada,  USA" → `["CA", "US"]`, "Hong Kong", "Türkiye".
   GEO-01 passes a profile in a listed country and fails one elsewhere.
2. A label that also names a region or an unknown place keeps its countries as an
   incomplete list: "EMEA,  LATAM,  Canada,  USA" → `["CA", "US"]`, `exhaustive: false`,
   `region_text` = the label, no conflict. "Georgia" stays unknown, as in B24.
3. GEO-01 reads completeness. On an incomplete list a profile in a named country passes;
   any other profile is `unknown` (`LOCATION_UNKNOWN`) and the job is `needs_review`,
   never `ineligible`. An exclusion still fails first. Every other geography (worldwide,
   exclusions, complete lists, no countries) evaluates exactly as before.
   `RULESET_VERSION` becomes 4.
4. Labels without a country ("Europe", "EMEA", "APAC", "LATAM"), an empty label and
   "Anywhere" (with its B24 text check) map exactly as before. The three contract
   fixtures map identically.
5. The card and the matched page never show an incomplete list as the whole list: the
   card reads "Страны найма: CA, US (список неполный)"; a complete list reads as before.
6. Dedup keeps an incomplete list apart from the complete list of the same countries;
   every key that exists today is unchanged.
7. Measurement over the local data: of the 202 jobicy records only the 52 B25 labels
   change; no stored snapshot of either source has an incomplete non-empty list today,
   so the GEO-01 change alters no current outcome.

## Plan

1. `geography-text.ts`: export `countryCodeOf(name)`, a whole-name lookup in the same
   dictionary, ignoring case.
2. `jobicy-fixture.ts`: a label is split on commas and each part resolved through
   `countryCodeOf`; `GEO_COUNTRY_ISO` goes.
3. `matching.ts`: GEO-01 reads `exhaustive`; `RULESET_VERSION` 4.
4. `snapshot-projection.ts`: the card geography carries `exhaustive`, and
   `hiringCountriesText` builds the country line both renderers use.
5. `dedup.ts`: an incomplete list gets its own key.
6. Tests: `tests/unit/jobicy.test.ts` (the label table down to GEO-01 and the card),
   `tests/unit/matching.test.ts` (GEO-01 on an incomplete list),
   `tests/unit/dedup.test.ts` (the key).
7. The measurement: re-map the 202 stored jobicy records with the old and the new code,
   count incomplete lists in all stored snapshots, compare exact dedup groups.
8. `docs/OPEN_GAPS.md`, `IMPLEMENTATION_STATUS.md`, this file.
9. Checks: `npm run check:agent` while iterating; then `npm run check`,
   `npm run test:coverage` (the ratchet), `npm run build` and `npm run test:e2e`.

**Rollback:** `git revert` the commit. GEO-01 returns to ruleset 3 at once; an affected
stored record returns to its old geography on its next import, because the content hash
covers the whole mapped snapshot.

## Approvals and limits

Local code and tests only. No provider, no live AI, no paid source, no live fetch. The
jobicy policy is unchanged. Coding-host spend: not visible.

## Result (2026-10-06)

**What changed.**
- `src/server/import/geography-text.ts`: `countryCodeOf(name)` resolves a whole country
  name in any case through the B24 dictionary. A region, a state or an ambiguous name
  (Georgia) returns null.
- `src/server/import/jobicy-fixture.ts`: a label is split on commas and each part
  resolved. Countries only make the complete list (`exhaustive: true`); countries plus
  anything else make an incomplete one (`exhaustive: false`); no country maps as before.
  The ten-country `GEO_COUNTRY_ISO` map is gone, and every name it held is in the shared
  dictionary. The label stays `region_text` and `source_field` evidence, and no conflict
  is recorded: a label contradicts nothing.
- `src/domain/matching.ts`: GEO-01 reads `exhaustive`. On an incomplete list a named
  country passes and any other is `unknown` (`LOCATION_UNKNOWN`), never `fail`; an
  exclusion still fails first. `RULESET_VERSION` 4.
- `src/domain/snapshot-projection.ts`: the card geography carries `exhaustive`, and
  `hiringCountriesText` builds the country line, "CA, US (список неполный)" for an
  incomplete list. `src/components/snapshot-card.tsx` and `src/app/matched/page.tsx`
  use it.
- `src/domain/dedup.ts`: an incomplete list gets its own key (`…:partial`), so it never
  merges with the complete list of the same countries. Every existing key is unchanged.

**Measurement on the local data** (read-only scratch scripts, not committed):
- The old mapper reproduces all 202 stored jobicy snapshots, so the before/after
  comparison is sound.
- Exactly 52 records change, all from "restricted, no countries": 43 get a complete
  list (18 single countries, 25 lists) and 9 an incomplete one. No field outside
  geography changes. The 12 region-only labels (EMEA, Europe, APAC, LATAM) stay unknown.
- No stored snapshot of either source holds an incomplete list today, so the new GEO-01
  changes 0 outcomes over 700 posts and 17 profile countries.
- The effect for candidates once the records are re-imported: a jobicy GEO-01 outcome
  only moves from `unknown` to `pass` or `fail`. A US profile gains 20 passes and 29
  fails, a German one 8 passes and 35 fails; the 9 incomplete lists stay `unknown` for
  every country they do not name.
- Exact dedup groups: the same 7 before and after.
- Found along the way and recorded as B27: GEO-01 is unknown for 466 of the 498
  himalayas posts, because the adapter keeps their location restrictions as names. The
  same empty country set merges one employer's postings for different countries: all 7
  local dedup groups are such merges, 25 posts behind 7 cards.

**Tests.** `tests/unit/jobicy.test.ts`: three new tests (complete lists, incomplete
lists, labels without a country) down to GEO-01 and the card line; the B24 card
assertion now includes `exhaustive`. `tests/unit/matching.test.ts`: GEO-01 on an
incomplete list (a named country passes, any other is unknown, an exclusion still
fails). `tests/unit/dedup.test.ts`: an incomplete list does not merge with the complete
one. Mutation check: 18 of 19 realistic mutations, each applied to the real code and
reverted, fail at least one test. The survivor puts the `:partial` marker on region-only
keys too. That changes only how posts without countries group with each other, which is
the B27 merge rule, so no test pins today's key.

**Scenario walk.** The real `SnapshotCard`, rendered to static HTML for synthetic posts:
"EMEA, LATAM, Canada, USA" → "Страны найма: CA, US (список неполный)"; "Canada, USA" →
"Страны найма: CA, US"; "Portugal" → "Страны найма: PT"; "Europe" and "Anywhere" read
as before. Not walked in a browser: no stored record has the new mapping until the next
import, and writing synthetic records into the local database was not approved. The
matched page uses the same helper; typecheck and build cover its wiring.

**Checks** (on the final code, 2026-10-06):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 294/294 (289 before, 5 new); Biome 234 files, 0 diagnostics; `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 363/363; 82.56% lines, 85.87% branches, 91.49% functions, against 82.51 / 85.64 / 91.39 before; `geography-text.ts` 100 / 100 / 100, and every new line is covered. The 82/85/91 thresholds stay: no integer floor was crossed |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.4 min); the visual baselines are unchanged |

Not run: CI on GitHub (nothing is pushed).

**Acceptance:** 1–7 met and tested locally. No independent review was run: the risk is
normal, and AGENTS.md requires one only for high-risk diffs.

**Limitations.**
- A stored jobicy record takes the new geography only when the 7-day window lists it
  again; until then the 52 local records keep their unknown geography.
- The card says the list is incomplete but does not name the regions.
- Only commas separate label parts, as in the live feed.
- A region is never expanded, so region-only labels stay unknown.
- The dedup key does not read region text: posts without countries share one key. That
  is the merge rule B27 records.

**Next small task:** B27, the himalayas location restrictions as countries. It moves
466 of 498 local posts out of `unknown` and splits the 7 wrong dedup groups. It changes
that catalog, so its re-import needs the owner's go-ahead.
