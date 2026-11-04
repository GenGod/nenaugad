export type Config = Readonly<{
  /** `production` exists since DEPLOY-002; it is not a readiness claim (no restore yet). */
  environment: "local" | "test" | "production";
  backend: "fixture" | "postgres";
  /** Live AI is off unless the owner turns it on explicitly. */
  liveAi: boolean;
  /** Live sources have no flag: the per-source policies are the control. */
  liveSources: false;
  uploads: boolean;
}>;

export class ConfigurationError extends Error {
  constructor(code: string) {
    super(code); // Never include values or a database URL in public/logged errors.
    this.name = "ConfigurationError";
  }
}

/**
 * The server secret, read as next-auth reads it: `NEXTAUTH_SECRET`, else `AUTH_SECRET`
 * (`src/server/auth.ts` leaves the choice to next-auth). Empty is no secret. It signs
 * sessions and keys the login counters (B54); callers never log or return it.
 */
export function authSecret(env: Record<string, string | undefined>): string | null {
  const secret = env.NEXTAUTH_SECRET ?? env.AUTH_SECRET;
  return secret ? secret : null;
}

/**
 * The service-wide registration limit per 15-minute window (B55, owner decisions
 * 2026-10-13): `REGISTRATION_LIMIT`, a whole number from 1 to 10 000, or 10 when unset or
 * empty. Any other value refuses registration rather than guessing.
 */
export function registrationLimit(env: Record<string, string | undefined>): number {
  const raw = env.REGISTRATION_LIMIT;
  if (raw === undefined || raw === "") return 10;
  if (!/^[1-9][0-9]{0,4}$/u.test(raw) || Number(raw) > 10_000) {
    throw new ConfigurationError("REGISTRATION_LIMIT_INVALID");
  }
  return Number(raw);
}

/**
 * Session secrets committed in this public repository: CI and the e2e server
 * (`.github/workflows/ci.yml`, `playwright.config.ts`) and the integration tests. Anyone
 * can read them, so production refuses them; `tests/unit/production-mode.test.ts` scans the
 * repository's test and config files to keep this list complete.
 */
export const PUBLIC_TEST_SECRETS: readonly string[] = Object.freeze([
  "ci-only-ephemeral-session-secret-not-production",
  "e2e-only-ephemeral-session-secret-not-production",
  "b11-test-only-secret-not-a-real-one",
  "b54-test-only-secret-not-a-real-one",
]);

/** Names that resolve to loopback by convention, Ubuntu's default /etc/hosts included. */
const LOOPBACK_NAMES: readonly string[] = ["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"];

/**
 * A URL host that is this machine: the names above and `*.localhost` (with or without the
 * trailing dot), 127.0.0.0/8, `[::1]`, and IPv4-mapped or IPv4-compatible loopback. The host
 * must come from `new URL()`, which lower-cases names and turns every IPv4 spelling (`127.1`,
 * `2130706433`, `0x7f000001`, a trailing dot) into dotted decimal and IPv6 into its short form.
 */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  return LOOPBACK_NAMES.includes(host) || host.endsWith(".localhost") || host === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(host) ||
    /^\[::(ffff:)?7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/u.test(host);
}

/** The unspecified address (0.0.0.0/8, also IPv4-mapped, and `[::]`): no public host either. */
function isUnspecifiedHost(hostname: string): boolean {
  return hostname === "[::]" || /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(hostname) ||
    /^\[::ffff:[0-9a-f]{1,2}:[0-9a-f]{1,4}\]$/u.test(hostname);
}

/** The URL's host; unparseable, or a scheme-less `name:port` (no host), is `invalidCode`. */
function hostOf(raw: string, invalidCode: string): string {
  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    throw new ConfigurationError(invalidCode);
  }
  if (!hostname) throw new ConfigurationError(invalidCode);
  return hostname;
}

/**
 * Production (DEPLOY-002): PostgreSQL, the secret next-auth will sign with (at least 32
 * bytes, not one of the repository's public test secrets), and an `https://` NEXTAUTH_URL on
 * a public host. Each refusal is a fixed code; no value goes into an error.
 */
function assertProductionReady(env: Record<string, string | undefined>, backend: string, uploads: boolean): void {
  if (backend !== "postgres") throw new ConfigurationError("PRODUCTION_REQUIRES_POSTGRES");
  const secret = authSecret(env);
  if (secret === null) throw new ConfigurationError("PRODUCTION_SECRET_REQUIRED");
  if (new TextEncoder().encode(secret).length < 32) throw new ConfigurationError("PRODUCTION_SECRET_TOO_SHORT");
  if (PUBLIC_TEST_SECRETS.includes(secret)) throw new ConfigurationError("PRODUCTION_SECRET_PUBLIC");
  const url = env.NEXTAUTH_URL;
  if (!url) throw new ConfigurationError("PRODUCTION_URL_REQUIRED");
  const host = hostOf(url, "PRODUCTION_URL_INVALID");
  // The literal prefix, as next-auth checks it (`url.base.startsWith("https://")` decides
  // its secure cookies; its parser prefixes `https://` to anything not starting "http").
  if (!url.startsWith("https://")) throw new ConfigurationError("PRODUCTION_URL_NOT_HTTPS");
  if (isLoopbackHost(host) || isUnspecifiedHost(host)) throw new ConfigurationError("PRODUCTION_URL_LOOPBACK");
  // Owner decision D6 (DEPLOY-001): uploads stay off on the server until the beta decision;
  // opening them to real CVs is a high-risk activation of its own.
  if (uploads) throw new ConfigurationError("PRODUCTION_UPLOADS_NOT_APPROVED");
}

export function readConfig(env: Record<string, string | undefined>): Config {
  const environment = env.ATLAS_ENV ?? "local";
  if (environment !== "local" && environment !== "test" && environment !== "production") {
    throw new ConfigurationError("INVALID_ATLAS_ENV");
  }
  // The AI switch is real (owner decision 2026-10-01): absent or "false" means no
  // provider call may spend, "true" means the owner has approved live AI, and any
  // other value fails closed. Before this, the variable was rejected whenever it
  // was set at all, which left the API key in the environment as the only —
  // undocumented — switch (docs/OPEN_GAPS.md A1).
  let liveAi = false;
  if (env.LIVE_AI_ENABLED !== undefined && env.LIVE_AI_ENABLED !== "false") {
    if (env.LIVE_AI_ENABLED !== "true") {
      throw new ConfigurationError("LIVE_AI_ENABLED_INVALID");
    }
    liveAi = true;
  }
  // Sources keep no flag of their own: a source runs when its policy is approved,
  // enabled, unexpired and permits the operation. A second, weaker truth would be
  // worse than none, so setting this variable stays an error.
  if (env.LIVE_SOURCES_ENABLED !== undefined && env.LIVE_SOURCES_ENABLED !== "false") {
    throw new ConfigurationError("LIVE_SOURCES_ENABLED_NOT_IMPLEMENTED");
  }
  // Uploads are implemented for the local offline intake only (S3-001) and
  // stay disabled unless explicitly enabled; malformed values fail closed.
  let uploads = false;
  if (env.UPLOADS_ENABLED !== undefined && env.UPLOADS_ENABLED !== "false") {
    if (env.UPLOADS_ENABLED !== "true") {
      throw new ConfigurationError("UPLOADS_ENABLED_NOT_IMPLEMENTED");
    }
    uploads = true;
  }
  const backend = env.DATA_BACKEND ?? "fixture";
  if (backend !== "fixture" && backend !== "postgres") {
    throw new ConfigurationError("INVALID_DATA_BACKEND");
  }
  if (environment === "production") {
    assertProductionReady(env, backend, uploads);
  } else if (env.NEXTAUTH_URL) {
    // Local and test run on this machine: a set NEXTAUTH_URL must say so. This closes the
    // way around the production rules, `ATLAS_ENV=local` on a server with its public
    // address (DEPLOY-001). Unset or empty, next-auth assumes http://localhost:3000.
    if (!isLoopbackHost(hostOf(env.NEXTAUTH_URL, "NEXTAUTH_URL_INVALID"))) {
      throw new ConfigurationError("NEXTAUTH_URL_NOT_LOOPBACK");
    }
  }
  return { environment, backend, liveAi, liveSources: false, uploads };
}

/** Production has no sign-up of any kind yet (owner decision D5, 2026-11-04). */
export function signUpOpen(config: Config): boolean {
  return config.environment !== "production";
}

/**
 * next-auth's `useSecureCookies`: `true` in production, so the session cookie is `Secure` and
 * `__Secure-`-prefixed whatever the URL says; unset elsewhere, which keeps next-auth's
 * default (derived from NEXTAUTH_URL). Read without `readConfig`, because `authOptions` is
 * built when its module loads; an invalid configuration never serves a request: `next start`
 * exits on it in `next.config.ts`, and `next dev` refuses it in `src/instrumentation.ts`.
 */
export function secureCookies(env: Record<string, string | undefined>): true | undefined {
  return env.ATLAS_ENV === "production" ? true : undefined;
}

export function localDatabaseUrl(raw: string | undefined, testOnly = false): string {
  if (!raw) throw new ConfigurationError("DATABASE_URL_REQUIRED");
  let url: URL;
  try { url = new URL(raw); } catch { throw new ConfigurationError("INVALID_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new ConfigurationError("INVALID_DATABASE_PROTOCOL");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new ConfigurationError("LOCAL_DATABASE_REQUIRED");
  }
  if (url.search || url.hash) throw new ConfigurationError("DATABASE_OPTIONS_NOT_ALLOWED");
  const db = url.pathname.slice(1);
  if (testOnly ? db !== "atlas_starter_test" : !["atlas_starter", "atlas_starter_test"].includes(db)) {
    throw new ConfigurationError("ISOLATED_DATABASE_REQUIRED");
  }
  if (!url.username || !url.password || url.password === "GENERATE_WITH_SETUP") {
    throw new ConfigurationError("LOCAL_DATABASE_CREDENTIALS_REQUIRED");
  }
  return raw;
}
