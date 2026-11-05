// npm run db:restore -- <absolute file> --drill|--replace (DEPLOY-003, SP-T22;
// deploy/README.md "Restore" and "The restore drill").
//   --drill    restore into <db>_restore, re-apply every account deletion, check, report, drop it;
//   --replace  the same, then swap it in for DATABASE_URL's database, which is parked as
//              <db>_before_restore. Web, worker and the backup timer must be stopped first.
//   --deletions-from=<newer backup>  (repeatable) apply that backup's deletion ledger too;
//   --newest-backup                  with no live database, state that no newer backup exists;
//   --accept-ai-ledger-rollback      let --replace roll the AI spending ledger back.
// Prints one JSON line of counts and database names; never a URL, a password or a row.
import { localDatabaseUrl, readConfig } from "../src/server/config.ts";
import { restoreBackup } from "../src/server/backup/restore.ts";
import { failureReport, restoreArguments } from "../src/server/backup/cli.ts";
import { pgToolsFrom } from "../src/server/backup/pg-tools.ts";

try {
  readConfig(process.env);
  const parsed = restoreArguments(process.argv.slice(2));
  const report = await restoreBackup({
    ...parsed, url: localDatabaseUrl(process.env.DATABASE_URL), tools: pgToolsFrom(process.env),
  });
  console.log(JSON.stringify({ ok: true, ...report }));
} catch (error) {
  console.error(JSON.stringify(failureReport(error, "RESTORE_FAILED")));
  process.exitCode = 1;
}
