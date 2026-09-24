export type Config = Readonly<{
  environment: "local" | "test";
  backend: "fixture" | "postgres";
  liveAi: false;
  liveSources: false;
  uploads: false;
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
  for (const key of ["LIVE_AI_ENABLED", "LIVE_SOURCES_ENABLED", "UPLOADS_ENABLED"]) {
    if (env[key] !== undefined && env[key] !== "false") {
      throw new ConfigurationError(`${key}_NOT_IMPLEMENTED`);
    }
  }
  const backend = env.DATA_BACKEND ?? "fixture";
  if (backend !== "fixture" && backend !== "postgres") {
    throw new ConfigurationError("INVALID_DATA_BACKEND");
  }
  return { environment, backend, liveAi: false, liveSources: false, uploads: false };
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
