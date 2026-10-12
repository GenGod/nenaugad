// Operator reconciliation of AI holds (task A6, owner decision 2026-10-01; settle: B47-001).
//
//   npm run ai:holds                                     — list the operations that hold money
//   npm run ai:holds -- --cancel=op_...                  — release one hold, booking nothing
//   npm run ai:holds -- --settle=op_... --amount=<μ$>    — book an uncertain call's charge
//                       [--above-reservation]              (also above its reservation)
//
// Why: a failed provider call leaves its operation `uncertain` — the money stays
// reserved, because "the call may have gone out and been charged". Nobody released
// such holds: they piled up and in the end ate the budget, after which everything
// failed with BUDGET_EXCEEDED (docs/OPEN_GAPS.md A6).
//
// Why a human command and not an automatic cleanup: releasing a hold means deciding
// that the provider did NOT charge, and settling one means deciding what it did
// charge. Automation cannot decide that: if it errs, the bill and the budget diverge.
// So the command prints the list (id, type, status, age, reserved amount) and acts only
// on what is named explicitly, one id at a time, after the owner checks the provider's
// usage page. Arguments it does not understand are refused (scripts/ai-holds-args.ts).
//
// What it prints: ids, statuses, amounts and times. No prompts, no texts (there are
// none here), no personal data.
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { localPool, migrate } from "./db.ts";
import { holdsCommand } from "./ai-holds-args.ts";
import {
  BudgetError, HOLDING_STATUSES, cancelOperation, getOperation, settleOperation,
} from "../src/server/ai/spending.ts";
import { MICRO_USD_PER_DOLLAR } from "../src/server/ai/provider.ts";

const UNIT = "--amount is micro-dollars, the ledger's unit: $0.0123 = 12300";

/** Ledger amounts are micro-dollars (μ$); shown here in cents. */
function microUsdToCents(value: bigint): string {
  return (Number(value) / Number(MICRO_USD_PER_DOLLAR / 100n)).toFixed(4);
}

const parsed = holdsCommand(process.argv.slice(2));
if (!parsed.ok) {
  // Refused before the database is touched.
  console.error(JSON.stringify({
    ok: false, code: "USAGE", note: UNIT,
    usage: "npm run ai:holds [-- --cancel=<operationId> | --settle=<operationId> --amount=<μ$> [--above-reservation]]",
  }));
  process.exitCode = 1;
} else {
  let pool: ReturnType<typeof localPool> | undefined;
  try {
    readConfig(process.env);
    pool = localPool(localDatabaseUrl(process.env.DATABASE_URL));
    await migrate(pool);
    const now = new Date().toISOString();
    const { command } = parsed;

    if (command.kind !== "list") {
      const operationId = command.operationId;
      const found = await pool.query(
        "SELECT owner_id, reserved_minor FROM ai_operations WHERE id = $1",
        [operationId],
      );
      const row = found.rows[0] as { owner_id: string; reserved_minor: string } | undefined;
      if (!row) {
        console.error(JSON.stringify({ ok: false, code: "OPERATION_NOT_FOUND", operationId }));
        process.exitCode = 1;
      } else if (command.kind === "cancel") {
        try {
          await cancelOperation({ pool, ownerId: row.owner_id, operationId, now });
          console.log(JSON.stringify({
            ok: true, operationId, releasedMicroUsd: row.reserved_minor,
            releasedCents: microUsdToCents(BigInt(row.reserved_minor)),
            note: "the hold is released; if the provider did charge, the ledger now understates the spend,"
              + " and a cancelled operation cannot be settled later — book an uncertain call it charged with --settle",
          }));
        } catch (error) {
          const code = error instanceof BudgetError ? error.message : "CANCEL_FAILED";
          console.error(JSON.stringify({ ok: false, code, operationId }));
          process.exitCode = 1;
        }
      } else {
        try {
          const settled = await settleOperation({
            pool, ownerId: row.owner_id, operationId, actualMinor: command.amountMicroUsd, now,
            lateReceipt: { allowAboveReservation: command.aboveReservation },
          });
          console.log(JSON.stringify({
            ok: true, operationId, releasedMicroUsd: row.reserved_minor,
            settledMicroUsd: settled.settledMinor.toString(), settledCents: microUsdToCents(settled.settledMinor),
            note: settled.settledMinor > BigInt(row.reserved_minor)
              ? "booked above the reservation: the budget may now sit over its limit, which refuses every"
                + " new reservation until the owner raises it"
              : "the hold is converted into the charge from the provider's usage page",
          }));
        } catch (error) {
          const code = error instanceof BudgetError ? error.message : "SETTLE_FAILED";
          // Read after the refusal: the status the owner has to act on now.
          const current = code === "WRONG_STATE"
            ? await getOperation({ pool, ownerId: row.owner_id, operationId })
            : null;
          console.error(JSON.stringify({
            ok: false, code, operationId,
            ...(current ? {
              status: current.status,
              hint: current.status === "in_flight"
                ? "a late receipt is only for an uncertain call; an in-flight one may still be running (B48)"
                : "a late receipt is only for an uncertain call",
            } : {}),
            ...(code === "AMOUNT_ABOVE_RESERVATION" ? {
              reservedMicroUsd: row.reserved_minor,
              hint: `check the unit (${UNIT}); a charge really above the worst case is booked with --above-reservation`,
            } : {}),
          }));
          process.exitCode = 1;
        }
      }
    } else {
      const held = await pool.query(
        `SELECT id, owner_id, task_type, status, attempt_count, reserved_minor, settled_minor, updated_at
         FROM ai_operations WHERE status = ANY($1::text[]) ORDER BY updated_at`,
        // The statuses the extraction pass stops on (B31): one list, so they cannot drift.
        [[...HOLDING_STATUSES]],
      );
      const rows = held.rows.map(row => {
        const record = row as Record<string, unknown>;
        return {
          operationId: String(record.id),
          ownerId: `${String(record.owner_id).slice(0, 8)}…`,
          taskType: String(record.task_type),
          status: String(record.status),
          attempts: Number(record.attempt_count),
          reservedMicroUsd: String(record.reserved_minor),
          heldCents: microUsdToCents(BigInt(String(record.reserved_minor)) - BigInt(String(record.settled_minor))),
          updatedAt: new Date(record.updated_at as Date).toISOString(),
        };
      });
      console.log(JSON.stringify({
        ok: true,
        now,
        holdingOperations: rows.length,
        // Held money is read straight from the budget rows, not summed from
        // operations: the ledger is the authority on what is held.
        budgets: (await pool.query(
          "SELECT id, scope, approved_limit_minor, settled_minor, held_minor FROM ai_budgets ORDER BY id LIMIT 5",
        )).rows,
        operations: rows,
        hint: rows.length === 0
          ? "nothing is holding money"
          : "after checking the provider's usage page: an uncertain call it charged —"
            + " npm run ai:holds -- --settle=<operationId> --amount=<μ$>; a hold it did not charge —"
            + ` npm run ai:holds -- --cancel=<operationId> (${UNIT})`,
      }));
    }
  } catch (error) {
    const code = error instanceof ConfigurationError ? error.message : "AI_HOLDS_FAILED";
    console.error(JSON.stringify({ ok: false, code }));
    process.exitCode = 1;
  } finally {
    // Also after a failure: an open pool keeps the process alive until its idle timeout.
    await pool?.end().catch(() => undefined);
  }
}
