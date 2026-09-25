import { readConfig } from "./config.ts";
import { getSourcePolicy } from "./source-policies.ts";
import {
  policyPublishes, projectCard, type CatalogCardProjection,
} from "../domain/snapshot-projection.ts";
import { readSnapshotCardsData, snapshotPool } from "./storage/snapshots.ts";

export type SnapshotCardView = CatalogCardProjection & Readonly<{ excerpt: string }>;
export type SnapshotCatalogResult = Readonly<{
  cards: readonly SnapshotCardView[];
  unavailable: boolean;
}>;

// The only server path from stored snapshots to public cards. Disabled,
// unapproved or expired policies contribute nothing, and a fixture backend
// has no snapshot storage: both return an empty, healthy result.
export async function readSnapshotCards(): Promise<SnapshotCatalogResult> {
  const now = new Date().toISOString();
  const config = readConfig(process.env);
  if (config.backend !== "postgres") return { cards: [], unavailable: false };
  const pool = snapshotPool();
  const cards: SnapshotCardView[] = [];
  let unavailable = false;
  for (const sourceId of ["himalayas", "jobicy"]) {
    const policy = getSourcePolicy(sourceId);
    if (!policy || !policyPublishes(policy, now)) continue;
    try {
      const rows = await readSnapshotCardsData(pool, sourceId);
      for (const row of rows) {
        const card = { ...projectCard(row.stored, policy), excerpt: row.excerpt };
        if (card.visibility === "main_catalog") cards.push(card);
      }
    } catch {
      // The synthetic catalog keeps its own hard failure path; a broken
      // source degrades visibly instead of faking an empty success.
      unavailable = true;
      console.error(JSON.stringify({ code: "SNAPSHOT_CATALOG_UNAVAILABLE", source: sourceId }));
    }
  }
  return { cards, unavailable };
}
