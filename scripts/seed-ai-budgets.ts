// One-time budget initialization (AI-002): sets up the owner-approved
// global and per-user budget caps. Safe to re-run (ON CONFLICT DO NOTHING).
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { localPool, migrate } from "./db.ts";
import { ensureBudget, GLOBAL_BUDGET_ID } from "../src/server/ai/spending.ts";
import { GPT6_LUNA } from "../src/server/ai/provider.ts";

try {
  readConfig(process.env);
  const pool = localPool(localDatabaseUrl(process.env.DATABASE_URL));
  await migrate(pool);
  await ensureBudget({
    pool, budgetId: GLOBAL_BUDGET_ID, scope: "global",
    approvedLimitMinor: GPT6_LUNA.globalBudgetMicroCents,
  });
  console.log(JSON.stringify({
    ok: true,
    globalBudget: `${GLOBAL_BUDGET_ID}: ${GPT6_LUNA.globalBudgetMicroCents} micro-cents ($${Number(GPT6_LUNA.globalBudgetMicroCents) / 10000 / 100})`,
    operationCeiling: `${GPT6_LUNA.operationCeilingMicroCents} micro-cents`,
    ownerQuota: `${GPT6_LUNA.ownerMonthlyQuotaMicroCents} micro-cents/month`,
  }));
  await pool.end();
} catch (error) {
  const code = error instanceof ConfigurationError ? error.message : "SEED_FAILED";
  console.error(JSON.stringify({ ok: false, code }));
  process.exit(1);
}
