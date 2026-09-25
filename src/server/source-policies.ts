// Executable source rights registry (technical spec section 6).
// Every permission is allowed|denied|unknown; unknown blocks exactly the
// disputed operation. A working API endpoint is not approval.
import {
  type SourcePolicy,
  type SourcePolicyPermission,
  type TriState,
} from "../domain/source-contracts.ts";

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
// Permission matrix approved by the owner on 2026-09-24 after a live review of
// himalayas.app API docs, OpenAPI spec and site ToS. Activated by the owner on
// 2026-09-24 after reviewing the S1-002 implementation diff.
// terms_hash = sha256 of https://himalayas.app/terms as fetched 2026-09-24.
export const himalayasCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/himalayas/1",
  version: 3,
  source_id: "himalayas",
  status: "approved",
  enabled: true,
  terms_urls: [
    "https://himalayas.app/terms",
    "https://himalayas.app/api",
    "https://himalayas.app/docs/remote-jobs-api",
    "https://himalayas.app/docs/openapi.json",
  ],
  terms_hash: "c56915f1acc9834f16003f2d5524d5937984675bf00b59b9b02ffeb450959937",
  reviewed_at: "2026-09-24T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "Owner-approved permission matrix 2026-09-24 (live review of API docs + ToS); " +
    "activated 2026-09-24 after S1-002 diff review; re-review by 2026-12-23",
  valid_until: "2026-12-23T00:00:00.000Z",
  permissions: {
    fetch: "allowed",
    cache: "allowed",
    store_full_text: "allowed",
    store_excerpt: "allowed",
    derive_fields: "allowed",
    process_with_ml: "denied",
    send_to_ai_provider: "denied",
    publish_full_text: "denied",
    publish_excerpt: "allowed",
    send_email: "denied",
    index_web_page: "denied",
    syndicate_google_jobs: "denied",
    train_model: "denied",
    direct_apply: "denied",
    bulk_export: "denied",
  },
  max_retention_hours: 720,
  min_poll_interval_seconds: 86400,
  attribution: {
    required: true, display_name: "Himalayas",
    backlink_required: true, link_rel: ["nofollow"], logo_allowed: "unknown",
  },
  apply_route: "source_required",
  allowed_surfaces: ["public_web"],
};

// Second source (registry S02). Permission matrix approved by the owner on
// 2026-09-25 after a live review of jobicy.com/jobs-rss-feed and the GitHub
// docs ("normal integrations do not require a separate agreement"; mandatory
// attribution + canonical Jobicy URL). Activated by the owner on 2026-09-25
// after the S1-003 implementation review. The paid Bearer direct-link option
// and the affiliate parameter stay out of scope.
// terms_hash = sha256 of https://jobicy.com/jobs-rss-feed as fetched 2026-09-25.
export const jobicyCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/jobicy/1",
  version: 2,
  source_id: "jobicy",
  status: "approved",
  enabled: true,
  terms_urls: [
    "https://jobicy.com/jobs-rss-feed",
    "https://github.com/Jobicy/remote-jobs-api",
  ],
  terms_hash: "97e86dc4985447f754f9de36b9e72f4723d17dab6995052e35e88aff3370698c",
  reviewed_at: "2026-09-25T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "Owner-approved permission matrix 2026-09-25 (live review of API docs); " +
    "activated 2026-09-25 after the S1-003 review; paid direct links and affiliate out of scope; " +
    "re-review by 2026-12-23",
  valid_until: "2026-12-23T00:00:00.000Z",
  permissions: {
    fetch: "allowed",
    cache: "allowed",
    store_full_text: "allowed",
    store_excerpt: "allowed",
    derive_fields: "allowed",
    process_with_ml: "denied",
    send_to_ai_provider: "denied",
    publish_full_text: "denied",
    publish_excerpt: "allowed",
    send_email: "denied",
    index_web_page: "denied",
    syndicate_google_jobs: "denied",
    train_model: "denied",
    direct_apply: "denied",
    bulk_export: "denied",
  },
  max_retention_hours: 720,
  min_poll_interval_seconds: 21600,
  attribution: {
    required: true, display_name: "Jobicy",
    backlink_required: true, link_rel: ["nofollow"], logo_allowed: "denied",
  },
  apply_route: "source_required",
  allowed_surfaces: ["public_web"],
};

const policies: ReadonlyMap<string, SourcePolicy> = new Map([
  [atlasFixturesPolicy.source_id, atlasFixturesPolicy],
  [himalayasCandidatePolicy.source_id, himalayasCandidatePolicy],
  [jobicyCandidatePolicy.source_id, jobicyCandidatePolicy],
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
