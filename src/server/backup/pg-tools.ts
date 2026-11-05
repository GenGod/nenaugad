// How Nenaugad runs pg_dump, pg_restore and psql (DEPLOY-003, tasks/DEPLOY-003-backup-restore.md).
//
// On the server the tools are PGDG's postgresql-client-17 on the host, called by path
// (PG_BIN_DIR=/usr/lib/postgresql/17/bin) as the unprivileged app user: the database runs in
// Docker, and `docker exec` is root on that server. A development machine without a matching
// client names the database container instead (PG_TOOLS_CONTAINER), and the tools run inside
// it, the server's own version by construction. Either way:
// - the password reaches a tool only as PGPASSWORD in its environment, never as an argument;
// - that environment is an allowlist, so no other secret (AUTH_SECRET, DATABASE_URL, an API
//   key) and no PG* setting that could redirect the connection reaches the tool;
// - the tools' stderr is read and dropped: their errors can quote rows ("CONTEXT: COPY users,
//   line 1: ..."), and the owner gets a code instead.
import { type ChildProcess, spawn, type StdioOptions } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";

export type PgProgram = "pg_dump" | "pg_restore" | "psql";

export type PgTools =
  | Readonly<{ kind: "host"; binDir: string | null }>
  | Readonly<{ kind: "container"; container: string }>;

export type PgTarget = Readonly<{ host: string; port: number; user: string; password: string; database: string }>;

export type ToolInvocation = Readonly<{ command: string; args: readonly string[]; env: Record<string, string> }>;

/** Facts an error may carry to the owner: numbers and database names, never a value from a row. */
export type SafeFacts = Readonly<Record<string, string | number | boolean | null>>;

export class BackupError extends Error {
  readonly facts: SafeFacts;
  constructor(code: string, facts: SafeFacts = {}) {
    super(code); // The code only: never a URL, a password or anything a tool printed.
    this.name = "BackupError";
    this.facts = facts;
  }
}

/** Inside the container the server listens on the image's default port, whatever the host maps. */
export const CONTAINER_PORT = 5432;
const CONTAINER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/u;
/** A connection attempt gives up after this many seconds instead of hanging a timer. */
const CONNECT_TIMEOUT_SECONDS = "10";
/** Enough for a table of contents or one psql value; more is not kept. */
const CAPTURE_LIMIT = 4 * 1024 * 1024;

// What a tool needs from the parent environment to start (Windows needs the first group to
// run docker.exe; docker needs its own settings). Compared without case: Windows spells PATH
// "Path". Everything else stays behind.
const PASSED = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR",
  "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "LANG",
  "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "DOCKER_CERT_PATH", "DOCKER_TLS_VERIFY",
]);

/** Where the tools come from: PG_BIN_DIR, PATH, or one named container; never two at once. */
export function pgToolsFrom(env: Readonly<Record<string, string | undefined>>): PgTools {
  const container = env.PG_TOOLS_CONTAINER?.trim() ?? "";
  const binDir = env.PG_BIN_DIR?.trim() ?? "";
  if (container && binDir) throw new BackupError("PG_TOOLS_AMBIGUOUS");
  if (container) {
    if (!CONTAINER_NAME.test(container)) throw new BackupError("PG_TOOLS_CONTAINER_INVALID");
    return { kind: "container", container };
  }
  if (binDir) {
    if (!path.isAbsolute(binDir)) throw new BackupError("PG_BIN_DIR_NOT_ABSOLUTE");
    return { kind: "host", binDir: path.normalize(binDir) };
  }
  return { kind: "host", binDir: null };
}

export function assertDatabaseName(name: string): string {
  if (!DATABASE_NAME.test(name)) throw new BackupError("DATABASE_NAME_INVALID");
  return name;
}

/**
 * The connection a tool makes, from a URL that `localDatabaseUrl` has already accepted
 * (loopback, no options). `database` names a sibling database on the same server.
 */
export function pgTarget(url: string, database?: string): PgTarget {
  const parsed = new URL(url);
  return {
    host: parsed.hostname.replace(/^\[(.*)\]$/u, "$1"),
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: assertDatabaseName(database ?? parsed.pathname.slice(1)),
  };
}

/** The node-postgres settings for the same target: the same server, user and password. */
export function clientConfig(target: PgTarget) {
  return {
    host: target.host, port: target.port, user: target.user, password: target.password,
    database: target.database, connectionTimeoutMillis: 5000, statement_timeout: 60_000,
  };
}

/** For a failure reported another way: by the next query, an exit code, or the error already thrown. */
export function ignore(): undefined {
  return undefined;
}

/**
 * A node-postgres client for the target, not yet connected. A connection the server ends between
 * queries is reported by the next query; without an `error` listener it would crash the command
 * with a stack instead of its one JSON line.
 */
export function connectClient(target: PgTarget): Client {
  const client = new Client(clientConfig(target));
  client.on("error", ignore);
  return client;
}

export function childEnvironment(parent: Readonly<Record<string, string | undefined>>, password: string | null): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(parent)) {
    if (value !== undefined && PASSED.has(name.toUpperCase())) env[name] = value;
  }
  env.PGCONNECT_TIMEOUT = CONNECT_TIMEOUT_SECONDS;
  // pg_dump stores the archive's creation time in its own local time and pg_restore reads it in
  // its own: both in UTC, so a restore can tell which of two backups is newer.
  env.TZ = "UTC";
  if (password !== null) env.PGPASSWORD = password;
  return env;
}

/**
 * The command line for one tool. With a target, the connection comes first and never prompts
 * (--no-password); without one (`--version`), no connection and no password are passed.
 */
export function toolInvocation(
  tools: PgTools, program: PgProgram, target: PgTarget | null, args: readonly string[],
  parentEnv: Readonly<Record<string, string | undefined>> = process.env,
): ToolInvocation {
  const env = childEnvironment(parentEnv, target ? target.password : null);
  const connect = (host: string, port: number) => target
    ? ["--host", host, "--port", String(port), "--username", target.user, "--no-password"] : [];
  if (tools.kind === "host") {
    return {
      command: tools.binDir ? path.join(tools.binDir, program) : program,
      args: [...(target ? connect(target.host, target.port) : []), ...args],
      env,
    };
  }
  // docker copies the named variables from its own environment: only the names are on its
  // command line.
  const passed = target ? ["-e", "PGPASSWORD", "-e", "PGCONNECT_TIMEOUT"] : [];
  return {
    command: "docker",
    args: ["exec", "-i", "-e", "TZ", ...passed, tools.container, program, ...connect("127.0.0.1", CONTAINER_PORT), ...args],
    env,
  };
}

export type ToolIo = Readonly<{ stdinFile?: string; stdoutFile?: string; captureStdout?: boolean }>;

/**
 * Runs one tool to its end. stdout goes to a new private file (created here, never
 * overwritten), into memory, or nowhere; stdin can come from a file. stderr is dropped.
 * A tool that cannot start is `PG_TOOL_NOT_FOUND`; the exit code is the caller's to judge.
 */
export async function runTool(invocation: ToolInvocation, io: ToolIo = {}): Promise<{ exitCode: number; stdout: string }> {
  const stdio: StdioOptions = [io.stdinFile ? "pipe" : "ignore", io.stdoutFile || io.captureStdout ? "pipe" : "ignore", "pipe"];
  const child: ChildProcess = spawn(invocation.command, [...invocation.args], {
    // The allowlisted environment, whole: nothing of the parent's is merged back in.
    env: invocation.env as NodeJS.ProcessEnv,
    stdio,
    windowsHide: true,
  });
  const exit = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => resolve(code ?? (signal ? 128 : 1)));
  });
  child.stderr?.resume();
  const writes: Promise<unknown>[] = [];
  let captured = "";
  if (io.stdoutFile && child.stdout) {
    writes.push(pipeline(child.stdout, createWriteStream(io.stdoutFile, { flags: "wx", mode: 0o600 })));
  } else if (io.captureStdout && child.stdout) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (captured.length < CAPTURE_LIMIT) captured += chunk;
    });
  }
  if (io.stdinFile && child.stdin) {
    // A tool may stop reading early (a table of contents, or a failure): the exit code says
    // which, so a broken pipe here is not an error of its own.
    void pipeline(createReadStream(io.stdinFile), child.stdin).catch(ignore);
  }
  let exitCode: number;
  try {
    exitCode = await exit;
  } catch (error) {
    await Promise.allSettled(writes);
    const missing = (error as { code?: unknown } | null)?.code === "ENOENT";
    throw new BackupError(missing ? "PG_TOOL_NOT_FOUND" : "PG_TOOL_FAILED", { tool: invocation.command === "docker" ? "docker" : path.basename(invocation.command) });
  }
  const written = await Promise.allSettled(writes);
  if (written.some(result => result.status === "rejected")) throw new BackupError("BACKUP_WRITE_FAILED");
  return { exitCode, stdout: captured };
}

/** "pg_dump (PostgreSQL) 17.11 (Debian ...)" → 17. */
export function parseClientMajor(versionLine: string): number | null {
  const match = /\(PostgreSQL\)\s+(\d+)/u.exec(versionLine);
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * The tool's major version must be the server's: pg_dump refuses a newer server, and an
 * archive from a newer pg_dump is not guaranteed to load into an older one.
 */
export async function requireClientMajor(tools: PgTools, program: PgProgram, serverMajor: number): Promise<void> {
  const answer = await runTool(toolInvocation(tools, program, null, ["--version"]), { captureStdout: true });
  checkClientMajor(answer, program, serverMajor);
}

/** What `<tool> --version` answered, judged against the server's major version. */
export function checkClientMajor(
  answer: Readonly<{ exitCode: number; stdout: string }>, program: PgProgram, serverMajor: number,
): void {
  const client = answer.exitCode === 0 ? parseClientMajor(answer.stdout) : null;
  if (client === null) throw new BackupError("PG_CLIENT_VERSION_UNKNOWN", { tool: program });
  if (client !== serverMajor) throw new BackupError("PG_CLIENT_VERSION_MISMATCH", { tool: program, client, server: serverMajor });
}

/**
 * A named container must hold the very server DATABASE_URL reaches; otherwise a backup could
 * dump another server's database of the same name. The cluster's system identifier says.
 */
export async function requireSameServer(tools: PgTools, target: PgTarget, systemIdentifier: string): Promise<void> {
  if (tools.kind !== "container") return;
  const { exitCode, stdout } = await runTool(toolInvocation(tools, "psql", target, [
    "--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "--dbname", target.database,
    "--command", "SELECT system_identifier FROM pg_control_system()",
  ]), { captureStdout: true });
  if (exitCode !== 0) throw new BackupError("PG_TOOL_FAILED", { tool: "psql", exitCode });
  if (stdout.trim() !== systemIdentifier) throw new BackupError("PG_TOOLS_CONTAINER_MISMATCH");
}

/** The server's major version and, for a container check, its system identifier. */
export async function serverFacts(
  client: { query: (sql: string) => Promise<{ rows: unknown[] }> }, tools: PgTools,
): Promise<{ major: number; systemIdentifier: string }> {
  const version = await client.query("SELECT current_setting('server_version_num')::int AS n");
  const major = Math.floor((version.rows[0] as { n: number }).n / 10000);
  if (tools.kind !== "container") return { major, systemIdentifier: "" };
  const control = await client.query("SELECT system_identifier::text AS id FROM pg_control_system()");
  return { major, systemIdentifier: (control.rows[0] as { id: string }).id };
}
