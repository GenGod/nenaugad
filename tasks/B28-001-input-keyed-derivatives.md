# B28-001 — Paid extraction and embeddings answer to their input text

**Status: implemented and independently reviewed, 2026-10-06.** Owner acceptance is open.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B28, found by
[B27-001](B27-001-himalayas-location-countries.md); the ledger's own rule in migration
0019 ("never a silent re-charge of the same input"); AGENTS.md (no SDK or queue retry may
reset a root operation's limit; money changes need a separate review).

**Owner decisions (2026-10-06, this session):** a paid extraction is keyed by its input,
not by the posting version; the embedding index likewise answers to its text. The
alternative, carrying a record forward from version to version, was declined.

## Result and boundaries

**User result:** a mapping change that leaves a posting's title, company and description
alone (B24, B25, B27, REMAP-001) costs nothing. Once live AI is on, the extraction pass
answers such a posting from its paid record instead of calling the provider again, and
the embedding index leaves its vector alone.

**Not included:**
- The import's version and content hash. They still move on any change of meaning; the
  seen-set and the version history rely on that.
- Sharing one paid record between two postings with the same text. A record belongs to
  its posting, and retention deletes it with the posting.
- The model version in the key. It is recorded in the provenance, as today.
- Tombstoned postings in the embedding index (found here, recorded separately).

**Context:** `src/server/ai/extraction-service.ts` (`extractionKey`,
`extractPostingFields`), `src/server/ai/extraction-store.ts`, `migrations/0019`,
`src/server/embeddings/embedding-service.ts` (`embeddingWork`, `storeChunk`),
`migrations/0017`, the worker's extraction pass (`scripts/worker.ts`,
`src/server/ai/extraction-pass.ts`), `scripts/extract-fields.ts`.

**Risk: high.** It changes how a paid operation is recognized as a repeat. A wrong key
either pays twice (today's defect) or, worse, answers a changed posting with an old
record. Negative tests, an independent review and the owner's acceptance are required.

**Data:** synthetic postings in the tests; a labelled mock transport, so nothing is
sent or paid. The migration runs on the local database (no extraction rows, 700
current vectors).

## Acceptance (fixed before the code)

1. The idempotency key and the stored record of an extraction are keyed by the posting,
   the prompt version and a hash of the exact input fields (title, company,
   description). A new posting version with the same three fields is answered from the
   stored record (`already_extracted` or `already_rejected`): no provider call, no new
   operation, no money.
2. A changed title, company or description is a new input: one new paid call, its own
   record. The earlier record stays, because a paid record is evidence.
3. The input hash is unambiguous: moving text between title and company changes it.
4. Migration 0020 re-keys `job_llm_fields` and refuses to run when the table holds rows
   (fail-closed: no live extraction has ever run, and existing rows would need a reviewed
   backfill). `snapshot_version` stays as the version a record was first paid for.
5. The embedding index re-embeds a posting only when the text it embeds (title and
   description) changes; any other change leaves the vector alone. Each vector stores
   the hash of its text (`job_embeddings.text_hash`); migration 0020 fills it for every
   vector that is current, so no re-embedding follows the deploy.
6. Unchanged: the refusals before any text moves (live AI off, unknown source, no
   `send_to_ai_provider`), the budget guards, the dense search and the near-dup reads.

## Plan

1. Tests first: `tests/unit/extraction-key.test.ts` (the key) and
   `tests/integration/extraction.test.ts` (a new version with the same input; changed
   text); `tests/integration/embeddings.test.ts` (text change vs other change; the SQL and
   JavaScript text hashes agree).
2. `migrations/0020_input_hashes.sql`.
3. `extraction-service.ts` and `extraction-store.ts`: the input hash, the key, the lookup
   and the stored column.
4. `embedding-service.ts`: the work list compares text hashes; `storeChunk` stores them.
5. The migration's refusal, checked once on the test database with a row in place.
6. Checks; then an independent reviewer pass; then the owner.

**Rollback:** `git revert` plus one manual SQL step, because the migration runner has no
down steps and the old code cannot insert into the re-keyed table (`input_hash` is
`NOT NULL`): `ALTER TABLE job_llm_fields DROP CONSTRAINT job_llm_fields_pkey,
DROP COLUMN input_hash, ADD PRIMARY KEY (snapshot_id, prompt_version, snapshot_version)`,
then delete the `0020_input_hashes.sql` row from `atlas_schema_migrations`. The old
primary key holds only if no two rows share a posting version by then. Also run
`UPDATE job_embeddings SET text_hash = NULL`: the old code never updates the column, so a
hash left in place could claim a text a later vector was not made from once B28 returns
(review finding 4). The cost is one re-embedding of the catalog after a re-apply.

## Approvals and limits

Local code and tests; the migration on the local and test databases. No provider, no
live AI, no spend. Coding-host spend: not visible.

## Result (2026-10-06)

**What changed.**
- `src/server/ai/extraction-service.ts`: `extractionInputHash` hashes exactly the fields
  `buildJobOnlyPrompt` sends (title, company, description, as a JSON array);
  `extractionKey` is `extraction:<posting>:<input hash>:<prompt version>`; the stored
  record is looked up and written by the input hash.
- `src/server/ai/extraction-store.ts`: records are keyed by
  (posting, prompt version, input hash); `snapshot_version` stays as the version first
  paid for.
- `src/server/embeddings/embedding-service.ts`: `embeddingTextHash`; `embeddingWork`
  compares the hash of the text it would embed with the stored `text_hash` and applies
  the limit after that filter; `storeChunk` stores the hash.
- `migrations/0020_input_hashes.sql`: the fail-closed re-key of `job_llm_fields` and the
  `text_hash` column with its backfill.
- Tests: `tests/unit/extraction-key.test.ts`; in `tests/integration/extraction.test.ts` a
  geography-only version answered from the paid record and a text change paying once;
  in `tests/integration/embeddings.test.ts` the old "changed content hash re-embeds"
  test is now "a text change re-embeds, a hash-only change does not", plus the limit
  and the database-versus-code hash agreement; `near-dup.test.ts` builds the new work
  shape.

**Repair cycle 1** (hypothesis recorded in `tasks/current.json` before the fix):
`tests/integration/extraction-pass.test.ts` failed whenever another file had left active
himalayas postings in the shared test database. Evidence: the pass paid for the contract
fixtures `h-002` and `h-003` (270 instead of 90) while answering its own `extp-pre` from
the record, so the keying was right. Its seed now clears the source it reads, as the
embeddings tests already do; it passes alone in that state and in the suite's order.

**Migration.** Its refusal was exercised on the test database: with a paid row in place it
raised and applied nothing; on an empty table it applied. On the local database 0020 is
applied: 700 of 700 vectors got their text hash, and `embeddingWork` returns nothing for
either source, so the database and the code hash every real posting alike and nothing
was re-embedded.

**Mutation check:** 9 of 9 realistic mutations fail at least one test. The mutations
were: the version back in the key, the company out of the hash, a plain concatenation,
lookup and store by version, any vector counting as current, the limit counting current
rows, a vector stored without its hash, and a hash over another text.

**Independent review** (fresh context, 2026-10-06): "ready for owner acceptance", with no
blocking finding. It verified the key against the prompt the provider receives (the
service and `scripts/extract-fields.ts`), the migration in a rolled-back simulation, and
700 of 700 real hashes on a read-only connection. It ran `npm run check:agent` (0) and
`npm run test:db` (72/72). Findings and what was done with them:
1. *The migration's guard looks only at `job_llm_fields`.* An old-format extraction
   operation still reserved or uncertain in `ai_operations` would be orphaned (its hold
   stays) and the input paid again under the new key. No such operation exists anywhere:
   live AI never ran, the local database has none, and CI starts empty. Changing 0020 now
   would break its checksum on both local databases. **Owner decision:** accept with
   this premise, or amend the guard and reset both databases' migration records.
2. *A stuck or terminal operation aborts the whole pass, and the worker then counts a
   healthy import as failed.* This existed before B28; B28 only removes the accidental
   escape a re-map used to give. Recorded as OPEN_GAPS B31.
3. *The pass slices to its limit before skipping answered rows, over an unordered read.*
   This existed before B28. Recorded as OPEN_GAPS B32.
4. *The rollback could leave a misleading text hash.* The rollback above now clears it.
5. *The hash-agreement test repeats the migration's expression instead of running it.*
   Accepted: a mismatch only re-embeds, and the local data agreed 700 of 700.
6. *The test-isolation fix is safe*, because the test pool refuses any database but the
   test one.
7. *`package.json` had lost the space between `--test-coverage-branches=86` and
   `--test-coverage-functions=91` in the B27 commit (`b8348c3`).* Node then silently
   dropped the function threshold. Fixed; an unreachable 99% function threshold now
   fails as it must.
8. *The model version is not in the key.* This is the task's decision, as before.

**Checks** (on the final code, 2026-10-06):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 299/299 (2 new); Biome 235 files, 0 diagnostics; `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 371/371; 82.62% lines, 86.06% branches, 91.56% functions; with the flag fixed all three thresholds (82/86/91) are enforced again |
| `npm run test:db` | 0 | 71/71 in the suite's order (the reviewer's run: 72/72) |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.1 min) |

Not run: CI on GitHub (not pushed).

**Acceptance:** 1–6 met and tested locally; the independent review is done. Owner
acceptance is open, together with the decision on review finding 1.
