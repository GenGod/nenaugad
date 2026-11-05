// npm run db:backup [-- --dir=<absolute path>] (DEPLOY-003, deploy/README.md "Backups").
// Writes one pg_dump custom-format file of DATABASE_URL's database into BACKUP_DIR (or --dir),
// outside the repository, mode 600. Prints one JSON line: the file, its size and SHA-256, the
// database name; never a URL, a password or a row. pg_dump comes from PG_BIN_DIR, PATH or
// PG_TOOLS_CONTAINER (src/server/backup/pg-tools.ts).
import { fileURLToPath } from "node:url";
import { localDatabaseUrl, readConfig } from "../src/server/config.ts";
import { takeBackup } from "../src/server/backup/backup.ts";
import { backupArguments, failureReport } from "../src/server/backup/cli.ts";
import { pgToolsFrom } from "../src/server/backup/pg-tools.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

try {
  readConfig(process.env);
  const { dir } = backupArguments(process.argv.slice(2));
  const result = await takeBackup({
    url: localDatabaseUrl(process.env.DATABASE_URL),
    tools: pgToolsFrom(process.env),
    dir: dir ?? process.env.BACKUP_DIR,
    repositoryRoot,
  });
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  console.error(JSON.stringify(failureReport(error, "BACKUP_FAILED")));
  process.exitCode = 1;
}
