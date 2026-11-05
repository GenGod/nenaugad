// `npm run db:backup` (DEPLOY-003, tasks/DEPLOY-003-backup-restore.md): one pg_dump
// custom-format file of the live database, outside the repository, readable only by the
// user who took it. The file gets its final name only once pg_dump has exited 0 and
// pg_restore has read the whole archive back; until then it is `<name>.partial`, removed on
// any failure. The dump holds personal data: it never goes into the repository, and nothing
// here prints a row, a URL or a password.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, open, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  BackupError, connectClient, type PgTools, pgTarget, requireClientMajor, requireSameServer, runTool,
  serverFacts, toolInvocation,
} from "./pg-tools.ts";

export type BackupResult = Readonly<{
  file: string; bytes: number; sha256: string; database: string; postgresMajor: number;
}>;

/** `YYYYMMDDTHHMMSSZ`: file names that sort by time. */
export function utcStamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/u, "Z").replace(/[-:]/gu, "");
}

/** `<database>-<YYYYMMDDTHHMMSSZ>.dump`: sorts by time, and says which database it holds. */
export function backupFileName(database: string, now: Date): string {
  return `${database}-${utcStamp(now)}.dump`;
}

export async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

function isWithin(child: string, parent: string): boolean {
  const fold = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const relative = path.relative(fold(parent), fold(child));
  return relative === "" || !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

/**
 * The directory a backup goes to: absolute, outside the repository (also when reached
 * through a link), created with mode 700 when missing. Refused before anything is created.
 */
export async function backupDirectory(dir: string | undefined, repositoryRoot: string): Promise<string> {
  if (!dir) throw new BackupError("BACKUP_DIR_REQUIRED");
  if (!path.isAbsolute(dir)) throw new BackupError("BACKUP_DIR_NOT_ABSOLUTE");
  const root = await realpath(repositoryRoot);
  const wanted = path.resolve(dir);
  if (isWithin(wanted, path.resolve(repositoryRoot)) || isWithin(wanted, root)) {
    throw new BackupError("BACKUP_DIR_INSIDE_REPOSITORY");
  }
  // The nearest existing ancestor, resolved, must already lie outside: a link outside that
  // leads into the repository is refused before mkdir creates anything through it.
  let existing = wanted;
  while (!(await exists(existing)) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  if (isWithin(await realpath(existing), root)) throw new BackupError("BACKUP_DIR_INSIDE_REPOSITORY");
  await mkdir(wanted, { recursive: true, mode: 0o700 });
  const resolved = await realpath(wanted);
  if (isWithin(resolved, root)) throw new BackupError("BACKUP_DIR_INSIDE_REPOSITORY");
  // mkdir's mode applies only to a directory it creates: an existing one others can read or
  // enter is refused, not used. (Windows has no such mode bits.)
  if (process.platform !== "win32" && ((await stat(resolved)).mode & 0o077) !== 0) {
    throw new BackupError("BACKUP_DIR_NOT_PRIVATE");
  }
  return resolved;
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * fsync, so a power loss right after the rename cannot leave a named but empty file. Opened
 * for writing: Windows refuses to flush a read-only handle.
 */
export async function flush(file: string): Promise<void> {
  const handle = await open(file, "r+");
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function flushDirectory(dir: string): Promise<void> {
  if (process.platform === "win32") return; // Windows cannot open a directory for fsync.
  const handle = await open(dir, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

/**
 * Reads the archive back: its table of contents must list the data of `users` and of the
 * deletion ledger, and pg_restore must read every block (into nothing: the SQL it would
 * print holds the rows).
 */
async function verifyArchive(tools: PgTools, file: string): Promise<void> {
  const listing = await runTool(toolInvocation(tools, "pg_restore", null, ["--list", "--file=-"]), { stdinFile: file, captureStdout: true });
  if (listing.exitCode !== 0) throw new BackupError("BACKUP_UNREADABLE");
  for (const table of ["users", "account_deletions"]) {
    if (!new RegExp(`^\\d+; \\d+ \\d+ TABLE DATA public ${table} `, "mu").test(listing.stdout)) {
      throw new BackupError("BACKUP_INCOMPLETE", { missing: table });
    }
  }
  const read = await runTool(toolInvocation(tools, "pg_restore", null, ["--file=-"]), { stdinFile: file });
  if (read.exitCode !== 0) throw new BackupError("BACKUP_UNREADABLE");
}

export async function takeBackup(options: Readonly<{
  url: string; tools: PgTools; dir: string | undefined; repositoryRoot: string; now?: Date;
}>): Promise<BackupResult> {
  const { url, tools } = options;
  const dir = await backupDirectory(options.dir, options.repositoryRoot);
  const target = pgTarget(url);
  const client = connectClient(target);
  await client.connect();
  let facts: { major: number; systemIdentifier: string };
  try {
    facts = await serverFacts(client, tools);
  } finally {
    await client.end();
  }
  await requireClientMajor(tools, "pg_dump", facts.major);
  await requireClientMajor(tools, "pg_restore", facts.major);
  await requireSameServer(tools, target, facts.systemIdentifier);

  const name = backupFileName(target.database, options.now ?? new Date());
  const final = path.join(dir, name);
  // Opened with "wx": two backups in the same second cannot share the partial file either.
  const partial = `${final}.partial`;
  if (await exists(final)) throw new BackupError("BACKUP_FILE_EXISTS");
  try {
    // A lock another session holds (a running migration) fails the dump after a minute
    // instead of hanging the timer.
    const dump = await runTool(toolInvocation(tools, "pg_dump", target, [
      "--format=custom", "--lock-wait-timeout=60s", "--dbname", target.database,
    ]), { stdoutFile: partial });
    if (dump.exitCode !== 0) throw new BackupError("PG_DUMP_FAILED", { exitCode: dump.exitCode });
    await flush(partial);
    await verifyArchive(tools, partial);
    await rename(partial, final);
    await flushDirectory(dir);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  const { size } = await stat(final);
  return { file: final, bytes: size, sha256: await sha256Of(final), database: target.database, postgresMajor: facts.major };
}
