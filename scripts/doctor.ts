import { existsSync } from "node:fs";
import { readConfig } from "../src/server/config.ts";
try {
  const config = readConfig(process.env);
  console.log(JSON.stringify({
    node: process.version, envFilePresent: existsSync(".env"),
    dependencyLockPresent: existsSync("package-lock.json"),
    dependenciesInstalled: existsSync("node_modules/next/package.json"),
    backend: config.backend, environment: config.environment,
    realAi: "not_implemented", auth: "not_implemented",
    uploads: "not_implemented", realSources: "not_implemented",
    databaseConnection: "not_probed",
    production: "blocked"
  }, null, 2));
} catch {
  console.error("STARTER_CONFIGURATION_REJECTED: keep ATLAS_ENV local/test and live features false.");
  process.exitCode = 1;
}
