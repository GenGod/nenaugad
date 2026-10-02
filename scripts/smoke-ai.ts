// One-time live smoke: exactly one guarded AI call through the full stack.
// Verifies: budget reservation → real OpenAI dispatch → usage-based settlement.
//
// This is the reviewed way to prove the guarded path against the real provider.
// It spends real money, so the gateway refuses it unless LIVE_AI_ENABLED=true
// (docs/OPEN_GAPS.md A1 — the flag, not the key, is the switch). The probe sends
// no candidate facts: the transport's generic JSON prompt is used, so the
// personal-data boundary does not apply to this script.
import { localPool, migrate } from "./db.ts";
import { executeGuardedOperation } from "../src/server/ai/gateway.ts";
import { openAiTransport } from "../src/server/ai/openai-transport.ts";
import { ensureBudget, GLOBAL_BUDGET_ID } from "../src/server/ai/spending.ts";
import { GPT6_LUNA, ownerBudgetId, worstCaseCostMicroCents } from "../src/server/ai/provider.ts";

// A dedicated owner for probes. Its budget row is provisioned here because a
// missing owner row is a refusal, not "no cap" (docs/OPEN_GAPS.md A5).
const SMOKE_OWNER_ID = "u_smoke_ai_001";

const pool = localPool(process.env.DATABASE_URL);
await migrate(pool);
await ensureBudget({
  pool, budgetId: GLOBAL_BUDGET_ID, scope: "global",
  approvedLimitMinor: GPT6_LUNA.globalBudgetMicroCents,
});
await ensureBudget({
  pool, budgetId: ownerBudgetId(SMOKE_OWNER_ID), scope: "owner", ownerId: SMOKE_OWNER_ID,
  period: "monthly", approvedLimitMinor: GPT6_LUNA.ownerMonthlyQuotaMicroCents,
});

const worstCase = worstCaseCostMicroCents({ inputTokens: 1000, outputTokens: 2000 });
console.log("worst-case:", worstCase.toString(), "micro-cents (ceiling:",
  GPT6_LUNA.operationCeilingMicroCents.toString() + ")");

try {
  const result = await executeGuardedOperation({
    pool,
    ownerId: SMOKE_OWNER_ID,
    purpose: "cover_letter",
    // Deliberately unique per invocation: a smoke run is a new paid probe,
    // not a retry of an earlier one.
    idempotencyKey: "smoke-" + Date.now(),
    worstCaseMinor: worstCase,
    transport: openAiTransport,
    now: new Date().toISOString(),
  });
  console.log("=== RESULT ===");
  console.log("status: settled");
  console.log("settledMinor:", result.settledMinor.toString());
  console.log("output (first 200):", result.output.slice(0, 200));
  const budget = await pool.query(
    "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = $1",
    [GLOBAL_BUDGET_ID],
  );
  const row = budget.rows[0] as { settled_minor: string; held_minor: string };
  console.log("budget after: settled=" + row.settled_minor + " held=" + row.held_minor);
  console.log("remaining:", (10000000 - Number(row.settled_minor)).toString(), "micro-cents");
} catch (error) {
  console.error("ERROR:", error instanceof Error ? error.constructor.name + ": " + error.message : String(error));
  const budget = await pool.query(
    "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = $1",
    [GLOBAL_BUDGET_ID],
  ).catch(() => ({ rows: [{ settled_minor: "?", held_minor: "?" }] }));
  const row = budget.rows[0] as { settled_minor: string; held_minor: string };
  console.log("budget after error: settled=" + row.settled_minor + " held=" + row.held_minor);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => undefined);
}
