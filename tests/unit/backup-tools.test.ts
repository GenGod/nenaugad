import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigurationError } from "../../src/server/config.ts";
import {
  BackupError, checkClientMajor, childEnvironment, connectClient, ignore, parseClientMajor, pgTarget, pgToolsFrom,
  requireClientMajor, runTool, toolInvocation,
} from "../../src/server/backup/pg-tools.ts";
import { backupDirectory, backupFileName } from "../../src/server/backup/backup.ts";
import { deletionsFileName, entriesHash, parseDeletionsExport } from "../../src/server/backup/deletions.ts";
import {
  archiveHeader, ledgerState, parseLedgerCopy, parseLineageCopy, restoreNames, withCleanupFacts,
} from "../../src/server/backup/restore.ts";
import { backupArguments, failureReport, restoreArguments } from "../../src/server/backup/cli.ts";

// DEPLOY-003 (tasks/DEPLOY-003-backup-restore.md): how pg_dump and pg_restore are called,
// what reaches them, and what the two commands accept and print.
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const PASSWORD = "p@ss:w/rd-not-real";
const URL_TEXT = `postgresql://atlas:${encodeURIComponent(PASSWORD)}@127.0.0.1:54329/atlas_starter`;
const PARENT_ENV = {
  PATH: "/usr/bin", Path: "C:\\Windows", HOME: "/srv/nenaugad",
  AUTH_SECRET: "a-secret", NEXTAUTH_SECRET: "another", DATABASE_URL: URL_TEXT,
  TEST_DATABASE_URL: URL_TEXT, OPENAI_API_KEY: "key", POSTGRES_PASSWORD: PASSWORD,
  PGHOST: "elsewhere.invalid", PGSERVICE: "other", PGSSLMODE: "disable", PGPASSWORD: "stale",
  DOCKER_HOST: "unix:///run/docker.sock",
};
const code = (expected: string) => (error: unknown) =>
  (error instanceof BackupError || error instanceof ConfigurationError) && error.message === expected;

test("the tools come from PG_BIN_DIR, PATH or one named container, never two at once", () => {
  assert.deepEqual(pgToolsFrom({}), { kind: "host", binDir: null });
  assert.deepEqual(pgToolsFrom({ PG_BIN_DIR: " ", PG_TOOLS_CONTAINER: "" }), { kind: "host", binDir: null });
  const dir = path.resolve("/usr/lib/postgresql/17/bin");
  assert.deepEqual(pgToolsFrom({ PG_BIN_DIR: dir }), { kind: "host", binDir: dir });
  assert.throws(() => pgToolsFrom({ PG_BIN_DIR: "usr/lib/postgresql/17/bin" }), code("PG_BIN_DIR_NOT_ABSOLUTE"));
  assert.deepEqual(pgToolsFrom({ PG_TOOLS_CONTAINER: "nenaugad-db-1" }), { kind: "container", container: "nenaugad-db-1" });
  for (const bad of ["db 1", "db;rm", "-it", "a".repeat(129), "$(id)"]) {
    assert.throws(() => pgToolsFrom({ PG_TOOLS_CONTAINER: bad }), code("PG_TOOLS_CONTAINER_INVALID"), bad);
  }
  assert.throws(() => pgToolsFrom({ PG_BIN_DIR: dir, PG_TOOLS_CONTAINER: "nenaugad-db-1" }), code("PG_TOOLS_AMBIGUOUS"));
});

test("a connection target is read from the validated URL, and a database name is checked", () => {
  assert.deepEqual(pgTarget(URL_TEXT), {
    host: "127.0.0.1", port: 54329, user: "atlas", password: PASSWORD, database: "atlas_starter",
  });
  assert.equal(pgTarget(URL_TEXT, "atlas_starter_restore").database, "atlas_starter_restore");
  assert.equal(pgTarget("postgres://atlas:x@[::1]/atlas_starter").host, "::1");
  assert.equal(pgTarget("postgres://atlas:x@localhost/atlas_starter").port, 5432);
  for (const bad of ["Atlas", "a-b", "a;b", "", "x".repeat(64)]) {
    assert.throws(() => pgTarget(URL_TEXT, bad), code("DATABASE_NAME_INVALID"), bad);
  }
});

test("on the host, the password reaches the tool only through PGPASSWORD, with no other secret", () => {
  const binDir = path.resolve("/usr/lib/postgresql/17/bin");
  const call = toolInvocation({ kind: "host", binDir }, "pg_dump", pgTarget(URL_TEXT), ["--format=custom", "--dbname", "atlas_starter"], PARENT_ENV);
  assert.equal(call.command, path.join(binDir, "pg_dump"));
  assert.deepEqual(call.args, [
    "--host", "127.0.0.1", "--port", "54329", "--username", "atlas", "--no-password",
    "--format=custom", "--dbname", "atlas_starter",
  ]);
  for (const argument of call.args) assert.ok(!argument.includes(PASSWORD) && !argument.includes("postgres"), argument);
  assert.equal(call.env.PGPASSWORD, PASSWORD);
  assert.equal(call.env.PGCONNECT_TIMEOUT, "10");
  assert.equal(call.env.TZ, "UTC", "archive times are written and read in UTC");
  for (const name of ["AUTH_SECRET", "NEXTAUTH_SECRET", "DATABASE_URL", "TEST_DATABASE_URL", "OPENAI_API_KEY",
    "POSTGRES_PASSWORD", "PGHOST", "PGSERVICE", "PGSSLMODE"]) {
    assert.equal(call.env[name], undefined, `${name} must not reach the tool`);
  }
  assert.equal(call.env.PATH, "/usr/bin");
  assert.equal(call.env.Path, "C:\\Windows", "the variable's own spelling is kept (Windows)");
  assert.equal(call.env.HOME, "/srv/nenaugad");
  // Found on PATH when no directory is named.
  assert.equal(toolInvocation({ kind: "host", binDir: null }, "pg_restore", null, ["--version"], PARENT_ENV).command, "pg_restore");
});

test("in a container, the tool runs through docker exec against the container's own port", () => {
  const call = toolInvocation({ kind: "container", container: "nenaugad-db-1" }, "pg_restore",
    pgTarget(URL_TEXT, "atlas_starter_restore"), ["--dbname", "atlas_starter_restore"], PARENT_ENV);
  assert.equal(call.command, "docker");
  assert.deepEqual(call.args, [
    "exec", "-i", "-e", "TZ", "-e", "PGPASSWORD", "-e", "PGCONNECT_TIMEOUT", "nenaugad-db-1", "pg_restore",
    "--host", "127.0.0.1", "--port", "5432", "--username", "atlas", "--no-password",
    "--dbname", "atlas_starter_restore",
  ]);
  for (const argument of call.args) assert.ok(!argument.includes(PASSWORD), argument);
  // docker reads the value from its own environment: the name alone is on the command line.
  assert.equal(call.env.PGPASSWORD, PASSWORD);
  assert.equal(call.env.DOCKER_HOST, "unix:///run/docker.sock");
  assert.equal(call.env.AUTH_SECRET, undefined);
});

test("a version query carries no connection and no password", () => {
  for (const tools of [{ kind: "host", binDir: null } as const, { kind: "container", container: "c1" } as const]) {
    const call = toolInvocation(tools, "pg_dump", null, ["--version"], PARENT_ENV);
    assert.equal(call.env.PGPASSWORD, undefined);
    assert.ok(!call.args.includes("--host"));
    assert.ok(!call.args.includes("PGPASSWORD"));
    assert.equal(call.args.at(-1), "--version");
  }
  assert.deepEqual(childEnvironment({ AUTH_SECRET: "x", TZ: "Europe/Berlin" }, null), { PGCONNECT_TIMEOUT: "10", TZ: "UTC" });
});

test("the client's major version is read from its --version line", () => {
  assert.equal(parseClientMajor("pg_dump (PostgreSQL) 17.11 (Debian 17.11-1.pgdg12+2)\n"), 17);
  assert.equal(parseClientMajor("pg_restore (PostgreSQL) 18.0"), 18);
  assert.equal(parseClientMajor("pg_dump (PostgreSQL) 9.6.24"), 9);
  assert.equal(parseClientMajor("pg_dump (PostgreSQL) 17beta2"), 17);
  assert.equal(parseClientMajor("command not found"), null);
  assert.equal(parseClientMajor(""), null);
});

test("a client's connection error waits for its next query instead of crashing the command", () => {
  const client = connectClient(pgTarget(URL_TEXT));
  // Without a listener, an emitted `error` throws (and, from a socket, ends the process).
  assert.doesNotThrow(() => client.emit("error", new Error("terminating connection due to administrator command")));
  assert.equal(ignore(), undefined);
});

test("the tool's major version must be the server's", () => {
  checkClientMajor({ exitCode: 0, stdout: "pg_dump (PostgreSQL) 17.11" }, "pg_dump", 17);
  assert.throws(() => checkClientMajor({ exitCode: 0, stdout: "pg_restore (PostgreSQL) 18.0" }, "pg_restore", 17),
    (error: unknown) => error instanceof BackupError && error.message === "PG_CLIENT_VERSION_MISMATCH"
      && error.facts.client === 18 && error.facts.server === 17 && error.facts.tool === "pg_restore");
  assert.throws(() => checkClientMajor({ exitCode: 0, stdout: "pg_dump (PostgreSQL) 16.4" }, "pg_dump", 17), code("PG_CLIENT_VERSION_MISMATCH"));
  assert.throws(() => checkClientMajor({ exitCode: 1, stdout: "pg_dump (PostgreSQL) 17.11" }, "pg_dump", 17), code("PG_CLIENT_VERSION_UNKNOWN"));
  assert.throws(() => checkClientMajor({ exitCode: 0, stdout: "something else" }, "pg_dump", 17), code("PG_CLIENT_VERSION_UNKNOWN"));
});

test("a tool that is not there is PG_TOOL_NOT_FOUND, named by its program only", async () => {
  const binDir = path.join(os.tmpdir(), `nenaugad-no-such-dir-${process.pid}`);
  await assert.rejects(runTool(toolInvocation({ kind: "host", binDir }, "pg_dump", null, ["--version"]), { captureStdout: true }),
    (error: unknown) => error instanceof BackupError && error.message === "PG_TOOL_NOT_FOUND" && error.facts.tool === "pg_dump");
  await assert.rejects(requireClientMajor({ kind: "host", binDir }, "pg_restore", 17), code("PG_TOOL_NOT_FOUND"));
});

test("a failed restore reports what its cleanup could not undo, by name", () => {
  const original = new BackupError("PG_RESTORE_FAILED", { exitCode: 1 });
  assert.equal(withCleanupFacts(original, {}), original, "nothing left: the error as it was");
  const plain = new Error("anything");
  assert.equal(withCleanupFacts(plain, {}), plain);
  const left = { restoreDatabaseLeft: "atlas_starter_restore", liveDatabaseBlocked: "atlas_starter" };
  const kept = withCleanupFacts(original, left) as BackupError;
  assert.equal(kept.message, "PG_RESTORE_FAILED");
  assert.deepEqual(kept.facts, { exitCode: 1, ...left });
  const fromDatabase = withCleanupFacts(Object.assign(new Error("row text"), { code: "23503" }), left) as BackupError;
  assert.equal(fromDatabase.message, "RESTORE_FAILED");
  assert.deepEqual(fromDatabase.facts, { sqlstate: "23503", ...left });
  const unknown = withCleanupFacts(Object.assign(new Error("x"), { code: "not; a state" }), left) as BackupError;
  assert.deepEqual(unknown.facts, left);
});

test("an archive's lineage is its one row, none before migration 0027, and nothing malformed", () => {
  const id = "0f8e6c2a-4d1b-4c7e-9a3f-5b2d8e1c7a90";
  const copy = (rows: string[]) => ["SET x = 1;", "COPY public.database_lineage (id, created_at) FROM stdin;", ...rows, "\\.", ""].join("\n");
  assert.equal(parseLineageCopy(copy([`${id}\t2026-11-05 07:00:00+00`])), id);
  assert.equal(parseLineageCopy("SET x = 1;\n"), null, "a backup from before the lineage table");
  for (const bad of [[], ["not-a-uuid\t2026-11-05 07:00:00+00"], [`${id}\tx`, `${id}\ty`]]) {
    assert.throws(() => parseLineageCopy(copy(bad)), code("BACKUP_UNREADABLE"), bad.join(" "));
  }
});

test("a deletions export is named by its time, hashed by its entries, and read back strictly", () => {
  assert.equal(deletionsFileName(new Date("2026-11-05T07:15:00.250Z")), "account-deletions-20261105T071500Z.json");
  const entries = [
    { userId: "u_0123456789abcdef01234567", deletedAt: "2026-11-04 12:00:00.123456+00" },
    { userId: "u_x", deletedAt: "2026-11-04 12:00:01+00" },
  ];
  assert.equal(entriesHash(entries), entriesHash([...entries].reverse()), "order does not matter");
  assert.notEqual(entriesHash(entries), entriesHash(entries.slice(1)));
  const file = {
    format: "nenaugad-account-deletions/1", database: "atlas_starter", lineage: "0f8e6c2a-4d1b-4c7e-9a3f-5b2d8e1c7a90",
    exportedAt: "2026-11-05T07:15:00.250Z", entriesSha256: entriesHash(entries), entries,
  };
  assert.deepEqual(parseDeletionsExport(JSON.stringify(file)), file);
  assert.deepEqual(parseDeletionsExport(JSON.stringify({ ...file, entries: [], entriesSha256: entriesHash([]) })).entries, []);
  const broken: unknown[] = [
    "not json", "null", "[]",
    { ...file, format: "other/1" },
    { ...file, database: "Atlas-Starter" },
    { ...file, lineage: undefined },
    { ...file, lineage: "not-a-uuid" },
    { ...file, exportedAt: "yesterday" },
    { ...file, entries: "none" },
    { ...file, entriesSha256: entriesHash(entries.slice(1)) },
    { ...file, entries: [...entries, { userId: "u y", deletedAt: "2026-11-04 12:00:00+00" }] },
    { ...file, entries: [...entries, { userId: "u_y", deletedAt: "tomorrow" }] },
    { ...file, entries: [...entries, null] },
  ];
  for (const bad of broken) {
    const text = typeof bad === "string" ? bad : JSON.stringify(bad);
    assert.throws(() => parseDeletionsExport(text),
      (error: unknown) => error instanceof BackupError && /^(DELETIONS_SOURCE_UNREADABLE|DATABASE_NAME_INVALID)$/u.test(error.message), text.slice(0, 60));
  }
});

test("a backup file is named after the database and the UTC time", () => {
  assert.equal(backupFileName("atlas_starter", new Date("2026-11-04T12:13:14.567Z")), "atlas_starter-20261104T121314Z.dump");
});

test("the backup directory is absolute and outside the repository, symlinks included", async () => {
  await assert.rejects(backupDirectory(undefined, REPO), code("BACKUP_DIR_REQUIRED"));
  await assert.rejects(backupDirectory("", REPO), code("BACKUP_DIR_REQUIRED"));
  await assert.rejects(backupDirectory("backups/db", REPO), code("BACKUP_DIR_NOT_ABSOLUTE"));
  const inside = path.join(REPO, "deploy-003-unit-backups");
  await assert.rejects(backupDirectory(inside, REPO), code("BACKUP_DIR_INSIDE_REPOSITORY"));
  await assert.rejects(stat(inside), "a refused directory is not created");
  await assert.rejects(backupDirectory(REPO, REPO), code("BACKUP_DIR_INSIDE_REPOSITORY"));

  const outside = await mkdtemp(path.join(os.tmpdir(), "nenaugad-unit-"));
  try {
    const nested = path.join(outside, "a", "b");
    const resolved = await backupDirectory(nested, REPO);
    assert.ok((await stat(resolved)).isDirectory());
    if (process.platform !== "win32") assert.equal((await stat(resolved)).mode & 0o777, 0o700);
    // A link outside that leads into the repository is inside it.
    const link = path.join(outside, "link");
    await symlink(path.join(REPO, "tasks"), link, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(backupDirectory(link, REPO), code("BACKUP_DIR_INSIDE_REPOSITORY"));
    await assert.rejects(backupDirectory(path.join(link, "x"), REPO), code("BACKUP_DIR_INSIDE_REPOSITORY"));
    await assert.rejects(stat(path.join(REPO, "tasks", "x")), "nothing was created through the link");
    if (process.platform !== "win32") {
      // An existing directory others can read is refused, not quietly used.
      const open = path.join(outside, "open");
      await mkdir(open, { mode: 0o755 });
      await chmod(open, 0o755);
      await assert.rejects(backupDirectory(open, REPO), code("BACKUP_DIR_NOT_PRIVATE"));
    }
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("a restore works under two names derived from the live database", () => {
  assert.deepEqual(restoreNames("atlas_starter"), { staging: "atlas_starter_restore", parked: "atlas_starter_before_restore" });
  assert.deepEqual(restoreNames("atlas_starter_test"),
    { staging: "atlas_starter_test_restore", parked: "atlas_starter_test_before_restore" });
  assert.throws(() => restoreNames("x".repeat(60)), code("DATABASE_NAME_INVALID"));
});

test("the live ledger is read, absent on an empty database, and refused when users have none", () => {
  assert.equal(ledgerState({ hasLedger: true, hasUsers: true }), "read");
  assert.equal(ledgerState({ hasLedger: true, hasUsers: false }), "read");
  assert.equal(ledgerState({ hasLedger: false, hasUsers: false }), "absent");
  assert.throws(() => ledgerState({ hasLedger: false, hasUsers: true }), code("LIVE_LEDGER_MISSING"));
});

test("db:backup takes at most one --dir", () => {
  assert.deepEqual(backupArguments([]), { dir: null });
  assert.deepEqual(backupArguments(["--dir=/srv/nenaugad/backups"]), { dir: "/srv/nenaugad/backups" });
  for (const bad of [["--dir"], ["--dir="], ["--dir=/a", "--dir=/b"], ["/a"], ["--force"]]) {
    assert.throws(() => backupArguments(bad), code("BACKUP_ARGUMENTS_INVALID"), bad.join(" "));
  }
});

test("db:restore takes one absolute file, exactly one mode, and its three options", () => {
  const file = path.resolve("/srv/nenaugad/backups/atlas_starter-20261104T121314Z.dump");
  const newer = path.resolve("/srv/nenaugad/backups/atlas_starter-20261105T031500Z.dump");
  const plain = { deletionsFrom: [], newestBackup: false, acceptAiLedgerRollback: false };
  assert.deepEqual(restoreArguments([file, "--drill"]), { file, mode: "drill", ...plain });
  assert.deepEqual(restoreArguments(["--replace", file]), { file, mode: "replace", ...plain });
  assert.deepEqual(restoreArguments([file, "--replace", `--deletions-from=${newer}`, `--deletions-from=${file}`]),
    { file, mode: "replace", ...plain, deletionsFrom: [newer, file] });
  assert.deepEqual(restoreArguments([file, "--replace", "--newest-backup", "--accept-ai-ledger-rollback"]),
    { file, mode: "replace", deletionsFrom: [], newestBackup: true, acceptAiLedgerRollback: true });
  for (const bad of [[file], ["--drill"], [file, "--drill", "--replace"], [file, "--drill", "--drill"],
    [file, file, "--drill"], [file, "--force"], [file, "--replace=yes"], [], [file, "--drill", "--deletions-from="],
    [file, "--drill", "--newest-backup", "--newest-backup"], [file, "--drill", "-x"],
    [file, "--drill", "--newest-backup", `--deletions-from=${newer}`]]) {
    assert.throws(() => restoreArguments(bad), code("RESTORE_ARGUMENTS_INVALID"), bad.join(" "));
  }
  assert.throws(() => restoreArguments(["backups/x.dump", "--drill"]), code("RESTORE_FILE_NOT_ABSOLUTE"));
  assert.throws(() => restoreArguments([file, "--drill", "--deletions-from=backups/y.dump"]), code("RESTORE_FILE_NOT_ABSOLUTE"));
});

test("an archive's header gives its database and its UTC creation time, or nothing", () => {
  const listing = [
    ";", "; Archive created at 2026-11-05 07:38:04 UTC", ";     dbname: atlas_starter", ";     TOC Entries: 156",
  ].join("\n");
  assert.deepEqual(archiveHeader(listing), { database: "atlas_starter", createdAt: new Date("2026-11-05T07:38:04Z") });
  assert.deepEqual(archiveHeader("; Archive created at 2026-11-05 08:38:04 CET\n;     dbname: x"),
    { database: "x", createdAt: null }, "a local time is not guessed at");
  assert.deepEqual(archiveHeader(""), { database: null, createdAt: null });
});

test("a newer backup's ledger is read row by row, and anything malformed fails", () => {
  const copy = (rows: string[]) => [
    "\\restrict abc", "SET statement_timeout = 0;", "",
    "COPY public.account_deletions (user_id, deleted_at) FROM stdin;", ...rows, "\\.", "", "\\unrestrict abc",
  ].join("\n");
  assert.deepEqual(parseLedgerCopy(copy(["u_0123456789abcdef01234567\t2026-11-04 12:00:00.123+00", "u_x\t2026-11-04 12:00:01+00"])), [
    { userId: "u_0123456789abcdef01234567", deletedAt: "2026-11-04 12:00:00.123+00" },
    { userId: "u_x", deletedAt: "2026-11-04 12:00:01+00" },
  ]);
  assert.deepEqual(parseLedgerCopy(copy([])), []);
  for (const bad of [["u_x"], ["u_x\tnot a time"], ["u x\t2026-11-04 12:00:00+00"], ["u_x\t2026-11-04 12:00:00+00\textra"], ["\\N\t2026-11-04 12:00:00+00"]]) {
    assert.throws(() => parseLedgerCopy(copy(bad)), code("DELETIONS_SOURCE_UNREADABLE"), bad.join(" "));
  }
  assert.throws(() => parseLedgerCopy("SET x = 1;"), code("DELETIONS_SOURCE_UNREADABLE"), "no ledger at all");
  assert.throws(() => parseLedgerCopy("COPY public.account_deletions (user_id, deleted_at) FROM stdin;\nu_x\t2026-11-04 12:00:00+00"),
    code("DELETIONS_SOURCE_UNREADABLE"), "a ledger cut off before its end");
});

test("a failure is reported as codes and safe facts, never as a message", () => {
  assert.deepEqual(failureReport(new BackupError("PG_CLIENT_VERSION_MISMATCH", { client: 18, server: 17 }), "BACKUP_FAILED"),
    { ok: false, code: "PG_CLIENT_VERSION_MISMATCH", client: 18, server: 17 });
  assert.deepEqual(failureReport(new ConfigurationError("LOCAL_DATABASE_REQUIRED"), "BACKUP_FAILED"),
    { ok: false, code: "LOCAL_DATABASE_REQUIRED" });
  const pgError = Object.assign(new Error(`connection to ${URL_TEXT} failed for row "Инженер"`), { code: "28P01" });
  assert.deepEqual(failureReport(pgError, "RESTORE_FAILED"), { ok: false, code: "RESTORE_FAILED", sqlstate: "28P01" });
  const netError = Object.assign(new Error(`connect ECONNREFUSED ${URL_TEXT}`), { code: "ECONNREFUSED" });
  assert.deepEqual(failureReport(netError, "BACKUP_FAILED"), { ok: false, code: "BACKUP_FAILED", cause: "ECONNREFUSED" });
  // Five capitals, but a system error, not a SQLSTATE.
  assert.deepEqual(failureReport(Object.assign(new Error("x"), { code: "EPERM" }), "BACKUP_FAILED"),
    { ok: false, code: "BACKUP_FAILED", cause: "EPERM" });
  assert.deepEqual(failureReport(Object.assign(new Error("x"), { code: "42P01" }), "BACKUP_FAILED"),
    { ok: false, code: "BACKUP_FAILED", sqlstate: "42P01" });
  assert.deepEqual(failureReport(new Error(URL_TEXT), "BACKUP_FAILED"), { ok: false, code: "BACKUP_FAILED" });
  assert.deepEqual(failureReport(Object.assign(new Error("x"), { code: "not a code; DROP" }), "BACKUP_FAILED"),
    { ok: false, code: "BACKUP_FAILED" });
  assert.deepEqual(failureReport("thrown text", "BACKUP_FAILED"), { ok: false, code: "BACKUP_FAILED" });
  // A restore that could not drop its database says so, by name.
  assert.deepEqual(failureReport(new BackupError("PG_RESTORE_FAILED", { restoreDatabaseLeft: "atlas_starter_restore" }), "RESTORE_FAILED"),
    { ok: false, code: "PG_RESTORE_FAILED", restoreDatabaseLeft: "atlas_starter_restore" });
});
