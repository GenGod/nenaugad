# B59-001 — Himalayas time-zone lists are standard offsets, read as fixed ones

**Status: implemented and tested locally 2026-10-15; stored postings re-mapped; committed
and pushed at the owner's request the same day.** Owner decision the same day: read Himalayas lists as
standard (winter) offsets ("yes, go ahead with the winter offsets"). Found while looking into
why the owner's profile has 0 eligible postings ([PERF-001](PERF-001-matched-at-catalog-scale.md)
noted it; the owner asked "look into the 0 matches").

## Why the owner's profile has 0 eligible postings

Read-only, counts only, on 3,535 evaluated postings (2026-10-15):

- **The profile has no work country.** GEO-01 is `unknown` (`LOCATION_UNKNOWN`) for every
  posting, so no hiring option can pass and nothing can be eligible: 3,375 need review,
  160 are ineligible (contract type). This is the designed behaviour, and the page says
  so: B42's notice above both tabs ("Страна работы не указана в профиле…"). The profile
  also has no time zone. **Owner action:** set the country and the time zone in the
  profile.
- With a country and a time zone set (a what-if, the other fields as in the profile):
  Germany 24 eligible, United Kingdom 58, Brazil 69, United States (New York) 252,
  Georgia 5.

## The defect found on the way

Himalayas sends `timezoneRestrictions` as numbers of hours, and `scheduleFor`
(`himalayas-fixture.ts`) stores them as fixed UTC offsets (`zone_semantics:
"fixed_utc_offset"`). TIME-01 then samples the candidate's zone on the 15th of every
month (B12) and answers `unknown` when only part of the year is in the list.

The lists are the **standard offsets of the posting's allowed countries**:

| List (raw) | Postings | Allowed countries |
|---|---|---|
| `[-10,-9,-8,-7,-6,-5,14]` | 1,366 | US 1,366 |
| `[1]` | 358 | DE 142, PL 55, NL 27, AT 24, IT 18, FR 16 |
| `[2]` | 124 | ZA 63, GR 15, RO 13, EG 12 |
| `[0]` | 111 | GB 104 |
| `[0,1]` | 53 | ES 51 |

So a candidate in Berlin on a Germany-only posting is UTC+2 from April to October, not
in `[1]`, and the posting needs review; the same for London on a UK-only posting and New
York on a US posting (−4 in summer). Effect, as a what-if that also accepts each listed
offset plus one hour:

| Candidate | Eligible now → what-if | Needs review now → what-if |
|---|---|---|
| US, New York | 252 → 1,202 | 1,599 → 649 |
| US, Los Angeles | 1,202 → 1,202 | 642 → 642 |
| GB, London | 58 → 130 | 324 → 252 |
| DE, Berlin | 24 → 111 | 342 → 258 |
| PL, Warsaw | 34 → 78 | 262 → 221 |
| ZA, Johannesburg | 53 → 53 | 219 → 222 |

Los Angeles is unaffected because the list happens to contain its summer offset (−7, for
Mountain time); New York's −4 is not in it. The `14` in the US list is unexplained
(no US zone is UTC+14); with fixed offsets it only admits Kiribati.

## Decision for the owner

How to read a Himalayas list. Recommended: **as standard offsets** — a candidate passes
TIME-01 when their zone's standard offset (the smaller of its offsets over the year) is
listed, every month alike. It matches what the lists contain, and unlike "offset plus one
hour" it does not let a zone that is UTC+2 all year (South Africa) pass a Central-Europe
list. The alternative is to keep fixed offsets and accept that DST candidates see their
own country's postings in «Нужно уточнить» half the year.

## Plan (after the decision)

1. `source-contracts.ts`: `zone_semantics` gains `standard_utc_offset` (a contract
   change, with its validator); `himalayas-fixture.ts` sets it for Himalayas lists.
   Nothing else that uses `fixed_utc_offset` changes.
2. `matching.ts` TIME-01: for `standard_utc_offset`, compare the candidate zone's
   standard offset with the list; `RULESET_VERSION` 5.
3. A re-map of stored himalayas postings (the semantics live in the stored snapshot),
   guarded like REMAP-001, or re-reading them through imports.
4. Tests: Berlin, London, New York and Sydney (southern DST) on their own country's list;
   Johannesburg on `[1]` fails; the golden-set ranking guard unchanged or explained.

**Risk: normal** (a matching rule and a source mapping; no auth, money or rights change),
but it changes what candidates see, hence the owner decision. **Data:** read-only so far.

## Result (2026-10-15)

**Implemented, re-mapped on the local database and tested locally.**

- **Contract:** `zone_semantics` gains `standard_utc_offset` in
  `docs/solo/context/03_DOMAIN_CONTRACTS.schema.json` and `source-contracts.ts` (type and
  validator). `schema_version` stays 1.0.0: an added enum value, every stored snapshot
  stays valid.
- **Mapping:** `scheduleFor` (`himalayas-fixture.ts`) stores a stated Himalayas list as
  `standard_utc_offset`; no list, or one spanning every zone, is unchanged.
- **Rule:** TIME-01 (`matching.ts`) passes a `standard_utc_offset` list when the
  candidate zone's lowest offset of the year is listed. Only an `unknown` can become a
  `pass` there: a zone whose lowest offset is listed meets the list in some month, so it
  could not have failed; every other outcome is computed as before. `RULESET_VERSION` 5.
- **Tests, written first:** Berlin `[1]`, London `[0]`, New York and Los Angeles on the
  US list, Sydney `[10]` pass; Johannesburg on `[1]` fails; London on `[1]` and
  Casablanca on `[1]` stay unknown; no profile zone stays unknown; the fixed reading is
  unchanged. A sweep of 13 zones × 10 lists asserts the only difference between the two
  readings is unknown → pass. The mapping test checks the stored schedule. The rule test
  and the mapping test failed before the code.
- **Matching eval:** unchanged (NDCG@10 0.892; guards 0 and 0): the golden set uses
  fixed offsets.

### Re-map of the stored himalayas postings

One-off scripts in the gitignored `backups/remap-2026-10-15/` (REMAP-001's pattern, not
committed): `remap.mjs` (dry run, `--apply --expect=<n>`), `rollback.mjs`, `common.mjs`.

- Gates before any write: only active, non-tombstoned himalayas rows; `fetched_at` equals
  `last_seen_at`; every changed schedule equals what today's mapper stores for the same
  stored list; nothing but `zone_semantics` differs; the new snapshot passes the
  contract; restoring the backup gives the stored snapshot exactly; the backup holds no
  posting text; TIME-01 for Berlin, London, New York and Johannesburg changes only
  unknown → pass.
- Written through `runSnapshotImport` and `saveStore` at each row's own `last_seen_at`:
  version + 1, the pipeline's content hash, dates, excerpt and miss counts kept.
- **Sequence:** dry run (2,859 rows; TIME-01 unknown → pass: Berlin 435, London 136,
  New York 1,462, Johannesburg 0); apply (2,859 changed, 723 byte-identical, a re-import
  of the same records is `seen`); rollback (all 3,582 rows identical to the start);
  apply again (the same, a byte-identical backup); the dry run now plans 0.
- After: 3,582 of 3,582 snapshots pass the contract; himalayas schedules are 2,859
  `standard_utc_offset` and 122 `ambiguous`.
- **Side effect:** the content hash of 2,859 postings moved, so the seen-set (A6) lets a
  posting the owner already saw and skipped appear again once. Extraction and embeddings
  are keyed by their input text (B28) and do not repeat.

**Effect on the feed (3,535 evaluated postings, the owner's profile with only the country
and zone changed):**

| Candidate | Eligible before → after | Needs review before → after |
|---|---|---|
| US, New York | 252 → 1,202 | 1,599 → 649 |
| US, Los Angeles | 1,202 → 1,202 | 642 → 642 |
| GB, London | 58 → 130 | 324 → 252 |
| DE, Berlin | 24 → 111 | 342 → 255 |
| ZA, Johannesburg | 53 → 53 | 219 → 219 |
| The owner's stored profile (no country) | 0 → 0 | 3,375 → 3,375 |

### Checks

`npm run check` (unit 364/364, guardrails, lint, typecheck), `npm run test:coverage` (unit
and DB 486/486; 84.43% lines, 87.80% branches, 93.11% functions), `npm run test:e2e` (123
passed, visual baselines unchanged) and `npm run eval:matching` (unchanged), all exit 0.
Not run: `npm run build` (e2e runs on the dev server). No live call; no
spend; coding-host spend unknown.

### Changed files

`docs/solo/context/03_DOMAIN_CONTRACTS.schema.json`, `src/domain/source-contracts.ts`,
`src/server/import/himalayas-fixture.ts`, `src/domain/matching.ts`,
`tests/unit/matching.test.ts`, `tests/unit/source-contract.test.ts`; this file,
`tasks/current.json`, `docs/OPEN_GAPS.md` (B59), `IMPLEMENTATION_STATUS.md`.

**Rollback:** `git revert` for the code; for the stored rows, first
`node --experimental-strip-types --env-file-if-exists=.env backups/remap-2026-10-15/rollback.mjs`
(it refuses a row an import has moved on since). New imports store the new reading
whatever the rows hold.
