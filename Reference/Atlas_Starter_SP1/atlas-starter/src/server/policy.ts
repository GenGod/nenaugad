import type { Config } from "./config.ts";

export type SourceOperation = "catalog" | "external_ai" | "export" | "live_fetch";

export function sourceAllowed(
  sourceId: string, operation: SourceOperation, config: Config
): boolean {
  // Approval here applies only to bundled synthetic records, never real sources.
  return config.environment !== undefined &&
    sourceId === "atlas-fixtures" && operation === "catalog";
}
