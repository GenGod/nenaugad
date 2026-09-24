// UI-facing projection of canonical job snapshots.
// Remote, geography and freshness stay separate axes; unknown is never
// upgraded to a verified status (I-01, I-02, spec sections 10-11, 14.3).
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

// The only path from stored snapshots to public cards. A disabled or
// unapproved source contributes nothing — there is no mock fallback.
export function snapshotCatalogCards(params: Readonly<{
  store: SnapshotStore;
  getPolicy: (sourceId: string) => SourcePolicy | undefined;
  now: string;
}>): readonly CatalogCardProjection[] {
  const cards: CatalogCardProjection[] = [];
  for (const stored of Object.values(params.store.records)) {
    const policy = params.getPolicy(stored.sourceId);
    if (!policy || !policyPublishes(policy, params.now)) continue;
    const card = projectCard(stored, policy);
    if (card.visibility === "main_catalog") cards.push(card);
  }
  return cards;
}
