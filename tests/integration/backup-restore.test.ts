import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { localPool, migrate } from "../../scripts/db.ts";
import { localDatabaseUrl } from "../../src/server/config.ts";
import { checkLogin, registerUser } from "../../src/server/users.ts";
import { loginAttemptKey } from "../../src/server/auth-attempts.ts";
import { deleteAccount } from "../../src/server/account-deletion.ts";
import { saveJobForUser, saveProfileVersion } from "../../src/server/profile-service.ts";
import { hideJobForUser } from "../../src/server/feedback-service.ts";
import { HIDE_REASON_CODES } from "../../src/domain/feedback.ts";
import { saveCvUpload } from "../../src/server/cv/service.ts";
import { parsePlainText } from "../../src/server/cv/parse.ts";
import { createLetter, saveGeneratedRevision } from "../../src/server/letters/service.ts";
import { storeScore } from "../../src/server/relevance-service.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { BackupError, pgTarget, pgToolsFrom, runTool, toolInvocation } from "../../src/server/backup/pg-tools.ts";
import { takeBackup } from "../../src/server/backup/backup.ts";
import { restoreBackup } from "../../src/server/backup/restore.ts";
import { entriesHash, exportDeletions } from "../../src/server/backup/deletions.ts";

// DEPLOY-003 (SP-T22, tasks/DEPLOY-003-backup-restore.md): a backup taken before an account
// was deleted does not bring the account back. Runs against the isolated test database only;
// the restore works under `atlas_starter_test_restore` and parks the replaced database as
// `atlas_starter_test_before_restore`; a lost server is played by `atlas_starter_test_scratch`,
// a database that does not exist. pg_dump and pg_restore come from PG_BIN_DIR (CI: PGDG's
// postgresql-client-17), PATH, or PG_TOOLS_CONTAINER (a development machine).
const TEST_URL = localDatabaseUrl(process.env.TEST_DATABASE_URL, true);
const LIVE = "atlas_starter_test";
const STAGING = "atlas_starter_test_restore";
const PARKED = "atlas_starter_test_before_restore";
/** Not Nenaugad's database at first (only `users`, no ledger), then the lost server's name. */
const SCRATCH = "atlas_starter_test_scratch";
const ALL_NAMES = [STAGING, PARKED, SCRATCH, `${SCRATCH}_restore`, `${SCRATCH}_before_restore`];
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const tools = pgToolsFrom(process.env);
// B54: the login counter's key and the deletion's attempt count need the server secret. The
// B11 test's, already on the public list production refuses (DEPLOY-002).
delete process.env.NEXTAUTH_SECRET;
process.env.AUTH_SECRET = "b11-test-only-secret-not-a-real-one";

let pool: Pool = localPool(TEST_URL, true);
let backupDir = "";
const NOW = "2026-11-04T12:00:00.000Z";
const PASSWORD = "long-enough-password";
const MARK = randomBytes(5).toString("hex");
const CV_TEXT = `Инженер ${MARK}, React и Node.js, 5 лет опыта.`;
const LETTER_TEXT = `Synthetic letter ${MARK}.`;
const PROFILE_INPUT = {
  residenceCountry: "DE", timezone: "Europe/Berlin",
  targetRoles: ["engineer"], skills: [], employmentTypes: ["contractor"],
  availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
  zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
};
/** Every table that holds an account's personal data, by its user column (B11). */
const PERSONAL_TABLES = [
  "candidate_profiles", "search_profiles", "cv_uploads", "cover_letters", "saved_jobs",
  "hidden_jobs", "job_events", "job_relevance_scores", "profile_embeddings", "ai_batch_queue",
] as const;

type Account = { id: string; email: string; letterId: string };
const state: {
  a?: Account; b?: Account; c?: string; listedHere?: string; listedBefore?: number;
  beforeB?: Record<string, number>; snapshotId?: string;
  /** Taken before A's deletion; the one every restore below uses unless it says otherwise. */
  olderBackup?: string;
  /** Taken after A's deletion: the newest ledger, for a server whose database is lost. */
  newerBackup?: string;
  keptUsers?: string; keptEvents?: string; keptRevisions?: string;
  /** Deletion exports (db:export-deletions): one taken before the older backup, one after A's deletion. */
  deletionsBefore?: string; deletionsExport?: string;
} = {};
/** A, plus every account the backup holds although its ledger lists it. */
const deletedAgain = () => 1 + (state.listedBefore ?? 0);

function urlFor(database: string): string {
  const url = new URL(TEST_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

/** The admin connection: the maintenance database of the same server. */
async function admin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: urlFor("postgres"), connectionTimeoutMillis: 5000 });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}

async function databases(): Promise<Map<string, boolean>> {
  return admin(async client => {
    const result = await client.query(
      "SELECT datname, datallowconn FROM pg_database WHERE datname = ANY($1::text[])", [[LIVE, ...ALL_NAMES]]);
    return new Map((result.rows as { datname: string; datallowconn: boolean }[]).map(row => [row.datname, row.datallowconn]));
  });
}

/** Puts the test database back into one piece after an interrupted run. */
async function tidy(): Promise<void> {
  await admin(async client => {
    const live = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [LIVE]);
    if (live.rowCount) await client.query(`ALTER DATABASE "${LIVE}" WITH ALLOW_CONNECTIONS true`);
    for (const name of ALL_NAMES) await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  });
}

test.before(async () => {
  await tidy();
  await dropGuards(pool);
  // Resolved: the command reports the directory's real path (Windows may shorten TEMP).
  backupDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "nenaugad-backup-test-")));
});
test.after(async () => {
  await pool.end().catch(() => undefined);
  await tidy();
  if (backupDir) await rm(backupDir, { recursive: true, force: true });
});

function email(): string {
  return `deploy003-${randomBytes(5).toString("hex")}@example.invalid`;
}

async function seedSnapshot(): Promise<string> {
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const id = `himalayas:deploy003-${randomBytes(5).toString("hex")}`;
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'himalayas', $2, $3, $4::jsonb)",
    [id, `hash-${id}`, NOW, JSON.stringify({ ...template, id, source_record_id: id })]);
  return id;
}

/** An account with one row in every personal table, an AI operation and a login counter. */
async function seedAccount(snapshotId: string): Promise<Account> {
  const user = await registerUser(pool, email(), PASSWORD);
  const profile = await saveProfileVersion(pool, user.id, PROFILE_INPUT);
  await saveJobForUser(pool, user.id, snapshotId);
  await hideJobForUser({ pool, userId: user.id, snapshotId, reasonCode: HIDE_REASON_CODES[0]! });
  await saveCvUpload({ pool, userId: user.id, filename: "cv.txt", sizeBytes: 100, result: parsePlainText(CV_TEXT, "txt") });
  const letter = await createLetter({ pool, userId: user.id, jobSnapshotId: snapshotId });
  await saveGeneratedRevision({ pool, letterId: letter.id, userId: user.id, body: LETTER_TEXT, modelId: "test" });
  await pool.query("INSERT INTO job_events (user_id, snapshot_id, event_type) VALUES ($1, $2, 'impression')", [user.id, snapshotId]);
  await storeScore({ pool, userId: user.id, profileVersion: profile.version, modelId: "test",
    score: { snapshotId, score: 50, matchedSkills: [], missingSkills: [], explanation: "synthetic" } });
  await pool.query(
    "INSERT INTO profile_embeddings (user_id, profile_version, model_version, instruction_version, profile_text_version, embedding) VALUES ($1, $2, 'test', 'test', 'test', $3::vector)",
    [user.id, profile.version, `[${new Array(1024).fill(0.5).join(",")}]`]);
  await pool.query("INSERT INTO ai_batch_queue (id, user_id, openai_batch_id, profile_version) VALUES ($1, $2, 'batch_test', $3)",
    [`bq_${randomBytes(6).toString("hex")}`, user.id, profile.version]);
  await pool.query(
    "INSERT INTO ai_operations (id, owner_id, task_type, idempotency_key, status, input_hash, deadline_at, reserved_minor) VALUES ($1, $2, 'cover_letter', $3, 'uncertain', 'h', $4, 100)",
    [`op_${randomBytes(12).toString("hex")}`, user.id, `deploy003-${user.id}`, NOW]);
  await checkLogin(pool, user.email, "not-the-password");
  return { id: user.id, email: user.email, letterId: letter.id };
}

async function personalRows(account: Account, on: Pick<Pool, "query"> = pool): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of PERSONAL_TABLES) {
    const result = await on.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id = $1`, [account.id]);
    counts[table] = (result.rows[0] as { n: number }).n;
  }
  const revisions = await on.query("SELECT COUNT(*)::int AS n FROM cover_letter_revisions WHERE letter_id = $1", [account.letterId]);
  counts.cover_letter_revisions = (revisions.rows[0] as { n: number }).n;
  const user = await on.query("SELECT COUNT(*)::int AS n FROM users WHERE id = $1", [account.id]);
  counts.users = (user.rows[0] as { n: number }).n;
  return counts;
}

async function accountCount(id: string, on: Pick<Pool, "query"> = pool): Promise<number> {
  return ((await on.query("SELECT COUNT(*)::int AS n FROM users WHERE id = $1", [id])).rows[0] as { n: number }).n;
}

/** Every text column, in every table, that holds one of `needles` (the B11 sweep). */
async function columnsHolding(needles: readonly string[]): Promise<string[]> {
  const columns = await pool.query(
    "SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name) WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.data_type IN ('text', 'character varying', 'json', 'jsonb') ORDER BY 1, 2");
  const found: string[] = [];
  for (const { table_name, column_name } of columns.rows as { table_name: string; column_name: string }[]) {
    const hit = await pool.query(
      `SELECT 1 FROM "${table_name}" WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS n WHERE strpos("${column_name}"::text, n) > 0) LIMIT 1`,
      [[...needles]]);
    if ((hit.rowCount ?? 0) > 0) found.push(`${table_name}.${column_name}`);
  }
  return found;
}

/** Runs one of the two commands as the owner would, on the test database. */
async function runCommand(script: string, args: readonly string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ["--experimental-strip-types", path.join(REPO, "scripts", script), ...args], {
    cwd: REPO, env: { ...process.env, DATABASE_URL: TEST_URL, BACKUP_DIR: backupDir }, windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const status = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { status, stdout, stderr };
}

/** Criterion 4: no connection string, password or row content in what a command prints. */
function assertNothingPrivate(output: string): void {
  const url = new URL(TEST_URL);
  const secrets = [TEST_URL, decodeURIComponent(url.password), "postgres://", "postgresql://", MARK,
    state.a?.email ?? "", state.b?.email ?? "", "Инженер"].filter(Boolean);
  for (const secret of secrets) assert.ok(!output.includes(secret), `the output holds ${secret === MARK ? "row content" : "a secret"}`);
}

const failsWith = (expected: string) => (error: unknown) => error instanceof BackupError && error.message === expected;

async function assertLiveUntouched(): Promise<void> {
  const present = await databases();
  assert.equal(present.get(LIVE), true, "the live database exists and takes connections");
  for (const name of ALL_NAMES) assert.equal(present.has(name), false, `${name} is left behind`);
  const deletion = await pool.query("SELECT 1 FROM account_deletions WHERE user_id = $1", [state.a!.id]);
  assert.equal(deletion.rowCount, 1, "the live ledger still holds the deletion");
  assert.equal(await accountCount(state.a!.id), 0);
  assert.equal(await accountCount(state.b!.id), 1);
  assert.equal(await accountCount(state.c!), 1, "the account created after the backup is still live");
}

const GUARDED = ["users", "job_events", "cover_letter_revisions"] as const;

/** Removes what backupWithGuard adds to the live database, after an interrupted run too. */
async function dropGuards(on: Pick<Pool, "query">): Promise<void> {
  for (const table of GUARDED) {
    await on.query(`DROP RULE IF EXISTS deploy003_keep ON ${table}`);
    await on.query(`DROP TRIGGER IF EXISTS deploy003_keep ON ${table}`);
  }
  await on.query("DROP FUNCTION IF EXISTS deploy003_keep()");
}

/**
 * A backup taken while `table` keeps its rows on DELETE. A rule does so for a statement of
 * the restore's own (on users); a cascade it would stop raises an error in Postgres itself, so
 * for the cascaded tables a BEFORE DELETE trigger returning NULL skips the rows silently.
 */
async function backupWithGuard(guard: "rule" | "trigger", table: (typeof GUARDED)[number], name: string): Promise<string> {
  if (guard === "rule") {
    await pool.query(`CREATE RULE deploy003_keep AS ON DELETE TO ${table} DO INSTEAD NOTHING`);
  } else {
    await pool.query("CREATE FUNCTION deploy003_keep() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
    await pool.query(`CREATE TRIGGER deploy003_keep BEFORE DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION deploy003_keep()`);
  }
  try {
    return (await takeBackup({ url: TEST_URL, tools, dir: path.join(backupDir, name), repositoryRoot: REPO })).file;
  } finally {
    await dropGuards(pool);
  }
}

/** Runs a --replace, which needs every session on the live database closed. */
async function withoutPool<T>(work: () => Promise<T>): Promise<T> {
  await pool.end();
  try { return await work(); } finally { pool = localPool(TEST_URL, true); }
}

test("db:backup writes a private custom-format file outside the repository and prints no secret", async () => {
  await migrate(pool);
  state.snapshotId = await seedSnapshot();
  state.a = await seedAccount(state.snapshotId);
  state.b = await seedAccount(state.snapshotId);
  state.beforeB = await personalRows(state.b);
  for (const [table, n] of Object.entries(await personalRows(state.a))) assert.ok(n >= 1, `seeded ${table}`);
  // An account the ledger lists while `users` still holds it (a deletion's mutation check
  // leaves exactly that in a development test database): the backup carries both, and the
  // restore must delete it as well. Any such account already there is counted too.
  const listedHere = await registerUser(pool, email(), PASSWORD);
  await pool.query("INSERT INTO account_deletions (user_id) VALUES ($1)", [listedHere.id]);
  state.listedHere = listedHere.id;
  const listed = await pool.query("SELECT COUNT(*)::int AS n FROM users u JOIN account_deletions d ON d.user_id = u.id");
  state.listedBefore = (listed.rows[0] as { n: number }).n;
  assert.ok(state.listedBefore >= 1);

  // A deletions export taken just before the backup: older than it, so no newer ledger.
  state.deletionsBefore = (await exportDeletions({ url: TEST_URL, dir: path.join(backupDir, "deletions-before"), repositoryRoot: REPO })).file;
  const run = await runCommand("db-backup.ts", []);
  assertNothingPrivate(run.stdout + run.stderr);
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout) as { ok: boolean; file: string; bytes: number; sha256: string; database: string; postgresMajor: number };
  assert.equal(report.ok, true);
  assert.equal(report.database, LIVE);
  assert.equal(path.dirname(report.file), backupDir);
  assert.match(path.basename(report.file), /^atlas_starter_test-\d{8}T\d{6}Z\.dump$/u);
  assert.match(report.sha256, /^[0-9a-f]{64}$/u);
  assert.equal((await stat(report.file)).size, report.bytes);
  assert.ok(report.bytes > 1000);
  assert.deepEqual((await readdir(backupDir)).filter(name => name.endsWith(".dump") || name.endsWith(".partial")),
    [path.basename(report.file)], "no partial file is left");
  if (process.platform !== "win32") {
    assert.equal((await stat(report.file)).mode & 0o777, 0o600);
    assert.equal((await stat(backupDir)).mode & 0o777, 0o700);
  }
  state.olderBackup = report.file;
  // Created after the backup: a restore that copied the live database instead of the file
  // would keep it.
  state.c = (await registerUser(pool, email(), PASSWORD)).id;
});

test("a backup refuses a directory inside the repository and creates nothing", async () => {
  const inside = path.join(REPO, "deploy-003-backups");
  await assert.rejects(takeBackup({ url: TEST_URL, tools, dir: inside, repositoryRoot: REPO }), failsWith("BACKUP_DIR_INSIDE_REPOSITORY"));
  await assert.rejects(stat(inside));
});

test("backups in which a deletion cannot take effect are taken for the negative restores below", async () => {
  // Each guard travels in the dump; restored, it stops part of the ledger's deletion, which the
  // restore must notice instead of trusting the DELETE: on users itself, on a table with a
  // user_id (job_events), and on one without (cover_letter_revisions: a suppressed cascade).
  state.keptUsers = await backupWithGuard("rule", "users", "kept-users");
  state.keptEvents = await backupWithGuard("trigger", "job_events", "kept-events");
  state.keptRevisions = await backupWithGuard("trigger", "cover_letter_revisions", "kept-revisions");
});

test("a drill restores the older backup without the account deleted after it was taken", async () => {
  const a = state.a!;
  await deleteAccount(pool, a.id, PASSWORD);
  state.newerBackup = (await takeBackup({ url: TEST_URL, tools, dir: path.join(backupDir, "newer"), repositoryRoot: REPO })).file;
  // The 15-minute export (owner decision 2026-11-05): written when the ledger changed, not again.
  const exported = await exportDeletions({ url: TEST_URL, dir: path.join(backupDir, "deletions"), repositoryRoot: REPO });
  assert.equal(exported.written, true);
  assert.equal(exported.database, LIVE);
  assert.ok(exported.entries >= 2);
  const content = JSON.parse(await readFile(exported.file, "utf8")) as { entries: { userId: string }[] };
  assert.ok(content.entries.some(entry => entry.userId === a.id), "the export holds A's deletion");
  assert.deepEqual(Object.keys(content.entries[0] ?? {}).sort(), ["deletedAt", "userId"], "ids and times only");
  if (process.platform !== "win32") assert.equal((await stat(exported.file)).mode & 0o777, 0o600);
  const again = await exportDeletions({ url: TEST_URL, dir: path.join(backupDir, "deletions"), repositoryRoot: REPO });
  assert.deepEqual([again.written, again.file, again.entriesSha256], [false, exported.file, exported.entriesSha256]);
  state.deletionsExport = exported.file;
  // After a newer dump an export is written although nothing changed, so a missing one means the
  // export was failing (review 2, finding 4).
  const later = Date.now() + 3000;
  const dumpStamp = new Date(later - 1000).toISOString().replace(/\.\d{3}Z$/u, "Z").replace(/[-:]/gu, "");
  await writeFile(path.join(backupDir, "deletions", `${LIVE}-${dumpStamp}.dump`), "a newer dump");
  const afterDump = await exportDeletions({ url: TEST_URL, dir: path.join(backupDir, "deletions"), repositoryRoot: REPO, now: new Date(later) });
  assert.equal(afterDump.written, true);
  assert.equal(afterDump.entriesSha256, exported.entriesSha256);
  const settled = await exportDeletions({ url: TEST_URL, dir: path.join(backupDir, "deletions"), repositoryRoot: REPO, now: new Date(later + 1000) });
  assert.deepEqual([settled.written, settled.file], [false, afterDump.file]);
  const report = await restoreBackup({ url: TEST_URL, tools, file: state.olderBackup!, mode: "drill" });
  assert.equal(report.mode, "drill");
  assert.equal(report.liveLedger, "read");
  assert.ok(report.ledgerEntries >= 1);
  assert.equal(report.deletionGapAccepted, false);
  assert.equal(report.accountsDeletedAgain, deletedAgain(), "A was in the backup and deleted after it");
  assert.ok(report.attemptCountersCleared >= 2, "the restored counters of A and B are gone");
  assert.ok(report.accountsRestored >= 1);
  assert.match(report.latestMigration ?? "", /^\d{4}_[a-z0-9_]+\.sql$/u);
  assert.match(report.backupCreatedAt ?? "", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/u);
  assert.equal(report.replaced, false);
  assert.equal(report.previousDatabase, null);
  await assertLiveUntouched();
});

test("db:export-deletions prints counts and no id, secret or row", async () => {
  const run = await runCommand("db-export-deletions.ts", [`--dir=${path.join(backupDir, "deletions-cli")}`]);
  assertNothingPrivate(run.stdout + run.stderr);
  assert.ok(!(run.stdout + run.stderr).includes(state.a!.id), "no account id is printed");
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout) as { ok: boolean; written: boolean; entries: number; file: string };
  assert.deepEqual([report.ok, report.written], [true, true]);
  assert.match(path.basename(report.file), /^account-deletions-\d{8}T\d{6}Z\.json$/u);
});

test("the db:restore drill prints counts and no secret or row", async () => {
  const run = await runCommand("db-restore.ts", [state.olderBackup!, "--drill"]);
  assertNothingPrivate(run.stdout + run.stderr);
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout) as { ok: boolean; mode: string; accountsDeletedAgain: number };
  assert.equal(report.ok, true);
  assert.equal(report.mode, "drill");
  assert.equal(report.accountsDeletedAgain, deletedAgain());
  await assertLiveUntouched();

  const refused = await runCommand("db-restore.ts", [state.olderBackup!]);
  assertNothingPrivate(refused.stdout + refused.stderr);
  assert.equal(refused.status, 1);
  assert.equal((JSON.parse(refused.stderr) as { code: string }).code, "RESTORE_ARGUMENTS_INVALID");
});

test("a restore fails when a listed account, a row of one, or an orphaned row is left", async () => {
  await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.keptUsers!, mode: "drill" }),
    failsWith("RESTORE_DELETED_ACCOUNT_PRESENT"));
  await assertLiveUntouched();
  await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.keptEvents!, mode: "drill" }),
    (error: unknown) => failsWith("RESTORE_DELETED_ACCOUNT_PRESENT")(error) && (error as BackupError).facts.table === "job_events");
  await assertLiveUntouched();
  await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.keptRevisions!, mode: "drill" }),
    (error: unknown) => failsWith("RESTORE_ORPHAN_ROWS")(error) && (error as BackupError).facts.table === "cover_letter_revisions");
  await assertLiveUntouched();
  // The same through the command, as the owner sees it.
  const run = await runCommand("db-restore.ts", [state.keptUsers!, "--drill"]);
  assertNothingPrivate(run.stdout + run.stderr);
  assert.equal(run.status, 1);
  assert.equal((JSON.parse(run.stderr) as { code: string }).code, "RESTORE_DELETED_ACCOUNT_PRESENT");
  await assertLiveUntouched();
});

test("a corrupt file fails the restore and leaves nothing behind", async () => {
  const corrupt = path.join(backupDir, "corrupt.dump");
  await writeFile(corrupt, Buffer.concat([Buffer.from("PGDMP"), randomBytes(4096)]));
  await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: corrupt, mode: "drill" }), failsWith("PG_RESTORE_FAILED"));
  await assertLiveUntouched();
  await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: path.join(backupDir, "missing.dump"), mode: "drill" }),
    failsWith("RESTORE_FILE_NOT_FOUND"));
  await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.olderBackup!, mode: "drill", deletionsFrom: [corrupt] }),
    failsWith("DELETIONS_SOURCE_UNREADABLE"));
  await assertLiveUntouched();
});

test("a database without the ledger is not backed up, and an archive without it is not restored", async () => {
  await admin(client => client.query(`CREATE DATABASE "${SCRATCH}" TEMPLATE template0`));
  const scratch = new Client({ connectionString: urlFor(SCRATCH), connectionTimeoutMillis: 5000 });
  await scratch.connect();
  try {
    await scratch.query("CREATE TABLE users (id text PRIMARY KEY)");
    await scratch.query("INSERT INTO users (id) VALUES ('u_scratch')");
  } finally {
    await scratch.end();
  }
  // pg_dump succeeds, but the archive lacks the ledger: no file gets a final name.
  const dir = path.join(backupDir, "not-nenaugad");
  await assert.rejects(takeBackup({ url: urlFor(SCRATCH), tools, dir, repositoryRoot: REPO }),
    (error: unknown) => failsWith("BACKUP_INCOMPLETE")(error) && (error as BackupError).facts.missing === "account_deletions");
  assert.deepEqual(await readdir(dir), [], "the partial file is removed");
  // The same database dumped by hand: the restore finds no ledger to apply and refuses.
  const raw = path.join(backupDir, "no-ledger.dump");
  const dumped = await runTool(toolInvocation(tools, "pg_dump", pgTarget(urlFor(SCRATCH)), ["--format=custom", "--dbname", SCRATCH]),
    { stdoutFile: raw });
  assert.equal(dumped.exitCode, 0);
  await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: raw, mode: "drill" }), failsWith("BACKUP_SCHEMA_UNSUPPORTED"));
  await admin(client => client.query(`DROP DATABASE "${SCRATCH}"`));
  await assertLiveUntouched();
});

test("on a lost server the restore needs the newest ledger: a newer backup, or the owner's word", async () => {
  // SCRATCH does not exist now: the live database is gone, as after losing the server.
  const lost = urlFor(SCRATCH);
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill" }), failsWith("NEWER_DELETIONS_REQUIRED"));
  await assertLiveUntouched();
  // The owner's word: this is the newest backup. A, deleted after it, comes back: the gap the
  // runbook names, and the report says it was accepted.
  const gap = await restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill", newestBackup: true });
  assert.equal(gap.liveLedger, "absent");
  assert.equal(gap.deletionGapAccepted, true);
  assert.equal(gap.accountsDeletedAgain, deletedAgain() - 1);
  // A newer backup's ledger closes it, and so does a newer deletions export.
  for (const source of [state.newerBackup!, state.deletionsExport!]) {
    const closed = await restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill", deletionsFrom: [source] });
    assert.equal(closed.deletionSources, 1);
    assert.equal(closed.deletionGapAccepted, false);
    assert.equal(closed.accountsDeletedAgain, deletedAgain(), path.basename(source));
  }
  // A ledger source must be newer than the backup restored, and of the same database.
  for (const older of [state.olderBackup!, state.deletionsBefore!]) {
    await assert.rejects(restoreBackup({ url: lost, tools, file: older === state.olderBackup ? state.newerBackup! : state.olderBackup!, mode: "drill", deletionsFrom: [older] }),
      failsWith("DELETIONS_SOURCE_NOT_NEWER"), path.basename(older));
  }
  const foreign = path.join(backupDir, "foreign-deletions.json");
  const exported = JSON.parse(await readFile(state.deletionsExport!, "utf8")) as Record<string, unknown>;
  await writeFile(foreign, JSON.stringify({ ...exported, database: "atlas_starter" }));
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill", deletionsFrom: [foreign] }),
    failsWith("DELETIONS_SOURCE_FOREIGN"));
  await writeFile(foreign, "neither an archive nor an export");
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill", deletionsFrom: [foreign] }),
    failsWith("DELETIONS_SOURCE_UNREADABLE"));
  // The same name and the same entries, but another lineage: what a new server's own export is
  // on a real server, where the database names match (review 3, finding 1).
  await writeFile(foreign, JSON.stringify({ ...exported, lineage: randomUUID() }));
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill", deletionsFrom: [foreign] }),
    failsWith("DELETIONS_SOURCE_FOREIGN"));
  // The right lineage, but without a deletion the backup itself holds: no later copy of its ledger.
  const content = exported as { entries: { userId: string; deletedAt: string }[] };
  const fewer = content.entries.filter(entry => entry.userId !== state.listedHere);
  await writeFile(foreign, JSON.stringify({ ...exported, entries: fewer, entriesSha256: entriesHash(fewer) }));
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill", deletionsFrom: [foreign] }),
    failsWith("DELETIONS_SOURCE_INCOMPLETE"));
  await assertLiveUntouched();

  // A new server as the runbook builds it: migrated, budgets seeded with nothing spent, no
  // account. Its ledger exists but is empty and knows none of the backup's accounts, so it is not
  // the newest ledger (review 2, finding 1).
  await admin(client => client.query(`CREATE DATABASE "${SCRATCH}" TEMPLATE template0`));
  const fresh = new Pool({ connectionString: lost, max: 1, connectionTimeoutMillis: 5000 });
  try {
    await migrate(fresh);
    const budgets = await pool.query("SELECT id, scope, owner_id, period, approved_limit_minor FROM ai_budgets");
    for (const row of budgets.rows as { id: string; scope: string; owner_id: string | null; period: string; approved_limit_minor: string }[]) {
      await fresh.query("INSERT INTO ai_budgets (id, scope, owner_id, period, approved_limit_minor) VALUES ($1, $2, $3, $4, $5)",
        [row.id, row.scope, row.owner_id, row.period, row.approved_limit_minor]);
    }
  } finally {
    await fresh.end();
  }
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "drill" }),
    (error: unknown) => failsWith("NEWER_DELETIONS_REQUIRED")(error) && Number((error as BackupError).facts.accountsUnknownToLive) >= 2);
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "replace" }), failsWith("NEWER_DELETIONS_REQUIRED"));
  // The new server's own export, newer than the backup and with its empty ledger, is another
  // database's: refused, however it reached the box (review 3, finding 1).
  const own = await exportDeletions({ url: lost, dir: path.join(backupDir, "new-server"), repositoryRoot: REPO });
  assert.equal(own.entries, 0);
  assert.notEqual(own.lineage, (JSON.parse(await readFile(state.deletionsExport!, "utf8")) as { lineage: string }).lineage);
  await assert.rejects(restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "replace", deletionsFrom: [own.file] }),
    failsWith("DELETIONS_SOURCE_FOREIGN"));

  // --replace on the new server, with the export as the runbook does it: the restored database
  // takes the lost one's name, and the seeded zero budgets roll nothing back.
  const replaced = await restoreBackup({ url: lost, tools, file: state.olderBackup!, mode: "replace", deletionsFrom: [state.deletionsExport!] });
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.liveLedger, "read");
  assert.ok(replaced.accountsUnknownToLive >= 2);
  assert.equal(replaced.aiBudgetsRolledBack, 0);
  assert.equal(replaced.sameLineage, false, "the new server's database is another lineage");
  assert.equal(replaced.previousDatabase, `${SCRATCH}_before_restore`, "the new server's empty database is parked");
  await admin(client => client.query(`DROP DATABASE "${SCRATCH}_before_restore"`));
  const rebuilt = new Client({ connectionString: lost, connectionTimeoutMillis: 5000 });
  await rebuilt.connect();
  try {
    for (const [table, n] of Object.entries(await personalRows(state.a!, rebuilt))) assert.equal(n, 0, `${table} holds A's rows`);
    assert.deepEqual(await personalRows(state.b!, rebuilt), state.beforeB);
    assert.equal(await accountCount(state.c!, rebuilt), 0, "the account created after the backup is not in it");
  } finally {
    await rebuilt.end();
  }
  await admin(client => client.query(`DROP DATABASE "${SCRATCH}"`));
});

test("--replace refuses while another session uses the live database, and changes nothing", async () => {
  const held = await pool.connect();
  try {
    await assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.olderBackup!, mode: "replace" }),
      failsWith("LIVE_DATABASE_IN_USE"));
  } finally {
    held.release();
  }
  await assertLiveUntouched();
});

test("a --replace that fails after closing the live database opens it again and changes nothing", async () => {
  // Fails at the check, after the live database was closed to connections and its ledger read.
  await withoutPool(() => assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.keptUsers!, mode: "replace" }),
    failsWith("RESTORE_DELETED_ACCOUNT_PRESENT")));
  await assertLiveUntouched();
});

test("--replace refuses to roll the AI spending ledger back unless the owner accepts it", async () => {
  // A limit lowered after the backup (to 0, the kill switch): the restore would raise it again
  // (review 3, finding 3; untested until review 4).
  const budget = await pool.query("SELECT id, approved_limit_minor::text AS limit FROM ai_budgets WHERE owner_id = $1 AND scope = 'owner'", [state.b!.id]);
  const { id: budgetId, limit } = budget.rows[0] as { id: string; limit: string };
  assert.ok(BigInt(limit) > 0n);
  await pool.query("UPDATE ai_budgets SET approved_limit_minor = 0 WHERE id = $1", [budgetId]);
  await withoutPool(() => assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.olderBackup!, mode: "replace" }),
    (error: unknown) => failsWith("AI_LEDGER_WOULD_ROLL_BACK")(error)
      && Number((error as BackupError).facts.aiBudgets) >= 1 && Number((error as BackupError).facts.aiOperations) === 0));
  await assertLiveUntouched();
  // Spent after the backup: the restore would forget it.
  await pool.query(
    "INSERT INTO ai_operations (id, owner_id, task_type, idempotency_key, status, input_hash, deadline_at, reserved_minor, settled_minor) VALUES ($1, $2, 'job_extraction', $3, 'settled', 'h', $4, 100, 90)",
    [`op_${randomBytes(12).toString("hex")}`, state.b!.id, `deploy003-after-${MARK}`, NOW]);
  await withoutPool(() => assert.rejects(restoreBackup({ url: TEST_URL, tools, file: state.olderBackup!, mode: "replace" }),
    (error: unknown) => failsWith("AI_LEDGER_WOULD_ROLL_BACK")(error) && Number((error as BackupError).facts.aiOperations) >= 1));
  await assertLiveUntouched();
});

test("--replace restores the older backup: the deleted account is absent with everything it held (SP-T22)", async () => {
  const a = state.a!;
  const b = state.b!;
  const report = await withoutPool(() => restoreBackup({
    url: TEST_URL, tools, file: state.olderBackup!, mode: "replace", acceptAiLedgerRollback: true,
  }));
  assert.equal(report.mode, "replace");
  assert.equal(report.replaced, true);
  assert.equal(report.previousDatabase, PARKED);
  assert.equal(report.accountsDeletedAgain, deletedAgain());
  assert.ok(report.aiOperationsRolledBack >= 1, "the accepted rollback is reported");
  assert.ok(report.aiBudgetsRolledBack >= 1, "the lowered limit counts as a rollback");
  const listed = await pool.query("SELECT COUNT(*)::int AS n FROM users u JOIN account_deletions d ON d.user_id = u.id");
  assert.equal((listed.rows[0] as { n: number }).n, 0, "no account the ledger lists is left");
  assert.equal(await accountCount(state.listedHere!), 0, "the account listed in the backup's own ledger is gone");
  // The data came from the file: an account created after the backup is not there.
  assert.equal(await accountCount(state.c!), 0);

  // A: no account, no profile, letter, revision, CV text, event, score, saved or hidden job,
  // embedding (vector) or batch row; nothing anywhere names it but the ledger kept on purpose.
  for (const [table, n] of Object.entries(await personalRows(a))) assert.equal(n, 0, `${table} holds the deleted account's rows`);
  assert.deepEqual(await columnsHolding([a.id, a.email, loginAttemptKey(a.email)]), [
    "account_deletions.user_id", "ai_budgets.id", "ai_budgets.owner_id", "ai_operations.idempotency_key", "ai_operations.owner_id",
  ]);
  // B is back as it was in the backup.
  assert.deepEqual(await personalRows(b), state.beforeB);
  const ledger = await pool.query("SELECT 1 FROM account_deletions WHERE user_id = $1", [a.id]);
  assert.equal(ledger.rowCount, 1, "the restored database carries the deletion forward");
  const counters = await pool.query("SELECT COUNT(*)::int AS n FROM auth_attempts");
  assert.equal((counters.rows[0] as { n: number }).n, 0);
  // The replaced database is parked, closed to connections, for the owner to drop.
  const present = await databases();
  assert.equal(present.get(LIVE), true);
  assert.equal(present.get(PARKED), false);
  assert.equal(present.has(STAGING), false);
  await admin(client => client.query(`DROP DATABASE "${PARKED}"`));
  await pool.query("DELETE FROM job_snapshots WHERE id = $1", [state.snapshotId!]);
});
