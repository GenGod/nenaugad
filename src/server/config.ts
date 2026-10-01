export type Config = Readonly<{
  environment: "local" | "test";
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

export function readConfig(env: Record<string, string | undefined>): Config {
  const environment = env.ATLAS_ENV ?? "local";
  if (environment !== "local" && environment !== "test") {
    throw new ConfigurationError("PRODUCTION_NOT_IMPLEMENTED");
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
  return { environment, backend, liveAi, liveSources: false, uploads };
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
