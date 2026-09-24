// Executable source rights registry (technical spec section 6).
// Every permission is allowed|denied|unknown; unknown blocks exactly the
// disputed operation. A working API endpoint is not approval.
import {
  SOURCE_POLICY_PERMISSIONS,
  type SourcePolicy,
  type SourcePolicyPermission,
  type TriState,
} from "../domain/source-contracts.ts";

const unknownPermissions = () => {
  const permissions = {} as Record<SourcePolicyPermission, TriState>;
  for (const permission of SOURCE_POLICY_PERMISSIONS) permissions[permission] = "unknown";
  return permissions;
};

// Synthetic bundled fixtures: the only source approved for public display today.
export const atlasFixturesPolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/atlas-fixtures/1",
  version: 1,
  source_id: "atlas-fixtures",
  status: "approved",
  enabled: true,
  terms_urls: [],
  terms_hash: null,
  reviewed_at: "2026-09-23T00:00:00.000Z",
  approved_by: "owner",
  approval_reference: "S0-001 acceptance (synthetic starter data only)",
  valid_until: null,
  permissions: {
    fetch: "allowed", cache: "allowed", store_full_text: "allowed",
    store_excerpt: "allowed", derive_fields: "allowed",
    process_with_ml: "denied", send_to_ai_provider: "denied",
    publish_full_text: "allowed", publish_excerpt: "allowed",
    send_email: "denied", index_web_page: "denied",
    syndicate_google_jobs: "denied", train_model: "denied",
    direct_apply: "denied", bulk_export: "denied",
  },
  max_retention_hours: null,
  min_poll_interval_seconds: 86400,
  attribution: {
    required: true, display_name: "Atlas Fixtures",
    backlink_required: false, link_rel: [], logo_allowed: "denied",
  },
  apply_route: "source_required",
  allowed_surfaces: ["public_web"],
};

// Candidate source from the registry (02_SOURCE_REGISTRY.json, himalayas).
// Owner review pending: nothing is fetchable, storable or publishable.
export const himalayasCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/himalayas/1",
  version: 1,
  source_id: "himalayas",
  status: "pending",
  enabled: false,
  terms_urls: [
    "https://himalayas.app/terms",
    "https://himalayas.app/api",
    "https://himalayas.app/docs/remote-jobs-api",
    "https://himalayas.app/docs/openapi.json",
  ],
  terms_hash: null,
  reviewed_at: null,
  approved_by: null,
  approval_reference: null,
  valid_until: null,
  permissions: unknownPermissions(),
  max_retention_hours: null,
  min_poll_interval_seconds: 86400,
  attribution: {
    required: true, display_name: "Himalayas",
    backlink_required: true, link_rel: ["nofollow"], logo_allowed: "unknown",
  },
  apply_route: "unknown",
  allowed_surfaces: ["public_web"],
};

const policies: ReadonlyMap<string, SourcePolicy> = new Map([
  [atlasFixturesPolicy.source_id, atlasFixturesPolicy],
  [himalayasCandidatePolicy.source_id, himalayasCandidatePolicy],
]);

export function getSourcePolicy(sourceId: string): SourcePolicy | undefined {
  return policies.get(sourceId);
}

// An operation runs only on an explicit "allowed" for an enabled,
// approved, unexpired policy. "unknown" blocks the disputed operation only.
export function permissionFor(
  policy: SourcePolicy, permission: SourcePolicyPermission, now: string,
): TriState {
  if (!policy.enabled || policy.status !== "approved") return "denied";
  if (policy.valid_until !== null && policy.valid_until <= now) return "denied";
  return policy.permissions[permission];
}
