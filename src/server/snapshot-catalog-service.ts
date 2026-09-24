import "server-only";
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

// The only server path from stored snapshots to public cards. A disabled,
// unapproved or expired policy contributes nothing, and a fixture backend
// has no snapshot storage: both return an empty, healthy result.
export async function readSnapshotCards(): Promise<SnapshotCatalogResult> {
  const now = new Date().toISOString();
  const config = readConfig(process.env);
  const policy = getSourcePolicy("himalayas");
  if (!policy || !policyPublishes(policy, now)) return { cards: [], unavailable: false };
  if (config.backend !== "postgres") return { cards: [], unavailable: false };
  try {
    const rows = await readSnapshotCardsData(snapshotPool(), policy.source_id);
    const cards = rows
      .map(row => ({ ...projectCard(row.stored, policy), excerpt: row.excerpt }))
      .filter(card => card.visibility === "main_catalog");
    return { cards, unavailable: false };
  } catch {
    // The synthetic catalog keeps its own hard failure path; the optional
    // snapshot section degrades visibly instead of faking an empty success.
    console.error(JSON.stringify({ code: "SNAPSHOT_CATALOG_UNAVAILABLE", backend: config.backend }));
    return { cards: [], unavailable: true };
  }
}
