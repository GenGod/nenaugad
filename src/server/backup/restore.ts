// `npm run db:restore -- <file> --drill|--replace` (DEPLOY-003, SP-T22: "deleted data is not
// returned to the user"; tasks/DEPLOY-003-backup-restore.md).
//
// A backup taken before an account was deleted still holds the account. The deletion ledger
// (`account_deletions`, B11-001) that says so lives in the database being replaced, so the
// restore reads it from there: that database's ledger is the newest one there is. The order is
// the guarantee:
//   1. restore into a fresh database, `<db>_restore`, a name nothing connects to;
//   2. in one transaction there: add the live ledger (and the ledgers of any newer backups the
//      owner names) to the restored one, delete every account it lists (ON DELETE CASCADE takes
//      their rows), empty the attempt counters;
//   3. check with separate queries that no listed account, no row of one, and no row whose
//      parent is gone is left;
//   4. only then: `--drill` drops the restore database; `--replace` renames the live database
//      to `<db>_before_restore` and the restore database to `<db>`, in one transaction.
// Any failure drops the restore database and leaves the live one as it was. For `--replace`
// the live database is closed to new connections before its ledger is read, nothing else may be
// connected, and its ledger is read again right before the swap.
//
// When there is no live ledger (the live database is gone: a lost server), the newest ledger is
// in the newest backup, so the restore refuses until the owner names newer backups
// (`deletionsFrom`) or states that this is the newest one (`newestBackup`).
//
// The AI spending ledger (ai_budgets, ai_operations) is not carried forward: a restore of an
// older backup would give back money already spent and forget attempts. `--replace` refuses
// while the live ledger differs from the restored one, unless the owner accepts that
// (`acceptAiLedgerRollback`); docs/OPEN_GAPS.md has the follow-up.
import { open, stat } from "node:fs/promises";
import type { Client } from "pg";
import { databaseLineage, LINEAGE, type LedgerEntry, readDeletionsExport, TIMESTAMP, USER_ID } from "./deletions.ts";
import {
  assertDatabaseName, BackupError, connectClient, ignore, type PgTarget, type PgTools, pgTarget, requireClientMajor,
  requireSameServer, runTool, type SafeFacts, serverFacts, toolInvocation,
} from "./pg-tools.ts";

export type RestoreMode = "drill" | "replace";

export type RestoreOptions = Readonly<{
  url: string;
  tools: PgTools;
  file: string;
  mode: RestoreMode;
  /** Newer backups whose ledgers are applied too: for a restore without a live database. */
  deletionsFrom?: readonly string[];
  /** The owner states that no newer backup exists (a lost server, no live ledger). */
  newestBackup?: boolean;
  /** The owner accepts that `--replace` rolls the AI spending ledger back to the backup's. */
  acceptAiLedgerRollback?: boolean;
}>;

export type RestoreReport = Readonly<{
  mode: RestoreMode;
  file: string;
  database: string;
  backupCreatedAt: string | null;
  /** "absent": the live database did not exist or had no tables (a fresh or lost server). */
  liveLedger: "read" | "absent";
  ledgerEntries: number;
  /** The backup's accounts the live database knows neither as accounts nor as deletions. */
  accountsUnknownToLive: number;
  /** Whether the live database has the backup's lineage (0027); null when either has none. */
  sameLineage: boolean | null;
  deletionSources: number;
  /** True when no newer ledger was available and the owner said this is the newest backup. */
  deletionGapAccepted: boolean;
  accountsDeletedAgain: number;
  attemptCountersCleared: number;
  accountsRestored: number;
  latestMigration: string | null;
  aiOperationsRolledBack: number;
  aiBudgetsRolledBack: number;
  replaced: boolean;
  previousDatabase: string | null;
}>;

type Ledger = Readonly<{ state: "read" | "absent"; entries: readonly LedgerEntry[] }>;

/** One restore at a time on a server (session-level, on the maintenance database). */
const RESTORE_LOCK = 82131003;
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/u;

const quoted = (name: string) => `"${assertDatabaseName(name)}"`;
const column = (name: string) => {
  if (!IDENTIFIER.test(name)) throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
  return `"${name}"`;
};

/** The two names a restore of `database` works with. */
export function restoreNames(database: string): Readonly<{ staging: string; parked: string }> {
  return {
    staging: assertDatabaseName(`${database}_restore`),
    parked: assertDatabaseName(`${database}_before_restore`),
  };
}

/**
 * A live database with accounts but no ledger cannot say which accounts were deleted: refused.
 * One with no tables at all (a fresh or lost server) has no ledger to give.
 */
export function ledgerState(tables: Readonly<{ hasLedger: boolean; hasUsers: boolean }>): "read" | "absent" {
  if (tables.hasLedger) return "read";
  if (tables.hasUsers) throw new BackupError("LIVE_LEDGER_MISSING");
  return "absent";
}

/** The header pg_restore prints: the archive's database and its creation time (tools run in UTC). */
export function archiveHeader(listing: string): Readonly<{ database: string | null; createdAt: Date | null }> {
  const created = /^; Archive created at (\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d) UTC$/mu.exec(listing);
  const database = /^;\s+dbname: (\S+)$/mu.exec(listing);
  return {
    database: database?.[1] ?? null,
    createdAt: created ? new Date(`${created[1]}T${created[2]}Z`) : null,
  };
}

/**
 * The rows of `account_deletions` in pg_restore's plain-text output of that one table. Anything
 * that is not a well-formed row fails: a ledger is never read halfway.
 */
export function parseLedgerCopy(sql: string): LedgerEntry[] {
  const lines = sql.split(/\r?\n/u);
  const start = lines.findIndex(line => /^COPY public\.account_deletions \(user_id, deleted_at\) FROM stdin;$/u.test(line));
  if (start < 0) throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
  const entries: LedgerEntry[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line === "\\.") return entries;
    const [userId, deletedAt, extra] = line.split("\t");
    if (extra !== undefined || !userId || !USER_ID.test(userId) || !deletedAt || !TIMESTAMP.test(deletedAt)) {
      throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
    }
    entries.push({ userId, deletedAt });
  }
  throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
}

/**
 * The lineage row (migration 0027) in pg_restore's plain-text output of `database_lineage`, or
 * null when the archive has none (a backup from before 0027).
 */
export function parseLineageCopy(sql: string): string | null {
  const lines = sql.split(/\r?\n/u);
  const start = lines.findIndex(line => /^COPY public\.database_lineage \(id, created_at\) FROM stdin;$/u.test(line));
  if (start < 0) return null;
  const [id] = (lines[start + 1] ?? "").split("\t");
  if (!id || !LINEAGE.test(id) || lines[start + 2] !== "\\.") throw new BackupError("BACKUP_UNREADABLE");
  return id;
}

async function readArchiveLineage(tools: PgTools, file: string, unreadable: string): Promise<string | null> {
  const sql = await runTool(toolInvocation(tools, "pg_restore", null, [
    "--data-only", "--table=database_lineage", "--file=-",
  ]), { stdinFile: file, captureStdout: true });
  if (sql.exitCode !== 0) throw new BackupError(unreadable);
  return parseLineageCopy(sql.stdout);
}

async function readArchiveHeader(tools: PgTools, file: string, unreadable: string) {
  const listing = await runTool(toolInvocation(tools, "pg_restore", null, ["--list", "--file=-"]), { stdinFile: file, captureStdout: true });
  if (listing.exitCode !== 0) throw new BackupError(unreadable);
  return archiveHeader(listing.stdout);
}

/** The ledger inside a newer backup: one more source of deletions the restored one lacks. */
async function readArchiveLedger(tools: PgTools, file: string): Promise<LedgerEntry[]> {
  const sql = await runTool(toolInvocation(tools, "pg_restore", null, [
    "--data-only", "--table=account_deletions", "--file=-",
  ]), { stdinFile: file, captureStdout: true });
  if (sql.exitCode !== 0) throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
  return parseLedgerCopy(sql.stdout);
}

async function readLedger(client: Client): Promise<Ledger> {
  const tables = await client.query(
    "SELECT to_regclass('public.account_deletions') IS NOT NULL AS ledger, to_regclass('public.users') IS NOT NULL AS users");
  const row = tables.rows[0] as { ledger: boolean; users: boolean };
  const state = ledgerState({ hasLedger: row.ledger, hasUsers: row.users });
  if (state === "absent") return { state, entries: [] };
  const result = await client.query("SELECT user_id, deleted_at::text AS deleted_at FROM public.account_deletions");
  return {
    state,
    entries: (result.rows as { user_id: string; deleted_at: string }[]).map(entry => ({ userId: entry.user_id, deletedAt: entry.deleted_at })),
  };
}

/**
 * How many of the backup's accounts the live database knows neither as an account nor as a
 * deletion. A live database that descends from the backup knows every one; a new, migrated
 * database knows none, and its empty ledger then says nothing about them (review 2, finding 1).
 */
async function accountsUnknownToLive(live: Client, target: PgTarget): Promise<number> {
  const known = await live.query(
    `SELECT id FROM public.users
      UNION SELECT user_id FROM public.account_deletions`);
  const ids = (known.rows as { id: string }[]).map(row => row.id);
  return withClient(target, async client => {
    const result = await client.query("SELECT COUNT(*)::int AS n FROM public.users WHERE NOT (id = ANY($1::text[]))", [ids]);
    return (result.rows[0] as { n: number }).n;
  });
}

/** Count and newest time: changes if any deletion lands after the ledger was read. */
async function ledgerFingerprint(client: Client): Promise<string> {
  const result = await client.query(
    "SELECT CASE WHEN to_regclass('public.account_deletions') IS NULL THEN '' ELSE (SELECT COUNT(*) || '/' || COALESCE(max(deleted_at)::text, '') FROM public.account_deletions) END AS f");
  return (result.rows[0] as { f: string }).f;
}

async function withClient<T>(target: PgTarget, work: (client: Client) => Promise<T>): Promise<T> {
  const client = connectClient(target);
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}

/** Step 2, in one transaction in the restore database. Names are schema-qualified throughout. */
async function applyLedger(target: PgTarget, entries: readonly LedgerEntry[]): Promise<{ deletedAgain: number; countersCleared: number }> {
  return withClient(target, async client => {
    await client.query("BEGIN");
    try {
      const tables = await client.query(
        "SELECT to_regclass('public.users') IS NOT NULL AS users, to_regclass('public.account_deletions') IS NOT NULL AS ledger, to_regclass('public.auth_attempts') IS NOT NULL AS attempts");
      const found = tables.rows[0] as { users: boolean; ledger: boolean; attempts: boolean };
      if (!found.users || !found.ledger) throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
      // The restored database carries every deletion forward, for the next restore too.
      await client.query(
        "INSERT INTO public.account_deletions (user_id, deleted_at) SELECT * FROM unnest($1::text[], $2::timestamptz[]) ON CONFLICT (user_id) DO NOTHING",
        [entries.map(entry => entry.userId), entries.map(entry => entry.deletedAt)]);
      const deleted = await client.query("DELETE FROM public.users WHERE id IN (SELECT user_id FROM public.account_deletions)");
      // Rate-limit counters from the backup's time are stale, and they hold the deleted
      // accounts' keyed email hashes and ids (B53, B54): none is restored.
      const cleared = found.attempts ? await client.query("DELETE FROM public.auth_attempts") : { rowCount: 0 };
      await client.query("COMMIT");
      return { deletedAgain: deleted.rowCount ?? 0, countersCleared: cleared.rowCount ?? 0 };
    } catch (error) {
      await client.query("ROLLBACK").catch(ignore);
      throw error;
    }
  });
}

/**
 * Step 3, on a new connection: what is actually in the database, not what step 2 reported. A
 * listed account in `users`, a row naming one in any table with a `user_id` column, or a row
 * whose parent row is gone (a rule or trigger in the dump can stop a cascade) fails the restore.
 */
async function verifyRestored(target: PgTarget): Promise<{ accounts: number; latestMigration: string | null }> {
  return withClient(target, async client => {
    const present = await client.query(
      "SELECT COUNT(*)::int AS n FROM public.users u JOIN public.account_deletions d ON d.user_id = u.id");
    const left = (present.rows[0] as { n: number }).n;
    if (left > 0) throw new BackupError("RESTORE_DELETED_ACCOUNT_PRESENT", { accounts: left });
    const tables = await client.query(
      `SELECT c.table_name FROM information_schema.columns c
         JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name = 'user_id'
          AND c.table_name <> 'account_deletions'
        ORDER BY 1`);
    for (const { table_name: table } of tables.rows as { table_name: string }[]) {
      const rows = await client.query(
        `SELECT COUNT(*)::int AS n FROM public.${column(table)} WHERE user_id::text IN (SELECT user_id FROM public.account_deletions)`);
      if ((rows.rows[0] as { n: number }).n > 0) throw new BackupError("RESTORE_DELETED_ACCOUNT_PRESENT", { table });
    }
    // Every foreign key in the schema, checked by hand: a suppressed cascade leaves children
    // whose parent is gone, which Postgres does not notice by itself.
    const keys = await client.query(
      `SELECT child.relname AS child, parent.relname AS parent, parent_ns.nspname AS parent_schema,
              ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS child_columns,
              ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
                      JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS parent_columns
         FROM pg_constraint c
         JOIN pg_class child ON child.oid = c.conrelid
         JOIN pg_class parent ON parent.oid = c.confrelid
         JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
         JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
        ORDER BY 1, 2`);
    for (const key of keys.rows as { child: string; parent: string; parent_schema: string; child_columns: string[]; parent_columns: string[] }[]) {
      const set = key.child_columns.map(name => `c.${column(name)} IS NOT NULL`).join(" AND ");
      const match = key.child_columns.map((name, i) => `p.${column(key.parent_columns[i] ?? "")} = c.${column(name)}`).join(" AND ");
      // The parent in its own schema: a key may point outside public.
      const orphans = await client.query(
        `SELECT COUNT(*)::int AS n FROM public.${column(key.child)} c WHERE ${set} AND NOT EXISTS (SELECT 1 FROM ${column(key.parent_schema)}.${column(key.parent)} p WHERE ${match})`);
      if ((orphans.rows[0] as { n: number }).n > 0) throw new BackupError("RESTORE_ORPHAN_ROWS", { table: key.child });
    }
    const accounts = await client.query("SELECT COUNT(*)::int AS n FROM public.users");
    const migrations = await client.query(
      "SELECT CASE WHEN to_regclass('public.atlas_schema_migrations') IS NULL THEN NULL ELSE (SELECT max(name) FROM public.atlas_schema_migrations) END AS latest");
    return {
      accounts: (accounts.rows[0] as { n: number }).n,
      latestMigration: (migrations.rows[0] as { latest: string | null }).latest,
    };
  });
}

/**
 * How much of the live AI spending ledger the restore would roll back: operations the restored
 * database lacks or holds in another state, and budgets whose spent or held amounts differ.
 * Ids, statuses and amounts only; nothing from them is printed but the two counts.
 */
async function aiLedgerRollback(live: Client, target: PgTarget): Promise<{ operations: number; budgets: number }> {
  const tables = await live.query(
    "SELECT to_regclass('public.ai_operations') IS NOT NULL AS ops, to_regclass('public.ai_budgets') IS NOT NULL AS budgets");
  const found = tables.rows[0] as { ops: boolean; budgets: boolean };
  const ops = found.ops
    ? (await live.query("SELECT id, status, attempt_count, reserved_minor::text AS reserved, settled_minor::text AS settled FROM public.ai_operations")).rows as
      { id: string; status: string; attempt_count: number; reserved: string; settled: string }[]
    : [];
  const budgets = found.budgets
    ? (await live.query("SELECT id, settled_minor::text AS settled, held_minor::text AS held, approved_limit_minor::text AS approved FROM public.ai_budgets")).rows as
      { id: string; settled: string; held: string; approved: string }[]
    : [];
  if (ops.length === 0 && budgets.length === 0) return { operations: 0, budgets: 0 };
  return withClient(target, async client => {
    const restored = await client.query(
      "SELECT to_regclass('public.ai_operations') IS NOT NULL AS ops, to_regclass('public.ai_budgets') IS NOT NULL AS budgets");
    const has = restored.rows[0] as { ops: boolean; budgets: boolean };
    let operations = ops.length;
    if (has.ops && ops.length > 0) {
      const result = await client.query(
        `SELECT COUNT(*)::int AS n
           FROM unnest($1::text[], $2::text[], $3::int[], $4::bigint[], $5::bigint[]) AS l(id, status, attempts, reserved, settled)
           LEFT JOIN public.ai_operations s ON s.id = l.id
          WHERE s.id IS NULL OR (s.status, s.attempt_count, s.reserved_minor, s.settled_minor)
                IS DISTINCT FROM (l.status, l.attempts, l.reserved, l.settled)`,
        [ops.map(op => op.id), ops.map(op => op.status), ops.map(op => op.attempt_count), ops.map(op => op.reserved), ops.map(op => op.settled)]);
      operations = (result.rows[0] as { n: number }).n;
    }
    // A budget counts when the restored one would let more money go than the live one: less spent
    // or held, or a higher approved limit (one lowered since the backup; review 3). Zero rows a
    // new server's seed:budgets made, with the same limits, count for nothing.
    let spent = budgets.filter(budget => BigInt(budget.settled) + BigInt(budget.held) > 0n).length;
    if (has.budgets && budgets.length > 0) {
      const result = await client.query(
        `SELECT COUNT(*)::int AS n
           FROM unnest($1::text[], $2::bigint[], $3::bigint[], $4::bigint[]) AS l(id, settled, held, approved)
           LEFT JOIN public.ai_budgets s ON s.id = l.id
          WHERE l.settled > COALESCE(s.settled_minor, 0) OR l.held > COALESCE(s.held_minor, 0)
             OR s.approved_limit_minor > l.approved`,
        [budgets.map(budget => budget.id), budgets.map(budget => budget.settled), budgets.map(budget => budget.held),
          budgets.map(budget => budget.approved)]);
      spent = (result.rows[0] as { n: number }).n;
    }
    return { operations, budgets: spent };
  });
}

/** Each database of `names` that exists, and whether it takes connections. */
async function databasesNamed(admin: Client, names: readonly string[]): Promise<Map<string, boolean>> {
  const result = await admin.query(
    "SELECT datname, datallowconn FROM pg_database WHERE datname = ANY($1::text[])", [[...names]]);
  return new Map((result.rows as { datname: string; datallowconn: boolean }[]).map(row => [row.datname, row.datallowconn]));
}

/** Client sessions on `database` other than `ownPid` (autovacuum is stopped by Postgres itself). */
async function otherSessions(admin: Client, database: string, ownPid: number): Promise<number> {
  const result = await admin.query(
    "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND pid <> $2 AND backend_type = 'client backend'",
    [database, ownPid]);
  return (result.rows[0] as { n: number }).n;
}

/** What a file starts with: a pg_dump custom archive, or a deletions export (JSON). */
async function sourceKind(file: string): Promise<"archive" | "export"> {
  const handle = await open(file, "r").catch(ignore);
  if (!handle) throw new BackupError("DELETIONS_SOURCE_NOT_FOUND");
  try {
    const head = Buffer.alloc(5);
    const { bytesRead } = await handle.read(head, 0, 5, 0);
    const text = head.subarray(0, bytesRead).toString("latin1");
    if (text === "PGDMP") return "archive";
    if (text.startsWith("{")) return "export";
    throw new BackupError("DELETIONS_SOURCE_UNREADABLE");
  } finally {
    await handle.close();
  }
}

/**
 * The newer ledgers the owner named: backups, or deletion exports (db:export-deletions), each of
 * the same database and made after the backup restored. An older one is refused, not merged
 * quietly: the owner believes it closes the gap, and it would not.
 */
async function deletionSources(tools: PgTools, files: readonly string[], restored: Readonly<{
  database: string | null; createdAt: Date | null; lineage: string | null; ledger: readonly LedgerEntry[];
}>): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  for (const source of files) {
    const info = await stat(source).catch(ignore);
    if (!info?.isFile()) throw new BackupError("DELETIONS_SOURCE_NOT_FOUND");
    let database: string | null;
    let lineage: string | null;
    let createdAt: Date | null;
    let ledger: readonly LedgerEntry[];
    if (await sourceKind(source) === "archive") {
      const header = await readArchiveHeader(tools, source, "DELETIONS_SOURCE_UNREADABLE");
      database = header.database;
      createdAt = header.createdAt;
      lineage = await readArchiveLineage(tools, source, "DELETIONS_SOURCE_UNREADABLE");
      ledger = await readArchiveLedger(tools, source);
    } else {
      const exported = await readDeletionsExport(source);
      database = exported.database;
      lineage = exported.lineage;
      // An archive's time has whole seconds: one export made in the same second as the dump,
      // before it, must not count as newer.
      createdAt = new Date(Math.floor(Date.parse(exported.exportedAt) / 1000) * 1000);
      ledger = exported.entries;
    }
    if (!createdAt || !restored.createdAt) throw new BackupError("DELETIONS_SOURCE_UNDATED");
    // The same database, and the same lineage (0027): a new server's own export or dump, with its
    // empty ledger, is another database's, however new (review 3, finding 1).
    if (database !== restored.database || !restored.lineage || lineage !== restored.lineage) {
      throw new BackupError("DELETIONS_SOURCE_FOREIGN");
    }
    if (createdAt.getTime() <= restored.createdAt.getTime()) throw new BackupError("DELETIONS_SOURCE_NOT_NEWER");
    // A later copy of the same ledger holds every deletion the older one does.
    const has = new Set(ledger.map(entry => entry.userId));
    if (restored.ledger.some(entry => !has.has(entry.userId))) throw new BackupError("DELETIONS_SOURCE_INCOMPLETE");
    entries.push(...ledger);
  }
  return entries;
}

export async function restoreBackup(options: RestoreOptions): Promise<RestoreReport> {
  const { tools, file, mode } = options;
  const live = pgTarget(options.url);
  const { staging, parked } = restoreNames(live.database);
  const stagingTarget: PgTarget = { ...live, database: staging };
  const maintenance: PgTarget = { ...live, database: "postgres" };
  const info = await stat(file).catch(ignore);
  if (!info?.isFile()) throw new BackupError("RESTORE_FILE_NOT_FOUND");

  const admin = connectClient(maintenance);
  await admin.connect();
  let liveClient: Client | null = null;
  let stagingExists = false;
  let blocked = false;
  try {
    const lock = await admin.query("SELECT pg_try_advisory_lock($1) AS ok", [RESTORE_LOCK]);
    if (!(lock.rows[0] as { ok: boolean }).ok) throw new BackupError("RESTORE_ALREADY_RUNNING");
    const facts = await serverFacts(admin, tools);
    await requireClientMajor(tools, "pg_restore", facts.major);
    await requireSameServer(tools, maintenance, facts.systemIdentifier);
    // A file pg_restore cannot even list fails as a restore would.
    const header = await readArchiveHeader(tools, file, "PG_RESTORE_FAILED");
    const lineage = await readArchiveLineage(tools, file, "PG_RESTORE_FAILED");
    // The backup's own ledger, which any newer source must contain. One that cannot be read
    // refuses the restore (review 4): the check would otherwise pass on nothing.
    let ownLedger: readonly LedgerEntry[] = [];
    if ((options.deletionsFrom ?? []).length > 0) {
      ownLedger = await readArchiveLedger(tools, file).catch(error => {
        throw error instanceof BackupError ? new BackupError("BACKUP_UNREADABLE") : error;
      });
    }
    const fromNewer = await deletionSources(tools, options.deletionsFrom ?? [], { ...header, lineage, ledger: ownLedger });

    const present = await databasesNamed(admin, [live.database, parked]);
    const liveExists = present.has(live.database);
    // Blocked by a --replace that stopped between closing it and the swap: deploy/README.md.
    if (present.get(live.database) === false) throw new BackupError("LIVE_DATABASE_BLOCKED", { database: live.database });
    if (mode === "replace") {
      if (present.has(parked)) throw new BackupError("PARKED_DATABASE_EXISTS", { database: parked });
      if (liveExists && await otherSessions(admin, live.database, -1) > 0) throw new BackupError("LIVE_DATABASE_IN_USE");
    }

    // Step 1. Nothing connects to this name, so one left by an interrupted run is dropped.
    await admin.query(`DROP DATABASE IF EXISTS ${quoted(staging)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${quoted(staging)} TEMPLATE template0`);
    stagingExists = true;
    const restored = await runTool(toolInvocation(tools, "pg_restore", stagingTarget, [
      "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", "--dbname", staging,
    ]), { stdinFile: file });
    if (restored.exitCode !== 0) throw new BackupError("PG_RESTORE_FAILED", { exitCode: restored.exitCode });
    // A Nenaugad backup before anything else is asked of it.
    await withClient(stagingTarget, async client => {
      const tables = await client.query(
        "SELECT to_regclass('public.users') IS NOT NULL AS users, to_regclass('public.account_deletions') IS NOT NULL AS ledger");
      const found = tables.rows[0] as { users: boolean; ledger: boolean };
      if (!found.users || !found.ledger) throw new BackupError("BACKUP_SCHEMA_UNSUPPORTED");
    });

    let ledger: Ledger = { state: "absent", entries: [] };
    let fingerprint = "";
    let ownPid = -1;
    if (liveExists) {
      liveClient = connectClient(live);
      await liveClient.connect();
      if (mode === "replace") {
        // Closed to new connections first; then no one but this session may be on it.
        ownPid = (((await liveClient.query("SELECT pg_backend_pid() AS pid")).rows[0]) as { pid: number }).pid;
        await admin.query(`ALTER DATABASE ${quoted(live.database)} WITH ALLOW_CONNECTIONS false`);
        blocked = true;
        if (await otherSessions(admin, live.database, ownPid) > 0) throw new BackupError("LIVE_DATABASE_IN_USE");
      }
      ledger = await readLedger(liveClient);
      fingerprint = await ledgerFingerprint(liveClient);
    }
    // The live ledger is the newest only if the live database descends from the backup: it must
    // know each of the backup's accounts, as an account or as a deletion. Otherwise (a lost
    // server, a new database even after its migrations) the newest deletions are in the newest
    // export or backup, which the owner must name, or state that there is nothing newer.
    const unknownToLive = ledger.state === "read" && liveClient ? await accountsUnknownToLive(liveClient, stagingTarget) : 0;
    // A live database of another lineage (0027) is another database, whatever it knows.
    const liveLineage = ledger.state === "read" && liveClient ? await databaseLineage(liveClient).catch(ignore) ?? null : null;
    const sameLineage = lineage !== null && liveLineage !== null ? lineage === liveLineage : null;
    const liveIsNewest = ledger.state === "read" && unknownToLive === 0 && sameLineage !== false;
    const deletionGapAccepted = !liveIsNewest && (options.deletionsFrom ?? []).length === 0;
    if (deletionGapAccepted && !options.newestBackup) {
      throw new BackupError("NEWER_DELETIONS_REQUIRED", { accountsUnknownToLive: unknownToLive });
    }

    const applied = await applyLedger(stagingTarget, [...ledger.entries, ...fromNewer]); // step 2
    const checked = await verifyRestored(stagingTarget); // step 3
    const rollback = liveClient ? await aiLedgerRollback(liveClient, stagingTarget) : { operations: 0, budgets: 0 };
    if (mode === "replace" && (rollback.operations > 0 || rollback.budgets > 0) && !options.acceptAiLedgerRollback) {
      throw new BackupError("AI_LEDGER_WOULD_ROLL_BACK", { aiOperations: rollback.operations, aiBudgets: rollback.budgets });
    }

    // Step 4.
    if (mode === "drill") {
      await liveClient?.end();
      liveClient = null;
      await admin.query(`DROP DATABASE ${quoted(staging)} WITH (FORCE)`);
      stagingExists = false;
    } else {
      if (liveClient) {
        // Nothing may have slipped in since the ledger was read.
        if (await otherSessions(admin, live.database, ownPid) > 0) throw new BackupError("LIVE_DATABASE_IN_USE");
        if (await ledgerFingerprint(liveClient) !== fingerprint) throw new BackupError("LIVE_LEDGER_CHANGED");
        await liveClient.end();
        liveClient = null;
      }
      await admin.query("BEGIN");
      try {
        if (liveExists) await admin.query(`ALTER DATABASE ${quoted(live.database)} RENAME TO ${quoted(parked)}`);
        await admin.query(`ALTER DATABASE ${quoted(staging)} RENAME TO ${quoted(live.database)}`);
        await admin.query("COMMIT");
      } catch (error) {
        await admin.query("ROLLBACK").catch(ignore);
        throw error;
      }
      // The parked database keeps connections blocked; the restored one is the live one now.
      stagingExists = false;
      blocked = false;
    }
    return {
      mode, file, database: live.database, backupCreatedAt: header.createdAt?.toISOString() ?? null,
      liveLedger: ledger.state, ledgerEntries: ledger.entries.length, accountsUnknownToLive: unknownToLive, sameLineage,
      deletionSources: (options.deletionsFrom ?? []).length,
      deletionGapAccepted, accountsDeletedAgain: applied.deletedAgain, attemptCountersCleared: applied.countersCleared,
      accountsRestored: checked.accounts, latestMigration: checked.latestMigration,
      aiOperationsRolledBack: rollback.operations, aiBudgetsRolledBack: rollback.budgets,
      replaced: mode === "replace", previousDatabase: mode === "replace" && liveExists ? parked : null,
    };
  } catch (error) {
    const left: Record<string, string | boolean> = {};
    await liveClient?.end().catch(ignore);
    if (blocked) {
      try {
        await admin.query(`ALTER DATABASE ${quoted(live.database)} WITH ALLOW_CONNECTIONS true`);
      } catch {
        left.liveDatabaseBlocked = live.database;
      }
    }
    if (stagingExists) {
      try {
        await admin.query(`DROP DATABASE IF EXISTS ${quoted(staging)} WITH (FORCE)`);
      } catch {
        // It may hold accounts the ledger lists: the owner must know, and the next run drops it.
        left.restoreDatabaseLeft = staging;
      }
    }
    throw withCleanupFacts(error, left);
  } finally {
    await admin.end().catch(ignore);
  }
}

/** The original failure, plus what the cleanup could not undo. */
export function withCleanupFacts(error: unknown, left: SafeFacts): unknown {
  if (Object.keys(left).length === 0) return error;
  if (error instanceof BackupError) return new BackupError(error.message, { ...error.facts, ...left });
  const sqlstate = (error as { code?: unknown } | null)?.code;
  return new BackupError("RESTORE_FAILED", {
    ...(typeof sqlstate === "string" && /^[0-9A-Z]{5}$/u.test(sqlstate) ? { sqlstate } : {}), ...left,
  });
}
