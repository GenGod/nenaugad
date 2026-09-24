import "server-only";
import { readConfig } from "./config.ts";
import { fixtureRepository } from "./storage/fixture.ts";
import { postgresRepository } from "./storage/postgres.ts";
import { selectCatalog, type CatalogQuery } from "../domain/job.ts";
import { sourceAllowed } from "./policy.ts";

export class CatalogUnavailableError extends Error {
  constructor() { super("CATALOG_UNAVAILABLE"); }
}

export async function readCatalog(query: CatalogQuery) {
  const config = readConfig(process.env);
  if (!sourceAllowed("atlas-fixtures", "catalog", config)) {
    throw new CatalogUnavailableError();
  }
  try {
    const repository = config.backend === "fixture" ? fixtureRepository : postgresRepository;
    return selectCatalog(await repository.all(), query);
  } catch {
    // No database URL, raw query, credentials, or silent fixture fallback.
    console.error(JSON.stringify({ code: "CATALOG_UNAVAILABLE", backend: config.backend }));
    throw new CatalogUnavailableError();
  }
}

export async function readJob(id: string) {
  if (!/^[a-z0-9-]{1,80}$/u.test(id)) return null;
  const catalog = await readCatalog({ q: "", offset: 0, limit: 500 });
  return catalog.items.find(job => job.id === id) ?? null;
}
