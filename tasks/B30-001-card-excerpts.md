# B30-001 — Card excerpts: decoded once, and never blanked by an import

**Status: accepted by the owner, 2026-10-06.** Implemented and tested locally the same day.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B30. The entities were found by
[REMAP-001](REMAP-001-stored-geography.md) in the real catalog; the blanking was found
while scoping their fix.

**Owner decisions (2026-10-06, this session):** fix both defects in this task; decode the
200 stored jobicy excerpts in the local database in place, keeping the old values in a
gitignored backup that is deleted once the owner accepts.

## Result and boundaries

**User result:** a jobicy card reads "…medical records to…" and "R&D", not
"to&hellip;" and "R&amp;D". An import no longer erases the excerpt of a record it did
not fetch, so a card keeps its excerpt between runs.

**Not included:**
- `descriptionToText`, which decodes descriptions. Descriptions are not shown; its
  `&amp;`-before-`&lt;` order decodes "&amp;lt;" twice, which is noted, not changed.
- The excerpt the jobicy adapter feeds into its own text checks. It stays raw, so the
  snapshot, its content hash and its version do not move.
- The 2 excerpts already blanked locally. Their source text is gone; they return if the
  feed lists those postings again.
- Himalayas excerpts: none carries an entity locally, and the decoder is the jobicy
  adapter's.

**Context:** `src/server/import/jobicy-fixture.ts` (`jobicyExcerptOf`),
`src/server/import/jobicy-adapter.ts` and `src/server/import/himalayas-adapter.ts` (the
excerpt map each run builds), `src/server/storage/snapshots.ts` (`saveStore`; the
in-memory persistence in `himalayas-adapter.ts` already merges), the card
`src/components/snapshot-card.tsx`.

**Risk: normal.** The import's persistence and one text field. The excerpt lives outside
the snapshot and its content hash, so no version, vector or paid extraction moves. The
local cleanup rewrites one column of 200 rows, with a backup.

**Data:** synthetic excerpts in the tests; the local snapshots of the two approved
sources for the cleanup and the scenario walk.

## Acceptance (fixed before the code)

1. A jobicy excerpt's HTML entities are decoded once, at import: the named ones in use
   (`&hellip;`, `&amp;`, `&gt;`, `&lt;`, `&quot;`, `&apos;`, `&nbsp;` and common
   punctuation) and numeric ones (`&#8230;`, `&#x2026;`). In a single pass "&amp;hellip;"
   becomes "&hellip;", not "…". An unknown name, an invalid code point and a bare "&"
   stay as written.
2. An import writes the excerpt of every record it fetched (an empty one when the source
   gives none) and leaves every other stored excerpt alone. This is shown with the real
   PostgreSQL persistence: of two jobicy runs, the second lacks a record, and that
   record keeps its excerpt.
3. Neither fix moves a snapshot, its content hash or its version.
4. The 200 stored jobicy excerpts are decoded in place and nothing else in those rows
   changes. A backup of the old values exists until the owner accepts.
5. The real card shows the decoded excerpt (scenario walk in the browser).

## Plan

1. Tests first: `tests/unit/html-entities.test.ts` (the decoder table),
   `tests/unit/jobicy.test.ts` (`jobicyExcerptOf`),
   `tests/integration/snapshots.test.ts` (two runs on PostgreSQL; a fetched record
   without an excerpt).
2. `src/server/import/html-entities.ts`: `decodeHtmlEntities`.
3. `jobicyExcerptOf` decodes; the himalayas adapter maps every fetched record.
4. `saveStore`: an excerpt is written only for the records the run fetched.
5. The one-off cleanup in `backups/excerpts-2026-10-06/`.
6. Docs and checks.

**Rollback:** `git revert`. The cleaned excerpts stay decoded; the backup restores them
until it is deleted.

## Approvals and limits

Local code and tests; one column of the local database. No provider, no live AI, no
live fetch. Coding-host spend: not visible.

## Result (2026-10-06)

**What changed.**
- `src/server/import/html-entities.ts` (new): `decodeHtmlEntities` decodes in one pass.
  It covers the XML five, `&nbsp;`, `&hellip;`, dashes, curly quotes and `&bull;`, plus
  decimal and hexadecimal code points. An unknown name, a zero, surrogate or
  out-of-range code point and a bare "&" stay as written.
- `src/server/import/jobicy-fixture.ts`: `jobicyExcerptOf` decodes. The mapping still reads
  the raw excerpt, so no snapshot changes.
- `src/server/storage/snapshots.ts`: `saveStore` writes an excerpt only for the records in
  the run's map; every other row keeps its own. Inserts are unchanged.
- `src/server/import/himalayas-adapter.ts`: every fetched record gets a map entry, an empty
  one when the source has no excerpt. Without it, the fix above would keep a stale
  excerpt the source had dropped.

**The blanking, proven before the fix.** The new PostgreSQL tests failed on the old code
exactly as the local data had shown. After a second run, the records it did not fetch had
empty excerpts: jobicy 900002 and 900003, himalayas h-002 and h-003.

**Tests.** `tests/unit/html-entities.test.ts` (2: the table, single pass and kept text);
`tests/unit/jobicy.test.ts` (1: the excerpt function);
`tests/integration/snapshots.test.ts` (2: two jobicy runs whose window moves, and a
himalayas record fetched without an excerpt beside two not fetched). Mutation check: 9 of
9 realistic mutations fail at least one test. The mutations were: decoding twice, dropping
unknown names, no code-point check, no capital X, no ellipsis in the table, no decoding in
`jobicyExcerptOf`, the himalayas map skipping empty excerpts, `saveStore` rewriting every
excerpt, and `saveStore` never updating one.

**The local cleanup** (`backups/excerpts-2026-10-06/decode.mjs`, gitignored, not
committed). A dry run planned 200 of the 202 jobicy rows and no himalayas row. The apply
decoded 200, moved no other column (a digest of every other column per row), left every
excerpt as planned and no entity in any jobicy excerpt. The old values are in
`backups/excerpts-2026-10-06/backup.json`, to delete once the owner accepts; `--rollback`
restores them until then.

**Scenario walk.** The real `/jobs` on the local database shows 201 jobicy cards: 0 with a
literal entity, 199 excerpts ending in a real "…", 11 with "&" and 4 with ">". The 2 cards
without an excerpt are the 2 the old import blanked.

**Checks** (on the final code, 2026-10-06):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 302/302 (3 new); Biome 237 files, 0 diagnostics; `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 376/376; 82.67% lines, 86.33% branches, 91.60% functions, all three thresholds enforced; `html-entities.ts` 100 / 100 / 100 |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.0 min) |

Not run: CI on GitHub (not pushed).

**Acceptance:** 1–5 met and tested locally. No independent review was run: the risk is
normal. **Accepted by the owner 2026-10-06.** With that, the rollback of the local cleanup
is retired: `backups/excerpts-2026-10-06/backup.json` holds the 200 old excerpts, which
are posting text, and is to be deleted. Deleting it is left to the owner, because the
folder is gitignored and the deletion cannot be undone.

**Limitations.**
- The 2 blanked excerpts stay empty until the feed lists those postings again.
- The decoder knows the entities the feeds use plus common punctuation; any other named
  entity shows as written until it is added.
- `descriptionToText` keeps its own two-step decoding (see "Not included").

**Next small task:** B29 (the index embedding a tombstone's blank text), or B31 and B32
before live AI.
