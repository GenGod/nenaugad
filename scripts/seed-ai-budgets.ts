// One-time budget initialization (AI-002, 2026-09-25; per-user quota provisioned
// on 2026-10-01). Safe to re-run: every insert is ON CONFLICT DO NOTHING.
//
// Two kinds of row matter, not one:
//   * the global budget — the environment-wide ceiling;
//   * the per-owner monthly quota, which used to exist only as a value in the
//     provider config: the ledger treated a missing owner row as "no cap", so the
//     approved quota was unenforceable (docs/OPEN_GAPS.md A5). New users get their
//     row at registration (src/server/users.ts); this script backfills everyone
//     who already existed.
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { localPool, migrate } from "./db.ts";
import { ensureBudget, GLOBAL_BUDGET_ID } from "../src/server/ai/spending.ts";
import { GPT6_LUNA, ownerBudgetId } from "../src/server/ai/provider.ts";

try {
  readConfig(process.env);
  const pool = localPool(localDatabaseUrl(process.env.DATABASE_URL));
  await migrate(pool);
  await ensureBudget({
    pool, budgetId: GLOBAL_BUDGET_ID, scope: "global",
    approvedLimitMinor: GPT6_LUNA.globalBudgetMicroCents,
  });
  const users = await pool.query("SELECT id FROM users ORDER BY id");
  for (const row of users.rows as { id: string }[]) {
    await ensureBudget({
      pool, budgetId: ownerBudgetId(row.id), scope: "owner", ownerId: row.id,
      period: "monthly", approvedLimitMinor: GPT6_LUNA.ownerMonthlyQuotaMicroCents,
    });
  }
  const quotas = await pool.query("SELECT COUNT(*) AS total FROM ai_budgets WHERE scope = 'owner'");
  console.log(JSON.stringify({
    ok: true,
    globalBudget: `${GLOBAL_BUDGET_ID}: ${GPT6_LUNA.globalBudgetMicroCents} micro-cents ($${Number(GPT6_LUNA.globalBudgetMicroCents) / 10000 / 100})`,
    operationCeiling: `${GPT6_LUNA.operationCeilingMicroCents} micro-cents`,
    ownerQuota: `${GPT6_LUNA.ownerMonthlyQuotaMicroCents} micro-cents/month`,
    users: users.rowCount,
    ownerBudgetRows: Number((quotas.rows[0] as { total: string }).total),
  }));
  await pool.end();
} catch (error) {
  const code = error instanceof ConfigurationError ? error.message : "SEED_FAILED";
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
}
