# DEPLOY-003: backup and restore that re-applies account deletions (SP-T22)

**Status: accepted by the owner, 2026-11-05 ("Accept and commit").** Implemented and tested
locally; four independent reviews, the last with no blocking finding; committed on the
worktree branch `claude/cranky-ramanujan-fd4612`; not pushed, CI not run, not run on any
server. Slice of the
[single-VPS plan](DEPLOY-001-single-vps-plan.md) ("Slices", draft criteria 1–4), started
after DEPLOY-002 and DEPLOY-006 were merged into `main` (`f824c64`, CI green).

## Result and boundaries

**ID / name:** DEPLOY-003, backup and restore (SP-T22 "Restore after deletion: deleted data
is not returned to the user").

**User result:** the owner takes a database backup with one command, and restores one with
another; an account deleted after the backup was taken does not come back with the restore.
On the server, every deploy takes a backup first, and a timer takes one nightly.

**Not included:** buying or signing up for the off-site store or choosing the encryption tool
(owner decisions, part of D7; asked 2026-11-04, see "Owner decisions"); running anything on
the server (DEPLOY-007 runs the restore drill there); point-in-time recovery (WAL archiving);
restoring single accounts or tables; a UI.

**Context.**
- Deletion: B11-001 ([task](B11-001-account-deletion.md),
  [`src/server/account-deletion.ts`](../src/server/account-deletion.ts)). Deleting the
  `users` row removes every personal row through `ON DELETE CASCADE` (profiles, CV texts,
  letters and revisions, saved and hidden jobs, `job_events`, relevance scores,
  `profile_embeddings`, the batch queue) and records `account_deletions (user_id,
  deleted_at)` (migration 0021) in the same transaction; it also clears the account's two
  `auth_attempts` counters. Kept on purpose: `ai_operations`, `ai_budgets` (owner decision
  2026-10-13).
- The ledger lives in the database it describes. A backup taken before a deletion does not
  hold that deletion, so a restore has to read the ledger from the database it replaces.
- [`scripts/db.ts`](../scripts/db.ts), `localDatabaseUrl` in
  [`src/server/config.ts`](../src/server/config.ts): loopback only, database
  `atlas_starter` (or `atlas_starter_test`), no URL options.
- Server ([`deploy/README.md`](../deploy/README.md)): Postgres runs in Docker
  (`pgvector/pgvector:0.8.6-pg17`, 127.0.0.1:54329); nobody is in the `docker` group, so
  Docker needs root; the app user `nenaugad` runs every npm script; root runs only trusted
  binaries and root-owned scripts, never code from the checkout.
- [`deploy/nenaugad-release.sh`](../deploy/nenaugad-release.sh) refuses every deploy without
  `--no-backup` until this task lands.

**Risk: high (deletion).** xhigh effort, an independent `reviewer` pass, owner acceptance.

**Data:** the isolated test database (`atlas_starter_test`) and synthetic accounts only. No
backup file is ever written inside the repository or committed. No real CV, no server.

## Decision: how `pg_dump` and `pg_restore` run

The server has no Postgres client, and the database runs in Docker.

- **Chosen for the server: PGDG's `postgresql-client-17`** (apt.postgresql.org, the Postgres
  project's own signed repository; 17.11 for noble amd64 and arm64 on 2026-11-04), called by
  path from `/usr/lib/postgresql/17/bin` (`PG_BIN_DIR`). Why: `npm run db:backup` and
  `db:restore` then run as the unprivileged `nenaugad` user over 127.0.0.1 with the password
  from `.env`, like every other npm script. Running the tools inside the container needs
  `docker exec`, which is root on this server: root would have to run the checkout's code
  (which `nenaugad` can change) or a second, untested shell implementation of the restore.
  CI installs the same package, so the server's path is the one the tests run.
- **The version rule:** the client's major version must equal the server's
  (`PG_CLIENT_VERSION_MISMATCH` otherwise). `pg_dump` refuses a newer server by itself; an
  archive from a newer `pg_dump` is not guaranteed to load into an older server.
- **For a development machine without that client** (the owner's Windows machine has only
  PostgreSQL 18 tools): `PG_TOOLS_CONTAINER=nenaugad-db-1` runs the same tools inside the
  database container with `docker exec` (the exact server version by construction). Before
  use it checks that the container is the server `DATABASE_URL` reaches (same
  `system_identifier`). Development only: the runbook does not use it.

## Acceptance (fixed before the code)

1. **Backup.** `npm run db:backup` (or `-- --dir=<path>`) writes
   `<database>-<UTC time>.dump`, `pg_dump` custom format, into `BACKUP_DIR`, which must be an
   absolute path outside the repository (`BACKUP_DIR_REQUIRED`, `BACKUP_DIR_NOT_ABSOLUTE`,
   `BACKUP_DIR_INSIDE_REPOSITORY`); the directory is created mode 700, the file mode 600. The
   file gets its final name only after `pg_dump` exits 0 and `pg_restore` has read the whole
   archive and found the `users` and `account_deletions` data in it; otherwise the partial
   file is removed and the command fails. The client/server major versions must match.
2. **Restore.** `npm run db:restore -- <file> --drill|--replace` (one mode, required):
   - restores into a fresh database `<database>_restore` (a leftover one, from an
     interrupted run, is dropped first: nothing ever connects to that name), with
     `--single-transaction --exit-on-error`;
   - then, in one transaction there: adds the live database's `account_deletions` to the
     restored ledger, deletes every account the ledger lists (the cascade takes their rows),
     and empties `auth_attempts` (restored rate-limit counters are stale, and they hold the
     deleted accounts' keyed hashes);
   - then checks, with separate queries: no listed account is in `users`, and no table with
     a `user_id` column (other than `account_deletions`) holds a row of one. Any listed
     account left fails the command with `RESTORE_DELETED_ACCOUNT_PRESENT`;
   - if the live database has `users` but no ledger, it refuses (`LIVE_LEDGER_MISSING`); a
     live database that is absent or has no tables (a fresh server) counts as an empty
     ledger, and the report says so (`"liveLedger":"absent"`);
   - `--drill` reports and drops the restore database. `--replace` refuses while any other
     session is connected to the live database (`LIVE_DATABASE_IN_USE`: stop web, worker and
     the backup timer); it blocks new connections to the live database, reads its ledger
     through its own session, applies it, and only after the check renames, in one
     transaction, the live database to `<database>_before_restore` (connections stay
     blocked; the owner drops it after checking) and the restore database to
     `<database>`. `<database>_before_restore` already existing refuses before anything
     starts (`PARKED_DATABASE_EXISTS`);
   - on any failure: the restore database is dropped, the live database is left as it was
     (connections allowed again), exit 1. The restored data never sits under the name the
     app connects to before the check has passed.
3. **Integration test** on the isolated test database: accounts A and B, each with rows in
   every personal table; back up; delete A; restore the older backup with `--replace`:
   A is absent from `users`, both profile tables, letters and their revisions, CV texts,
   saved and hidden jobs, `job_events`, relevance scores, `profile_embeddings` (vectors) and
   the batch queue; B is present with all its rows; the restored ledger holds A; the previous
   database is parked with connections blocked. Negative paths: a backup in which the
   deletion cannot take effect (a `DO INSTEAD NOTHING` rule on `users`) fails with
   `RESTORE_DELETED_ACCOUNT_PRESENT` and leaves no restore database; a corrupt file fails
   with `PG_RESTORE_FAILED`; `--replace` with another session open fails with
   `LIVE_DATABASE_IN_USE`; after each, the live database is unchanged.
4. **No secrets or row contents in output.** Both commands print one JSON line: codes,
   counts, file name, sizes, a SHA-256, database names. The test runs both CLIs and finds in
   stdout and stderr neither the database password, the URL, either account's email, the CV
   text nor a profile value. The tools' stderr (which can quote rows) is never printed. The
   password reaches a tool only through `PGPASSWORD` in its environment, never its
   arguments, and that environment carries no other secret (`AUTH_SECRET`, `DATABASE_URL`,
   `OPENAI_API_KEY`, other `PG*` settings are not passed): unit-tested.
5. **Server.** `deploy/nenaugad-release.sh`: a deploy stops web and worker, then takes the
   backup by starting `nenaugad-backup.service` (the same path as the nightly one), before
   any checkout; a failed backup starts web and worker again, records nothing and stops.
   `--no-backup` stays as a stated, warned override (for example when the deployed commit
   predates `db:backup`). `deploy/systemd/`: `nenaugad-backup.service` (as `nenaugad`,
   sandboxed) and `nenaugad-backup.timer` (nightly). The encrypted off-site copy with 14
   daily and 8 weekly kept is written once the owner has chosen the tool and the store; the
   runbook section becomes a working procedure: client install, backup, restore, restore
   drill.
6. `npm run check` and `npm run test:coverage` pass (the ratchet raised if coverage rises,
   never lowered); `bash -n` on every changed shell script; an independent `reviewer` pass
   finds no blocking issue.

### Amendments after the first review (2026-11-05)

Recorded here rather than edited into the criteria above, which stay as fixed before the code.
Each makes the restore stricter, none looser:

- **Criterion 2, absent live ledger:** "counts as an empty ledger" became a refusal,
  `NEWER_DELETIONS_REQUIRED`, unless the owner names newer backups
  (`--deletions-from=<file>`, whose ledgers are applied too; each must be a newer archive of
  the same database) or states `--newest-backup` (the report then says
  `"deletionGapAccepted":true`). Raised by the review (should-fix 6) and, independently, by the
  deploy-planning session: on a lost server the newest ledger is in the newest backup, not in
  the one restored.
- **Criterion 2, the check:** it also fails on rows whose parent row is gone, for every foreign
  key (`RESTORE_ORPHAN_ROWS`; review minor item: a suppressed cascade into
  `cover_letter_revisions` was invisible). Before the swap, `--replace` re-checks that no other
  session is connected and that the live ledger has not changed (`LIVE_LEDGER_CHANGED`).
- **New: the AI spending ledger** (review should-fix 4): a restore does not carry `ai_budgets`
  and `ai_operations` forward, so `--replace` refuses with `AI_LEDGER_WOULD_ROLL_BACK` while the
  live ledger differs from the backup's, unless `--accept-ai-ledger-rollback`. Carrying it
  forward is a money task of its own, required before D6 (docs/OPEN_GAPS.md B68).
- **Criterion 1:** an existing `BACKUP_DIR` that others can read is refused
  (`BACKUP_DIR_NOT_PRIVATE`). Every tool runs with `TZ=UTC`, so archive times compare.
- **Criterion 5 (owner decision 2026-11-04, age + Hetzner Storage Box):** `deploy/nenaugad-offsite.sh`
  with `nenaugad-offsite.service` and `.timer`: encrypt each new dump with age to the owner's
  public key, upload over SFTP, compare its SHA-256 on the box, keep there every dump copied in
  the last 14 days and the newest copied in each of the 8 ISO weeks before (by root's upload
  records, not by the names: review 2), and the 3 newest here. Root holds the box's key; it
  lists, reads and deletes dumps only as the app user (`setpriv`).
- **New (owner decision 2026-11-05): the deletion ledger every 15 minutes.**
  `npm run db:export-deletions` writes `account-deletions-<UTC>.json` (format
  `nenaugad-account-deletions/1`: database, export time, the entries and their SHA-256) into
  `BACKUP_DIR`, mode 600, when the ledger changed since the newest export there or a dump was
  written after it;
  `nenaugad-deletions.service`/`.timer` run it as `nenaugad` and start the off-site copy on
  success; the box keeps the 4 newest exports, the server the 2 newest. `--deletions-from`
  accepts such an export as well as a dump: same database, made after the backup restored
  (to the second), its entries hashing to what it says, or it is refused.

## Plan

1. Tests first: unit tests for the tool invocations, the environment, the arguments and the
   directory rule; the integration test (3, 4).
2. `src/server/backup/` (tools, backup, restore), `scripts/db-backup.ts`,
   `scripts/db-restore.ts`, `package.json`, `.env.example`.
3. CI: install `postgresql-client-17` from PGDG in the Tests job, `PG_BIN_DIR`.
4. `deploy/`: release script, backup service and timer, runbook; the off-site stage after the
   owner's choice.
5. Checks, mutation check, `reviewer`, docs, handoff.

**Rollback:** `git revert`. No migration. The release script's `--no-backup` still deploys
without the backup units.

## Approvals and limits

Local code and the isolated test database. No server, no purchase, no account, no commit
or push without the owner's word. Coding-host spend: not visible. Repairs: at most two
cycles, each with a hypothesis recorded first.

## Owner decisions

- 2026-11-04, answered (relayed by the DEPLOY-006 session from the owner's own picks):
  encryption **age**, off-site store **Hetzner Storage Box**. No second store independent of
  Hetzner: the shared account is a known limit. Ordering the box and creating its credentials
  stay owner steps (deploy/README.md, Off-site copy). Nothing was bought or signed up for.
- 2026-11-05, answered (relayed by the DEPLOY-006 session): **"Export every 15 min"**. A timer
  exports `account_deletions` (account ids and deletion times only) every 15 minutes, written
  and uploaded age-encrypted only when it changed; a restore after losing the server re-applies
  it. Nothing beyond that.

### Options for the encrypted off-site copy (read 2026-11-04)

Read from the vendors' pages by a research agent; prices exclude VAT. Hetzner's pages carry no
date and Hetzner raised prices twice in 2026: confirm in the console before ordering. One dump
is about 13 MB today; 14 daily plus 8 weekly is about 300 MB.

**Encryption tool** (all free, Ubuntu 24.04 packages):

| Tool | Key | Retention | Note |
|---|---|---|---|
| age 1.1.1 | public key: the server holds only the public key and **cannot decrypt** its own backups; the private key stays with the owner | none (a script prunes) | small: one file in, one out |
| gpg 2.4.4 | public key, the same property | none | mature; keyrings and trust prompts are fiddly in a timer |
| restic 0.16.4 | a password **held on the server**: a compromised server reads every off-site copy | built in | SFTP, S3, B2 back ends |
| borg 1.2.8 | a key held on the server | built in | SSH only (Storage Box) |

**Off-site store** (becomes a processor under D7):

| Store | Cost at ~300 MB / ~5 GB a month | Where, how | Processor |
|---|---|---|---|
| Hetzner Storage Box BX11 | €3.20 (1 TB), no minimum term | Germany or Finland; SFTP, rsync, borg, restic; snapshots | Hetzner, already one: **no new processor**; not independent of a Hetzner account problem |
| Hetzner Object Storage | €6.49 base (1 TB) | S3; Object Lock listed | as above |
| Backblaze B2, EU Central | **$0** (first 10 GB free), then $6.95/TB | S3 or B2 API; Object Lock | **new**, US company (EU-US DPF per its notice; DPA with SCCs) |
| Scaleway Object Storage | about €0.004 / €0.07 | France; S3 | new, EU company; DPA not checked |
| The owner's own computer pulls over SSH | free | wherever it is | **none**; the server holds no credential that could delete the copies; the machine must be on, and it becomes the perimeter |

Sources: hetzner.com/storage/storage-box, docs.hetzner.com/storage/storage-box/general,
hetzner.com/storage/object-storage, backblaze.com/cloud-storage/pricing,
backblaze.com/company/dpa.html, backblaze.com/company/policy/gdpr,
scaleway.com/en/pricing/storage (search summary only), packages.ubuntu.com/noble.

**Suggested (the owner decides):** age + Hetzner Storage Box BX11: the server cannot read its
own off-site copies, the upload is plain SFTP, and the processor list does not grow. The
alternative for independence from Hetzner is age + Backblaze B2 EU, which adds a US processor.

## Independent review 1 (2026-11-05)

A `reviewer` agent (fresh context) read this file and the working-tree diff, and ran
`npm run check:agent` (462/462), `bash -n` and the integration test (10/10). **No blocking
finding**: the ordering that keeps deleted accounts deleted holds, every failure path traced
drops `_restore` and opens the live database again, secrets reach no argument and no output.
Six should-fix, six minor; what was done:

1. The runbook's prune ran as root over file names the app user controls (`xargs rm`): a
   crafted name could make root delete any file → it runs as `nenaugad` now (`app sh -c …`);
   the off-site script lists, reads and deletes dumps only as that user.
2. No test reached the cleanup after the live database is closed → a `--replace` that fails at
   the check (the kept-users backup) must leave it open, with nothing parked or left.
3. The positive test did not prove the data came from the file → an account created after the
   backup must be gone after `--replace`.
4. The AI spending ledger rolls back → guarded (`AI_LEDGER_WOULD_ROLL_BACK`), runbook,
   docs/OPEN_GAPS.md B68; the fix is a task of its own before D6.
5. "`is-active` must not say `active`" passes during a running oneshot (`activating`) → "must
   say `inactive` (or `failed`)".
6. An absent live ledger restored deleted accounts with `"ok":true` → refused unless
   `--deletions-from` or `--newest-backup` (amendment above).

Minor: the admission race → the swap re-checks sessions and the ledger; the checker gap for
tables without `user_id` → the orphan check over every foreign key; the uncaught `error` event
on a client → listeners; an existing `BACKUP_DIR` with mode 755 → `BACKUP_DIR_NOT_PRIVATE`;
renaming the parked database back → a runbook warning; the per-table form untested → a test
with a trigger that keeps `job_events` rows.

Found while fixing 6: a rule that swallows a cascaded delete makes Postgres itself fail the
statement ("referential integrity query … gave unexpected result"), so the restore fails closed
(`RESTORE_FAILED`, `XX000`). A `BEFORE DELETE` trigger returning NULL skips cascaded rows
silently; the per-table and orphan checks catch that, and the tests use it.

## Independent review 2 (2026-11-05)

A second `reviewer` agent (fresh context) reviewed the whole diff after the amendments, ran
`npm run check:agent` (465/465), the unit test (19/19), `bash -n` and the integration test
(14/14), and attacked the off-site script in a copy of the stub harness. **One blocking
finding**, one should-fix, three minor; what was done:

1. **Blocking: on the runbook's lost-server path the refusal never fired.** Steps 1–12 migrate
   the new database, so its ledger exists, empty, and read as the newest: a plain `--replace`
   brought back every account deleted after the dump, with `"ok":true`. → The live ledger
   counts as the newest only if the live database knows every account of the backup, as an
   account or as a deletion (`accountsUnknownToLive`); otherwise `NEWER_DELETIONS_REQUIRED`.
   The test builds the new server as the runbook does (migrated, budgets seeded with nothing
   spent) and must be refused, then restored with the export. Mutation: dropping the condition
   fails it. The AI-ledger guard now counts a budget only when the restored one shows less spent
   or held than the live one, so a new server's zero rows do not trip it. The runbook stops web
   and worker before the restore on a new server.
2. **Should-fix: the app user could make retention delete every copy on the box** by planting
   names dated later than the real dumps (reproduced: 22 planted names, 0 real copies left). →
   Retention follows root's own upload records (name, hash, upload time), never the names: every
   dump copied in the last 14 days stays, of older ones the newest copied in each of the last 8
   ISO weeks; copies the server did not record are never touched; names dated in the future or
   with an impossible time are skipped. Harness, 96 simulated nightly runs and the same attack:
   all 19 real copies stay; 30 days on, the planted files hold one weekly slot (the week they
   were planted in). Snapshots on the box are now a required step, and the runbook says what a
   compromised server can and cannot do.
3. Minor: an impossible date (`20261399`) stopped all pruning → skipped (above).
4. Minor: "no export newer than the dump" was ambiguous (exports only on change) → an export is
   also written after every new dump, so a missing one means the export was failing; tested.
5. Minor: the orphan check assumed the parent table is in `public` → it uses the parent's own
   schema.

## Independent review 3 (2026-11-05)

A third `reviewer` agent (fresh context) reviewed the review-2 fixes, ran `npm run check:agent`
(466/466), the unit test (20/20), `bash -n`, the integration test (14/14) and two attacks in a copy
of the harness. **One blocking finding**, two should-fix, two minor; what was done:

1. **Blocking: a new server's own export could pass as the newest ledger.** Setting up the new
   server ran a first backup and a first export (0 entries) before the restore; both were copied
   into the same directories on the box, newer than everything there; `--deletions-from` checked
   only the database name and the time, so the empty export was taken and the deleted accounts
   came back. → **Migration `0027_database_lineage.sql`**: each database gets one random id at
   migration, kept through dumps and restores; exports record it. A `--deletions-from` source must
   have the restored backup's lineage (`DELETIONS_SOURCE_FOREIGN` otherwise) and contain every
   entry of the backup's own ledger (`DELETIONS_SOURCE_INCOMPLETE`); a live database of another
   lineage never counts as the newest ledger. The test makes the new server's export and is
   refused; the runbook restores before the new server makes any backup or export.
2. Should-fix: an upload could overwrite a copy on the box this server never recorded (`-rm` of
   the target; reproduced) → a name the box already holds without a record is left alone and
   reported; the target is never removed.
3. Should-fix: the AI guard missed an approved limit lowered after the backup → a restored limit
   higher than the live one counts as a rollback.
4. Minor: one unreadable or non-regular file stopped every run → each file's failure is reported,
   the others still go, the run fails at its end; reads go through `timeout 600` as the app user.
5. Minor: planted exports could push out real ones (4 newest only); the runbook's weekly wording;
   a future-dated dump made the export run every time → exports also keep every copy of the last
   14 days; the wording says the oldest weekly copy is about 8 weeks old; dumps dated after the
   next hour do not count for the export.

## Independent review 4 (2026-11-05)

A fourth `reviewer` agent (fresh context) reviewed the review-3 fixes, ran `npm run check:agent`
(467/467), the unit test (21/21), `bash -n`, the integration test (14/14) and harness copies.
**No blocking finding.** The lineage fix holds on every lost- and new-server path it traced (a
new migrated server, one migrated only to 0026, an absent database, the new server's own export,
a server rolled back to an older backup and restored forward, a backup from before 0027); it
found no path that accepts an incomplete newest ledger without the owner's `--newest-backup`,
other than the owner naming an export that is not the newest, which the code cannot know.
Three should-fix and three minor findings; what was done (verified by the harness, a mutation
and the tests; not re-reviewed by a fifth agent):

1. The "never overwrite" check missed the last name of the box listing (a command substitution
   drops the trailing newline), and OpenSSH's default rename (posix-rename) replaces a target →
   the listing ends in a sentinel line; uploads use `rename -l` (plain SFTP rename, fails on an
   existing target); a listing whose connection fails (ssh 255) fails closed: nothing is copied
   or pruned, and the run fails. Harness: two unrecorded box copies, both planted locally, with an
   overwriting `rename` stub: both left alone, unchanged.
2. After a lost server the old server's copies stay on the box with no end (the new server
   prunes only what it recorded) → the runbook moves them aside (`nenaugad-lost-YYYYMMDD`) with
   a calendar date 8 weeks on to delete them.
3. The lowered-limit guard had no test → the test lowers B's limit to 0 after the backup and
   must be refused (`aiBudgets` ≥ 1, `aiOperations` 0); a mutation removing the comparison fails
   it. The runbook says when `--accept-ai-ledger-rollback` is safe on a new server.
4. Minor: the backup's own ledger, if unreadable, silently disabled `DELETIONS_SOURCE_INCOMPLETE`
   → `BACKUP_UNREADABLE`; a backup from before 0027 has no lineage → the runbook says only
   `--newest-backup` restores it; the failure count could wrap at 256 → a counter, not an exit
   status.

## Result (2026-11-05)

**What works (tested locally, against the isolated test database and a stub harness):**
- `npm run db:backup`: a pg_dump custom-format file, mode 600, outside the repository, named
  only after it was read back whole (criterion 1).
- `npm run db:restore -- FILE --drill|--replace`: restores into `<db>_restore`, deletes again
  every account in the backup's ledger, the live ledger and any newer ledger named with
  `--deletions-from` (a dump or a deletion export of the same database and lineage, newer,
  containing the backup's ledger), empties the attempt counters, checks that no listed account,
  no row of one and no orphaned row is left, and only then drops (`--drill`) or swaps in
  (`--replace`, the old database parked with connections closed). Refuses without the newest
  ledger (`NEWER_DELETIONS_REQUIRED`), while anything is connected, or when the AI spending
  ledger would roll back (criterion 2 and amendments).
- `npm run db:export-deletions`: the ledger every 15 minutes (owner decision 2026-11-05).
- Release script: a backup before every deploy, through `nenaugad-backup.service`; a failed
  backup starts web and worker again and changes nothing (criterion 5).
- Off-site (owner decision 2026-11-04): `nenaugad-offsite` encrypts with age and copies to the
  Storage Box over SFTP; retention by root's upload records; units for backup, export and copy.
- Criteria 3 and 4: the integration test (14 tests) and the unit test (21) below.

**Files.** New: `migrations/0027_database_lineage.sql`; `src/server/backup/{pg-tools,backup,
restore,deletions,cli}.ts`; `scripts/db-{backup,restore,export-deletions}.ts`;
`tests/unit/backup-tools.test.ts`; `tests/integration/backup-restore.test.ts`;
`deploy/nenaugad-offsite.sh`; `deploy/systemd/nenaugad-{backup,deletions,offsite}.{service,timer}`;
this file. Changed: `package.json` (three scripts), `.env.example` (`BACKUP_DIR`, `PG_BIN_DIR`,
`PG_TOOLS_CONTAINER`), `.github/workflows/ci.yml` (PGDG `postgresql-client-17`, `PG_BIN_DIR`),
`deploy/nenaugad-release.sh`, `deploy/README.md` (section "Backups and restore" and the steps
that lead to it), `README.md`, `reports/COVERAGE.md`, `docs/OPEN_GAPS.md` (C10, new B68),
`IMPLEMENTATION_STATUS.md`, `tasks/current.json`.

**Commands and exit codes (final run, 2026-11-05):** `npm run check` 0 (467/467);
`npm run test:coverage` equivalent 0 (622/622; lines 87.83, branches 89.31, functions 94.81
against 87 / 89 / 94: no whole step up, so the ratchet is unchanged); `bash -n` 0 on the three
`deploy/*.sh`; the integration test alone 0 (14/14). Locally the DB suites ran with
`node --env-file=<the main checkout's .env>` and `PG_TOOLS_CONTAINER=nenaugad-db-1` (this worktree
has no `.env`, and the agent may not copy one); CI runs them with PGDG's client.

**Mutation checks (each caught, source restored after each):** no live-ledger re-apply; no
re-deletion; no post-checks; restore database left on failure; live database not re-opened on
failure; no newest-ledger refusal; no AI-ledger guard; no orphan check; no unknown-accounts
condition; no lineage check (caught only after a test that isolates it was added); no
approved-limit comparison.

**Found on the way.** The local test database held 2 accounts its own ledger listed while
`users` still held them (most likely left by B11-001's mutation check); the first successful
restore deleted them, as it must, and the test now plants such an account. A rule that swallows
a cascaded delete makes Postgres fail the statement itself; a `BEFORE DELETE` trigger returning
NULL skips rows silently, which the checks catch.

**Not executed:** `npm run build` and `npm run test:e2e` (no page or route changed; the e2e
server uses the database the migration adds a table to); CI (needs a push: the PGDG install step
is unverified until then); `systemd-analyze verify`, `setpriv` under the off-site unit's sandbox,
the Storage Box's `ls`/`sha256sum` output, `rename -l` and `install-ssh-key` on a real box, and
every runbook step: nothing ran on a server (DEPLOY-007).

**Mock / live:** no live AI, no provider, no real CV; the off-site script ran only against stubs
(`setpriv`, `age`, `ssh`, `sftp`, `install`, `timeout`) in the scratchpad.

**Costs:** coding-host spend unknown (not visible). The Storage Box (BX11, €3.20/month excl.
VAT on 2026-11-04) is the owner's to order; nothing was bought.

**Limitations.** A restore rolls the AI spending ledger back (guarded, B68: fix before D6);
accounts deleted in the last ~15 minutes before a server loss come back; the off-site copies
share Hetzner's account with the server; a compromised app user can take the weekly slots of
the weeks it is active, root on the server can delete the box's copies, and the box's 7-day
snapshots are the protection; nothing alerts on a failed backup, export or copy yet (weekly
`systemctl --failed`); local development needs `PG_TOOLS_CONTAINER=nenaugad-db-1` in `.env` for
`npm run test:db` and `test:coverage` (the owner adds it); AGENTS.md still says "no restore"
(update on acceptance).

**Rollback.** `git revert` of the commit. Migration 0027 only adds a table (`DROP TABLE
database_lineage` undoes it, and nothing outside the backup code reads it). The release
script's `--no-backup` deploys without the backup units.

**Owner acceptance:** 2026-11-05, "Accept and commit", given in this session.

**Next small task.** Merge into main and push (the owner's word), watch the CI's PGDG step; then the heartbeat
could require a recent successful backup and copy (an alert instead of a weekly look); and the
AI spending ledger carried forward through a restore (B68, money, before D6).
