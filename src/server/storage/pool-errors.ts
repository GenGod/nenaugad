// A pool's `error` listener for long-lived processes (B69-001). When the server ends a
// connection the pool holds idle (a restart: FATAL 57P01, "terminating connection due to
// administrator command"), pg-pool removes that client and re-emits the error on the pool;
// with no listener Node throws it and the process exits. With this listener the error is one
// JSON line and the pool's next query opens a new connection.
//
// Only the code is logged: a pg message can name the user, host or database, and the
// connection string is never logged. No `pg` import, so the unit tests stay offline.

type ErrorEmitter = { on(event: "error", listener: (error: unknown) => void): unknown };

/** An SQLSTATE (57P01) or a Node errno (ECONNRESET, ERR_SOCKET_CLOSED); nothing else. */
const CODE_TOKEN = /^[A-Z0-9_]{1,32}$/u;

function errorCode(error: unknown): string {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && CODE_TOKEN.test(code) ? code : "DATABASE_POOL_ERROR";
}

export function logPoolErrors(
  pool: ErrorEmitter,
  write: (line: string) => void = line => { console.error(line); },
): void {
  pool.on("error", error => {
    write(JSON.stringify({ ts: new Date().toISOString(), event: "db_pool_error", code: errorCode(error) }));
  });
}
