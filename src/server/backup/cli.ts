// The arguments and the failure line of `npm run db:backup` and `npm run db:restore`
// (DEPLOY-003). A command that copies or replaces the database refuses an argument it does
// not understand, and says why with a code: never with an error's message, which can carry a
// connection string or a row.
import path from "node:path";
import { ConfigurationError } from "../config.ts";
import { BackupError } from "./pg-tools.ts";
import type { RestoreMode } from "./restore.ts";

/** `db:backup [--dir=<absolute path>]`; without --dir, BACKUP_DIR names the directory. */
export function backupArguments(argv: readonly string[]): Readonly<{ dir: string | null }> {
  if (argv.length === 0) return { dir: null };
  const match = argv.length === 1 ? /^--dir=(.+)$/u.exec(argv[0] ?? "") : null;
  if (!match?.[1]) throw new BackupError("BACKUP_ARGUMENTS_INVALID");
  return { dir: match[1] };
}

export type RestoreArguments = Readonly<{
  file: string; mode: RestoreMode; deletionsFrom: readonly string[];
  newestBackup: boolean; acceptAiLedgerRollback: boolean;
}>;

/**
 * `db:restore <absolute file> --drill|--replace [--deletions-from=<absolute file>]...
 * [--newest-backup] [--accept-ai-ledger-rollback]`: one file, one mode, each flag at most once
 * (--deletions-from may repeat), nothing else.
 */
export function restoreArguments(argv: readonly string[]): RestoreArguments {
  const modes: string[] = [];
  const files: string[] = [];
  const deletionsFrom: string[] = [];
  const flags = new Set<string>();
  for (const argument of argv) {
    const source = /^--deletions-from=(.+)$/u.exec(argument)?.[1];
    if (argument === "--drill" || argument === "--replace") modes.push(argument);
    else if (source !== undefined) deletionsFrom.push(source);
    else if (argument === "--newest-backup" || argument === "--accept-ai-ledger-rollback") {
      if (flags.has(argument)) throw new BackupError("RESTORE_ARGUMENTS_INVALID");
      flags.add(argument);
    } else if (!argument.startsWith("-")) files.push(argument);
    else throw new BackupError("RESTORE_ARGUMENTS_INVALID");
  }
  if (modes.length !== 1 || files.length !== 1) throw new BackupError("RESTORE_ARGUMENTS_INVALID");
  // Naming newer backups and stating there are none contradict each other.
  if (flags.has("--newest-backup") && deletionsFrom.length > 0) throw new BackupError("RESTORE_ARGUMENTS_INVALID");
  for (const file of [...files, ...deletionsFrom]) {
    if (!path.isAbsolute(file)) throw new BackupError("RESTORE_FILE_NOT_ABSOLUTE");
  }
  return {
    file: path.normalize(files[0]!), mode: modes[0] === "--drill" ? "drill" : "replace",
    deletionsFrom: deletionsFrom.map(file => path.normalize(file)),
    newestBackup: flags.has("--newest-backup"), acceptAiLedgerRollback: flags.has("--accept-ai-ledger-rollback"),
  };
}

/** The one line a failed command prints: a code and safe facts. */
export function failureReport(error: unknown, fallback: string): Record<string, string | number | boolean | null> {
  if (error instanceof BackupError) return { ok: false, code: error.message, ...error.facts };
  if (error instanceof ConfigurationError) return { ok: false, code: error.message };
  const code = (error as { code?: unknown } | null)?.code;
  // A system error first: EPERM or EBUSY has five capitals too, but no SQLSTATE class starts
  // with E.
  if (typeof code === "string" && /^E[A-Z]{2,30}$/u.test(code)) return { ok: false, code: fallback, cause: code };
  if (typeof code === "string" && /^[0-9A-Z]{5}$/u.test(code)) return { ok: false, code: fallback, sqlstate: code };
  return { ok: false, code: fallback };
}
