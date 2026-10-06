# REMAP-001 — Stored records take the current geography mapping

**Status: done on the local database, 2026-10-06.** Acceptance is with the owner.
Basis: the owner's decision of 2026-10-06, this session ("Re-map stored records"), on the
open item that [B25-001](B25-001-jobicy-country-labels.md) and
[B27-001](B27-001-himalayas-location-countries.md) left: a mapping change reaches a stored
record only when an import re-reads it. The himalayas pass resumes at its cursor and the
jobicy feed is a 7-day window, so the local records would keep their old geography until
retention tombstones them.

## Result and boundaries

**User result:** the local catalog shows what the current adapters say. The 466 himalayas
posts with location restrictions and the 52 jobicy posts whose label names countries
carry their hiring countries; matching passes or fails them instead of asking for
review, and the 7 wrong dedup groups are split.

**Not included:**
- A reusable re-map tool in the repository. Rebuilding an adapter's input from a stored
  snapshot depends on the mapping that produced it (after B27 the names live in
  `region_text`, no longer in `allowed_subdivisions`), so a general tool would corrupt
  records mapped by newer code. This is a one-off, guarded for today's shapes.
- Embeddings. Their text (title and description) does not change; the next
  `npm run embeddings:index -- --embedder=local` re-embeds the changed posts because
  their content hash moves (OPEN_GAPS B28).
- Live fetches, imports, extraction or any provider call.

**Context:** the import pipeline (`src/server/import/pipeline.ts`, `runSnapshotImport`)
and its PostgreSQL persistence (`src/server/storage/snapshots.ts`, `saveStore`), the two
adapters, the reconstruction already validated by the B25 and B27 measurements.

**Risk: normal.** It rewrites local development data only: no production, no money
(live AI is off, `job_llm_fields` is empty), no source rights (re-deriving fields from
stored data is `derive_fields`, allowed for both sources), no personal data. It is
reversible: a backup without posting text and a rollback that is exercised on the real
rows before the final write.

**Data:** the local snapshots of the two approved sources. The backup holds only the
fields the re-map may change (version, hiring options, evidence, conflicts, content
hash), so no posting text outlives retention in it. It lives in the gitignored
`backups/remap-2026-10-06/`.

## Acceptance (fixed before the run)

1. The write goes through the real pipeline and persistence, as if an import had re-read
   each record at its own `last_seen_at`: the version rises by one, the content hash is
   the pipeline's, `first_seen_at`, the excerpt, the miss count and every date stay.
2. Gates before any write, for every record that would change: the adapter input rebuilt
   from the stored snapshot maps to a valid snapshot; nothing outside geography and the
   geography evidence quote differs; the stored geography has the expected old shape;
   restoring the backup fields gives back the stored snapshot exactly. One failed gate
   writes nothing.
3. Exactly 52 jobicy and 466 himalayas records change; every other record is unchanged.
4. Reversible: the rollback restores every changed row to its stored state exactly,
   proven on the real rows (apply, roll back, compare with the state read at the start,
   apply again).
5. After the run, an import of the same mapped records changes nothing: every one is
   `seen`, so the stored hash is the pipeline's. Unchanged records are byte-identical,
   and GEO-01 outcomes and dedup groups match the B25 and B27 measurements (0 exact
   dedup groups).

## Plan

1. `backups/remap-2026-10-06/remap.mjs`: dry run by default, `--apply` to write;
   `rollback.mjs` restores from `backup.json`. Plain JavaScript, because the repository's
   `tsconfig` type-checks every `.ts` file, including this gitignored folder.
2. Dry run; then apply, verify, roll back, verify, apply, verify.
3. `IMPLEMENTATION_STATUS.md` and this file.

**Rollback:** `node --experimental-strip-types --env-file-if-exists=.env
backups/remap-2026-10-06/rollback.mjs` restores the changed rows from the backup.

## Approvals and limits

The owner asked for this run. Local database only. No provider, no live AI, no live
fetch. Coding-host spend: not visible.

## Result (2026-10-06)

**What ran** (scripts in the gitignored `backups/remap-2026-10-06/`, not committed):
- `remap.mjs` (dry run, then `--apply`): rebuilds each adapter's input from the stored
  snapshot, maps it with the adapters of `b8348c3`, and writes the changed records with
  `runSnapshotImport` and `saveStore` at each record's own `last_seen_at`. Every stored
  record has `fetched_at` equal to `last_seen_at`, so the dates do not move.
- `rollback.mjs`: restores the changed rows from `backup.json` and compares every row
  with `rows-before.json`, the per-row digests taken before the first write.
- `common.mjs`: the shared helpers, including the two input rebuilders the B25 and B27
  measurements validated.

**Sequence and evidence:**
1. Dry run: all gates passed on the 700 rows; the plan was jobicy 52 (43 complete lists,
   9 incomplete) and himalayas 466 (460 complete, 3 incomplete, 3 with no country),
   exactly the B25 and B27 measurements.
2. Apply: 518 rows changed and the other 182 stayed byte-identical. An import of the same
   mapped records afterwards reports every one `seen`, so the stored hashes are the
   pipeline's. GEO-01 over the changed rows: for a US profile 271 move from `unknown` to
   `fail`, 238 to `pass` and 9 stay `unknown`; for a German profile 476, 27 and 15.
   Exact dedup groups in the catalog: 0 (7 before).
3. Rollback: 518 rows restored; all 700 rows identical to the start state.
4. Apply again: the same results, and a byte-identical backup.
5. Independent checks afterwards: all 700 snapshots pass the contract; no himalayas record
   keeps names in `allowed_subdivisions`; 466 himalayas and 52 jobicy rows are at
   version 2. The dry run now refuses (`UNEXPECTED_SHAPE`): the guard keeps the script
   from rebuilding records mapped by the new code.
6. The real app (`npm run dev` on the local database), `/jobs`: of the 699 source cards,
   636 name their countries, 12 add "(список неполный)", 15 say "Страны найма не
   указаны" (the 12 jobicy region labels and the 3 himalayas names outside the
   dictionary) and 36 read worldwide. One stored post is excluded by the remote rules,
   as before.

**Backup:** `backups/remap-2026-10-06/backup.json` holds, for each of the 518 rows, only
the id, the old content hash, version, hiring options, evidence and conflicts; no
description, title or company. `rows-before.json` holds one digest per row.
`backup.rolled-back-1.json` is the identical backup of the proven rollback.

**Rollback:** `node --experimental-strip-types --env-file-if-exists=.env
backups/remap-2026-10-06/rollback.mjs`. It refuses a row an import has moved on since.

**Acceptance:** 1–5 met on the local database. No code changed, so the repository checks
were not re-run; their last run (`b8348c3`) passed. No independent review: the risk is
normal.

**Limitations.**
- The embeddings of the 518 rows now carry an old content hash; the next
  `npm run embeddings:index -- --embedder=local` re-embeds them (unchanged text, local
  CPU; OPEN_GAPS B28). The command refuses without `--embedder=local` by design, so the
  test double can never write vectors into a real database.
- The script is a one-off, guarded for the shapes of 2026-10-06. A later mapping change
  (B26, say) needs its own re-map, and B28 should be settled first.
- Found in passing: 199 of 202 jobicy card excerpts show literal HTML entities
  (`&hellip;`, `&amp;`, `&gt;`). Not related to geography; suggested as a separate task.
