// Операторская разборка зависших холдов (задача A6, решение владельца 2026-10-01).
//
//   npm run ai:holds                     — показать операции, которые держат деньги
//   npm run ai:holds -- --cancel=op_...  — освободить конкретный холд
//
// Зачем: неудачный вызов провайдера оставляет операцию в `uncertain` — деньги
// остаются зарезервированными, потому что «вызов мог уйти и списаться». Такие
// холды никто не освобождал: они копились и в пределе съедали бюджет, после чего
// всё начинало падать с BUDGET_EXCEEDED (docs/OPEN_GAPS.md A6).
//
// Почему это команда человека, а не автоочистка: освободить холд — значит решить,
// что провайдер НЕ списал эти деньги. Автоматика такого решать не может: если она
// ошибётся в другую сторону, счёт разойдётся с бюджетом. Поэтому команда печатает
// список (id, тип, статус, возраст, зарезервированная сумма) и освобождает только
// то, что названо явно, по одному id за раз.
//
// Что печатается: идентификаторы, статусы, суммы и время. Ни промптов, ни текстов
// (их здесь и нет), ни персональных данных.
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { localPool, migrate } from "./db.ts";
import { BudgetError, HOLDING_STATUSES, cancelOperation } from "../src/server/ai/spending.ts";

function microCentsToCents(value: bigint): string {
  return (Number(value) / 10_000).toFixed(4);
}

try {
  readConfig(process.env);
  const pool = localPool(localDatabaseUrl(process.env.DATABASE_URL));
  await migrate(pool);
  const now = new Date().toISOString();
  const cancelId = process.argv.find(argument => argument.startsWith("--cancel="))?.slice("--cancel=".length);

  if (cancelId) {
    const found = await pool.query(
      "SELECT owner_id, status, reserved_minor, settled_minor FROM ai_operations WHERE id = $1",
      [cancelId],
    );
    const row = found.rows[0] as
      | { owner_id: string; status: string; reserved_minor: string; settled_minor: string }
      | undefined;
    if (!row) {
      console.error(JSON.stringify({ ok: false, code: "OPERATION_NOT_FOUND", operationId: cancelId }));
      process.exitCode = 1;
    } else {
      try {
        await cancelOperation({ pool, ownerId: row.owner_id, operationId: cancelId, now });
        console.log(JSON.stringify({
          ok: true, operationId: cancelId, releasedMicroCents: row.reserved_minor,
          releasedCents: microCentsToCents(BigInt(row.reserved_minor)),
          note: "the hold is released; if the provider did charge, the ledger now understates the spend —"
            + " check the provider's usage page before cancelling in bulk",
        }));
      } catch (error) {
        const code = error instanceof BudgetError ? error.message : "CANCEL_FAILED";
        console.error(JSON.stringify({ ok: false, code, operationId: cancelId }));
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
        reservedMicroCents: String(record.reserved_minor),
        heldCents: microCentsToCents(BigInt(String(record.reserved_minor)) - BigInt(String(record.settled_minor))),
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
        : "release one with: npm run ai:holds -- --cancel=<operationId> (after checking the provider's usage page)",
    }));
  }
  await pool.end();
} catch (error) {
  const code = error instanceof ConfigurationError ? error.message : "AI_HOLDS_FAILED";
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
}
