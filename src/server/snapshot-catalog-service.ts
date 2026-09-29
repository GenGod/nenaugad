import { readConfig } from "./config.ts";
import { getSourcePolicy } from "./source-policies.ts";
import { choosePrimary, groupDuplicates } from "../domain/dedup.ts";
import {
  classifySnapshot, policyPublishes, projectCard, type PolicyBoundRecord,
  type CatalogCardProjection,
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
//
// Rows from every source are collected first and grouped by the cross-source
// dedup key (item A4), so a posting syndicated to two boards yields one card
// whose provenance lists the other board with a working link.
export async function readSnapshotCards(): Promise<SnapshotCatalogResult> {
  const now = new Date().toISOString();
  const config = readConfig(process.env);
  if (config.backend !== "postgres") return { cards: [], unavailable: false };
  const pool = snapshotPool();
  const collected: (PolicyBoundRecord & { excerpt: string })[] = [];
  let unavailable = false;
  for (const sourceId of ["himalayas", "jobicy"]) {
    const policy = getSourcePolicy(sourceId);
    if (!policy || !policyPublishes(policy, now)) continue;
    try {
      const rows = await readSnapshotCardsData(pool, sourceId);
      for (const row of rows) collected.push({ stored: row.stored, policy, excerpt: row.excerpt });
    } catch {
      // The synthetic catalog keeps its own hard failure path; a broken
      // source degrades visibly instead of faking an empty success.
      unavailable = true;
      console.error(JSON.stringify({ code: "SNAPSHOT_CATALOG_UNAVAILABLE", source: sourceId }));
    }
  }
  const cards: SnapshotCardView[] = [];
  for (const group of groupDuplicates(collected, record => record.stored.snapshot)) {
    // Only records that are actually publishable may represent the posting: a
    // fresher but unreviewed copy must not hide a confirmed one.
    const publishable = group.members.filter(record => classifySnapshot(record.stored.snapshot) === "main_catalog");
    if (publishable.length === 0) continue;
    const primary = choosePrimary(publishable, record => record.stored.snapshot);
    const others = publishable.filter(record => record !== primary);
    const card = {
      ...projectCard(primary.stored, primary.policy, others.map(record => ({
        sourceId: record.policy.source_id,
        displayName: record.policy.attribution.display_name,
        url: record.stored.snapshot.source_url,
      }))),
      excerpt: primary.excerpt,
    };
    cards.push(card);
  }
  return { cards, unavailable };
}
