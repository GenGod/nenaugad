// `npm run db:export-deletions` (DEPLOY-003; owner decision 2026-11-05, "Export every 15 min"):
// the deletion ledger alone, `account_deletions`, as a small JSON file next to the dumps, so a
// lost server's newest deletions survive it. nenaugad-deletions.timer runs it every 15 minutes;
// the off-site copy encrypts and uploads each new file. A file is written only when the ledger
// changed since the newest one there, so a quiet ledger uploads nothing.
//
// The file holds account ids and deletion times: no email, no content (B11-001). A restore of a
// lost server reads it with `--deletions-from` (src/server/backup/restore.ts).
import { createHash } from "node:crypto";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { backupDirectory, exists, flush, flushDirectory, utcStamp } from "./backup.ts";
import { assertDatabaseName, BackupError, connectClient, ignore, pgTarget } from "./pg-tools.ts";

export const DELETIONS_FORMAT = "nenaugad-account-deletions/1";
export const DELETIONS_FILE = /^account-deletions-\d{8}T\d{6}Z\.json$/u;
export const USER_ID = /^[A-Za-z0-9_-]{1,64}$/u;
export const TIMESTAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?(?:[+-]\d\d(?::\d\d)?)?$/u;
const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
/** A database's identity (migration 0027): one random UUID, carried by its dumps and exports. */
export const LINEAGE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** Far above any ledger this service will have; a larger file is not read into memory. */
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

export type LedgerEntry = Readonly<{ userId: string; deletedAt: string }>;

export type DeletionsExport = Readonly<{
  format: typeof DELETIONS_FORMAT;
  database: string;
  /** The exporting database's lineage: a restore takes the export only for the same lineage. */
  lineage: string;
  exportedAt: string;
  entriesSha256: string;
  entries: readonly LedgerEntry[];
}>;

export type ExportResult = Readonly<{
  written: boolean; file: string; entries: number; entriesSha256: string; database: string; lineage: string;
}>;

export function deletionsFileName(now: Date): string {
  return `account-deletions-${utcStamp(now)}.json`;
}

/** The ledger's identity: the same entries, in any order, hash the same. */
export function entriesHash(entries: readonly LedgerEntry[]): string {
  const lines = entries.map(entry => `${entry.userId}\t${entry.deletedAt}\n`).sort();
  return createHash("sha256").update(lines.join("")).digest("hex");
}

/** An export read back: every field checked, and the entries must hash to what the file says. */
export function parseDeletionsExport(text: string): DeletionsExport {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new BackupError("DELETIONS_SOURCE_UNREADABLE"); }
  const file = value as Partial<Record<keyof DeletionsExport, unknown>> | null;
  if (!file || typeof file !== "object" || file.format !== DELETIONS_FORMAT
    || typeof file.database !== "string" || typeof file.lineage !== "string" || !LINEAGE.test(file.lineage)
    || typeof file.exportedAt !== "string" || !ISO_TIME.test(file.exportedAt)
    || typeof file.entriesSha256 !== "string" || !Array.isArray(file.entries)) {
    throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
  }
  assertDatabaseName(file.database);
  const entries: LedgerEntry[] = [];
  for (const raw of file.entries as unknown[]) {
    const entry = raw as Partial<Record<keyof LedgerEntry, unknown>> | null;
    if (!entry || typeof entry !== "object" || typeof entry.userId !== "string" || !USER_ID.test(entry.userId)
      || typeof entry.deletedAt !== "string" || !TIMESTAMP.test(entry.deletedAt)) {
      throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
    }
    entries.push({ userId: entry.userId, deletedAt: entry.deletedAt });
  }
  if (entriesHash(entries) !== file.entriesSha256) throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
  return {
    format: DELETIONS_FORMAT, database: file.database, lineage: file.lineage, exportedAt: file.exportedAt,
    entriesSha256: file.entriesSha256, entries,
  };
}

/** A migrated database's lineage (0027): exactly one row, or the database is refused. */
export async function databaseLineage(client: { query: (sql: string) => Promise<{ rows: unknown[] }> }): Promise<string> {
  const found = await client.query("SELECT to_regclass('public.database_lineage') IS NOT NULL AS ok");
  if (!(found.rows[0] as { ok: boolean }).ok) throw new BackupError("LINEAGE_MISSING");
  const rows = (await client.query("SELECT id FROM public.database_lineage")).rows as { id: string }[];
  const id = rows.length === 1 ? rows[0]?.id : undefined;
  if (!id || !LINEAGE.test(id)) throw new BackupError("LINEAGE_MISSING");
  return id;
}

export async function readDeletionsExport(file: string): Promise<DeletionsExport> {
  const text = await readFile(file, "utf8").catch(ignore);
  if (text === undefined) throw new BackupError("DELETIONS_SOURCE_NOT_FOUND");
  if (Buffer.byteLength(text) > MAX_EXPORT_BYTES) throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
  return parseDeletionsExport(text);
}

/** The newest export already in `dir`, if it can be read; an unreadable one counts as none. */
async function newestExport(dir: string): Promise<{ file: string; content: DeletionsExport } | null> {
  const names = (await readdir(dir)).filter(name => DELETIONS_FILE.test(name)).sort();
  const newest = names.at(-1);
  if (!newest) return null;
  const file = path.join(dir, newest);
  try { return { file, content: await readDeletionsExport(file) }; } catch { return null; }
}

export async function exportDeletions(options: Readonly<{
  url: string; dir: string | undefined; repositoryRoot: string; now?: Date;
}>): Promise<ExportResult> {
  const dir = await backupDirectory(options.dir, options.repositoryRoot);
  const target = pgTarget(options.url);
  const client = connectClient(target);
  await client.connect();
  let entries: LedgerEntry[];
  let lineage: string;
  try {
    // One time zone for every export, so the same ledger always hashes the same.
    await client.query("SET TIME ZONE 'UTC'");
    const found = await client.query("SELECT to_regclass('public.account_deletions') IS NOT NULL AS ledger");
    if (!(found.rows[0] as { ledger: boolean }).ledger) throw new BackupError("LEDGER_MISSING");
    const rows = await client.query("SELECT user_id, deleted_at::text AS deleted_at FROM public.account_deletions ORDER BY user_id");
    entries = (rows.rows as { user_id: string; deleted_at: string }[]).map(row => ({ userId: row.user_id, deletedAt: row.deleted_at }));
    lineage = await databaseLineage(client);
  } finally {
    await client.end();
  }
  const sha = entriesHash(entries);
  const now = options.now ?? new Date();
  const previous = await newestExport(dir);
  // Unchanged is skipped, except after a new dump: then an export follows every dump, so on a
  // lost server "no export newer than the dump" means the export was failing, not that the
  // ledger was quiet (review 2, finding 4).
  const stampOf = (file: string) => /(\d{8}T\d{6}Z)\.[a-z]+$/u.exec(file)?.[1] ?? "";
  const dumps = (await readdir(dir)).filter(name => name.startsWith(`${target.database}-`) && /^[a-z0-9_]+-\d{8}T\d{6}Z\.dump$/u.test(name));
  // A dump named after the next hour is not one db:backup wrote: it does not count.
  const ceiling = utcStamp(new Date(now.getTime() + 3_600_000));
  const newestDump = dumps.map(stampOf).filter(stamp => stamp <= ceiling).sort().at(-1) ?? "";
  if (previous && previous.content.database === target.database && previous.content.lineage === lineage
    && previous.content.entriesSha256 === sha && stampOf(previous.file) >= newestDump) {
    return { written: false, file: previous.file, entries: entries.length, entriesSha256: sha, database: target.database, lineage };
  }
  const final = path.join(dir, deletionsFileName(now));
  if (await exists(final)) throw new BackupError("BACKUP_FILE_EXISTS");
  const partial = `${final}.partial`;
  const body: DeletionsExport = {
    format: DELETIONS_FORMAT, database: target.database, lineage, exportedAt: now.toISOString(), entriesSha256: sha, entries,
  };
  try {
    await writeFile(partial, `${JSON.stringify(body)}\n`, { flag: "wx", mode: 0o600 });
    await flush(partial);
    await rename(partial, final);
    await flushDirectory(dir);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  return { written: true, file: final, entries: entries.length, entriesSha256: sha, database: target.database, lineage };
}
