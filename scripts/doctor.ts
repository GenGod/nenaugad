import { existsSync } from "node:fs";
import { authSecret, readConfig, registrationLimit } from "../src/server/config.ts";

/**
 * What `npm run doctor` prints: facts about this local setup, never values from
 * .env. Fields used to be hardcoded and had gone stale — auth and uploads are
 * implemented, the live-source stance is the config's own (docs/OPEN_GAPS.md B14).
 */
export function doctorReport(env: Record<string, string | undefined>): Record<string, unknown> {
  const config = readConfig(env);
  return {
    node: process.version, envFilePresent: existsSync(".env"),
    dependencyLockPresent: existsSync("package-lock.json"),
    dependenciesInstalled: existsSync("node_modules/next/package.json"),
    backend: config.backend, environment: config.environment,
    realAi: config.liveAi, liveSources: config.liveSources, auth: "implemented",
    // Login needs it (B54); whether it is set, never its value.
    authSecret: authSecret(env) === null ? "missing" : "set",
    // The service-wide registration limit (B55); "invalid" refuses registration.
    registrationLimit: registrationLimitOrInvalid(env),
    uploads: config.uploads, realSources: "implemented",
    databaseConnection: "not_probed",
    production: "blocked"
  };
}

function registrationLimitOrInvalid(env: Record<string, string | undefined>): number | "invalid" {
  try {
    return registrationLimit(env);
  } catch {
    return "invalid";
  }
}

// Node exposes import.meta.main, but the pinned @types/node (22.x) does not type
// it yet, so it is read through a narrow cast rather than a version bump.
const isMain = (import.meta as ImportMeta & { main?: boolean }).main === true;

if (isMain) {
  try {
    console.log(JSON.stringify(doctorReport(process.env), null, 2));
  } catch {
    console.error("STARTER_CONFIGURATION_REJECTED: keep ATLAS_ENV local/test and live features false.");
    process.exitCode = 1;
  }
}
