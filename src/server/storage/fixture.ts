import { jobs } from "../../data/fixtures.ts";
import type { CatalogRepository } from "../../domain/job.ts";

export const fixtureRepository: CatalogRepository = {
  async all() {
    // Defensive copy: tests or consumers cannot mutate the shared fixture corpus.
    return structuredClone(jobs);
  }
};
