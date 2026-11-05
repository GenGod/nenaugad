// npm run db:export-deletions [-- --dir=<absolute path>] (DEPLOY-003; owner decision
// 2026-11-05, every 15 minutes through nenaugad-deletions.timer; deploy/README.md, Off-site copy).
// Writes the deletion ledger (account ids and deletion times) as account-deletions-<UTC>.json
// into BACKUP_DIR (or --dir), mode 600, only when it changed since the newest file there.
// Prints one JSON line: whether it wrote, the file, the entry count, the entries' SHA-256;
// never an id, a URL or a password.
import { fileURLToPath } from "node:url";
import { localDatabaseUrl, readConfig } from "../src/server/config.ts";
import { exportDeletions } from "../src/server/backup/deletions.ts";
import { backupArguments, failureReport } from "../src/server/backup/cli.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

try {
  readConfig(process.env);
  const { dir } = backupArguments(process.argv.slice(2));
  const result = await exportDeletions({
    url: localDatabaseUrl(process.env.DATABASE_URL), dir: dir ?? process.env.BACKUP_DIR, repositoryRoot,
  });
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  console.error(JSON.stringify(failureReport(error, "EXPORT_FAILED")));
  process.exitCode = 1;
}
