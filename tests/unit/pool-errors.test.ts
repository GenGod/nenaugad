import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { logPoolErrors } from "../../src/server/storage/pool-errors.ts";

// B69: a pool's `error` listener logs the error's code and nothing else. A plain
// EventEmitter stands in for pg's Pool here (labelled: no database in this file); the
// integration test in tests/integration/worker.test.ts ends a real idle connection.

const CONNECTION_STRING = "postgres://b69_user:b69-hunter2@db.b69.internal:5432/b69db";

function fakePool(): { pool: EventEmitter; lines: string[] } {
  const pool = new EventEmitter();
  const lines: string[] = [];
  logPoolErrors(pool, line => { lines.push(line); });
  return { pool, lines };
}

function parsed(line: string | undefined): Record<string, unknown> {
  return JSON.parse(line ?? "") as Record<string, unknown>;
}

test("an idle connection the server ended is logged by its SQLSTATE alone and does not throw", () => {
  const { pool, lines } = fakePool();
  const ended = Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" });
  assert.doesNotThrow(() => pool.emit("error", ended));
  assert.equal(lines.length, 1);
  const logged = parsed(lines[0]);
  assert.deepEqual(Object.keys(logged).sort(), ["code", "event", "ts"]);
  assert.equal(logged.event, "db_pool_error");
  assert.equal(logged.code, "57P01");
  assert.ok(!Number.isNaN(Date.parse(String(logged.ts))));
  assert.ok(!lines[0]?.includes("administrator"), "the message is not logged");
});

test("a Node errno code is logged; anything that is not a short upper-case token is not", () => {
  const { pool, lines } = fakePool();
  pool.emit("error", Object.assign(new Error(`connect ECONNREFUSED ${CONNECTION_STRING}`), { code: "ECONNREFUSED" }));
  pool.emit("error", Object.assign(new Error("socket closed"), { code: "ERR_SOCKET_CLOSED" }));
  pool.emit("error", new Error(`password authentication failed for user "b69_user" at ${CONNECTION_STRING}`));
  pool.emit("error", Object.assign(new Error("x"), { code: CONNECTION_STRING }));
  pool.emit("error", Object.assign(new Error("x"), { code: "57p01" }));
  pool.emit("error", Object.assign(new Error("x"), { code: "A".repeat(33) }));
  pool.emit("error", Object.assign(new Error("x"), { code: 57 }));
  pool.emit("error", `a bare string naming ${CONNECTION_STRING}`);
  pool.emit("error", null);
  assert.deepEqual(lines.map(line => parsed(line).code), [
    "ECONNREFUSED", "ERR_SOCKET_CLOSED",
    "DATABASE_POOL_ERROR", "DATABASE_POOL_ERROR", "DATABASE_POOL_ERROR",
    "DATABASE_POOL_ERROR", "DATABASE_POOL_ERROR", "DATABASE_POOL_ERROR", "DATABASE_POOL_ERROR",
  ]);
  for (const line of lines) {
    assert.deepEqual(Object.keys(parsed(line)).sort(), ["code", "event", "ts"]);
    for (const part of ["b69_user", "b69-hunter2", "db.b69.internal", "b69db", "postgres://"]) {
      assert.ok(!line.includes(part), "no part of the connection string is logged");
    }
  }
});
