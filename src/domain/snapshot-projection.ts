// UI-facing projection of canonical job snapshots.
// Remote, geography and freshness stay separate axes; unknown is never
// upgraded to a verified status (I-01, I-02, spec sections 10-11, 14.3).
import { choosePrimary, groupDuplicates, type DuplicateGroup } from "./dedup.ts";
import type { JobSnapshot, SourcePolicy } from "./source-contracts.ts";

export type StoredSnapshot = Readonly<{
  sourceId: string;
  snapshot: JobSnapshot;
  contentHash: string;
  firstSeenAt: string;
  fullPassMisses: number;
}>;

export type SnapshotStore = Readonly<{
  records: Readonly<Record<string, StoredSnapshot>>;
  lastFullPassAt: string | null;
}>;

export type SnapshotVisibility = "main_catalog" | "needs_review" | "excluded";

export function classifySnapshot(snapshot: JobSnapshot): SnapshotVisibility {
  if (snapshot.lifecycle !== "active") return "excluded";
  // Unresolved remote-format contradictions are quarantined out of the main
  // catalog (spec 10.3). Recorded provenance conflicts that were resolved in
  // the safe direction (e.g. narrowed geography) stay visible on the card.
  if (snapshot.workplace.verification_state === "conflicting" ||
    snapshot.workplace.verification_state === "rejected") return "excluded";
  const workplace = snapshot.workplace;
  if (workplace.type !== "remote" || workplace.permanence !== "permanent" ||
    workplace.mandatory_onsite === "required" || workplace.mandatory_travel === "required") {
    return "excluded";
  }
  return workplace.verification_state === "confirmed" ? "main_catalog" : "needs_review";
}

// A source reaches the public catalog only when its policy is enabled,
// approved, unexpired and explicitly allows publishing an excerpt.
export function policyPublishes(policy: SourcePolicy, now: string): boolean {
  if (!policy.enabled || policy.status !== "approved") return false;
  if (policy.valid_until !== null && policy.valid_until <= now) return false;
  return policy.permissions.publish_excerpt === "allowed";
}

export type ApplyRouteProjection = Readonly<{
  kind: "direct" | "source_board";
  url: string;
}>;

export type CatalogCardProjection = Readonly<{
  id: string;
  title: string;
  company: string;
  source: Readonly<{
    id: string;
    displayName: string;
    attributionRequired: boolean;
    backlinkRequired: boolean;
  }>;
  // Cross-source provenance (item A4): the same posting carried by other
  // boards. The card keeps ONE text (no merging) and shows where else the
  // posting lives, with a link for each — attribution is never dropped by
  // deduplication.
  alsoListedAt: readonly Readonly<{
    sourceId: string;
    displayName: string;
    url: string;
  }>[];
  apply: ApplyRouteProjection;
  publishedAt: string | null;
  lastSeenAt: string;
  firstSeenAt: string;
  salaryOriginalText: string | null;
  geography: Readonly<{ scope: "worldwide" | "restricted" | "unspecified"; countries: readonly string[] }>;
  visibility: SnapshotVisibility;
}>;

export function projectCard(
  stored: StoredSnapshot, policy: SourcePolicy,
  alsoListedAt: CatalogCardProjection["alsoListedAt"] = [],
): CatalogCardProjection {
  const snapshot = stored.snapshot;
  const directApply = policy.apply_route === "direct_allowed" &&
    policy.permissions.direct_apply === "allowed" && snapshot.apply_url !== null;
  const geography = snapshot.hiring_options[0]?.geography;
  return {
    id: snapshot.id,
    title: snapshot.title,
    company: snapshot.company_name,
    source: {
      id: policy.source_id,
      displayName: policy.attribution.display_name,
      attributionRequired: policy.attribution.required,
      backlinkRequired: policy.attribution.backlink_required,
    },
    alsoListedAt,
    apply: directApply && snapshot.apply_url
      ? { kind: "direct", url: snapshot.apply_url }
      : { kind: "source_board", url: snapshot.source_url },
    publishedAt: snapshot.dates.source_published_at,
    lastSeenAt: snapshot.dates.last_seen_at,
    firstSeenAt: stored.firstSeenAt,
    salaryOriginalText: snapshot.compensation.original_text,
    geography: {
      scope: geography?.scope ?? "unspecified",
      countries: geography?.allowed_countries ?? [],
    },
    visibility: classifySnapshot(snapshot),
  };
}

// A record paired with the policy that governs it — the shape both read paths
// build before grouping, so provenance always carries display names and links
// from the owning policy.
export type PolicyBoundRecord = Readonly<{ stored: StoredSnapshot; policy: SourcePolicy }>;

export function provenanceOf(
  group: DuplicateGroup<PolicyBoundRecord>,
): CatalogCardProjection["alsoListedAt"] {
  return group.duplicates.map(duplicate => ({
    sourceId: duplicate.policy.source_id,
    displayName: duplicate.policy.attribution.display_name,
    url: duplicate.stored.snapshot.source_url,
  }));
}

// The only path from stored snapshots to public cards. A disabled or
// unapproved source contributes nothing — there is no mock fallback.
//
// Cross-source duplicates (item A4) are grouped here: one card per posting,
// projected from the primary record, with every other source listed in
// `alsoListedAt`. Records of a duplicate that belongs to a source whose policy
// does not publish are simply not part of the catalog and do not appear in the
// provenance list either — a source we may not publish is a source we may not
// advertise.
//
// The representative is chosen among the records that are actually publishable
// (main catalog): a fresher but unreviewed copy of a posting must never hide a
// confirmed copy from the catalog.
export function snapshotCatalogCards(params: Readonly<{
  store: SnapshotStore;
  getPolicy: (sourceId: string) => SourcePolicy | undefined;
  now: string;
}>): readonly CatalogCardProjection[] {
  const publishable: PolicyBoundRecord[] = [];
  for (const stored of Object.values(params.store.records)) {
    const policy = params.getPolicy(stored.sourceId);
    if (!policy || !policyPublishes(policy, params.now)) continue;
    if (classifySnapshot(stored.snapshot) !== "main_catalog") continue;
    publishable.push({ stored, policy });
  }
  const cards: CatalogCardProjection[] = [];
  for (const group of groupDuplicates(publishable, record => record.stored.snapshot)) {
    const primary = choosePrimary(group.members, record => record.stored.snapshot);
    const others = group.members.filter(record => record !== primary);
    cards.push(projectCard(primary.stored, primary.policy, others.map(record => ({
      sourceId: record.policy.source_id,
      displayName: record.policy.attribution.display_name,
      url: record.stored.snapshot.source_url,
    }))));
  }
  return cards;
}
