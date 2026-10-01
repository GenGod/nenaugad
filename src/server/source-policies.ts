// Executable source rights registry (technical spec section 6).
// Every permission is allowed|denied|unknown; unknown blocks exactly the
// disputed operation. A working API endpoint is not approval.
import {
  type SourcePolicy,
  type SourcePolicyPermission,
  type TriState,
} from "../domain/source-contracts.ts";

// Synthetic bundled fixtures: the only source approved for public display today.
// process_with_ml was granted by the owner on 2026-09-30 (matching brief §7.2)
// for LOCAL inference over synthetic text only: no third-party rights are
// involved and the offline eval needs it. send_to_ai_provider was granted by the
// owner on 2026-10-01 (purpose job_matching was approved the same day): the text
// is ours, so sending it to the approved provider is a technical choice, not a
// rights question. Training stays denied and sending email stays denied.
export const atlasFixturesPolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/atlas-fixtures/1",
  version: 3,
  source_id: "atlas-fixtures",
  status: "approved",
  enabled: true,
  terms_urls: [],
  terms_hash: null,
  reviewed_at: "2026-10-01T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "S0-001 acceptance (synthetic starter data only); " +
    "owner decision 2026-09-30 (brief §7.2): local ML inference allowed for synthetic fixtures; " +
    "owner decision 2026-10-01: text may be sent to the approved provider (OpenAI gpt-6-luna) " +
    "for owner-approved purposes; training stays denied",
  valid_until: null,
  permissions: {
    fetch: "allowed", cache: "allowed", store_full_text: "allowed",
    store_excerpt: "allowed", derive_fields: "allowed",
    process_with_ml: "allowed", send_to_ai_provider: "allowed",
    publish_full_text: "allowed", publish_excerpt: "allowed",
    send_email: "denied", index_web_page: "denied",
    syndicate_google_jobs: "denied", train_model: "denied",
    direct_apply: "denied", bulk_export: "denied",
  },
  max_retention_hours: null,
  min_poll_interval_seconds: 86400,
  attribution: {
    required: true, display_name: "Nenaugad Fixtures",
    backlink_required: false, link_rel: [], logo_allowed: "denied",
  },
  apply_route: "source_required",
  allowed_surfaces: ["public_web"],
};

// Candidate source from the registry (02_SOURCE_REGISTRY.json, himalayas).
// Permission matrix approved by the owner on 2026-09-24 after a live review of
// himalayas.app API docs, OpenAPI spec and site ToS. Activated by the owner on
// 2026-09-24 after reviewing the S1-002 implementation diff.
// process_with_ml was granted by the owner on 2026-09-30 (brief §7.2): the API
// documentation names "AI tools" as an intended audience and contemplates
// mirroring the feed, the general site terms are silent about ML inference, and
// the owner accepted that reading. Training and provider transfer stay denied.
// terms_hash = sha256 of the NORMALIZED terms text (src/server/terms-fingerprint.ts);
// the revision reviewed on 2026-09-30 is committed at
// docs/sources/terms/himalayas-terms.txt, listed in docs/sources/terms/snapshots.json.
// send_to_ai_provider was granted by the owner on 2026-10-01: the same reading of
// the API documentation ("AI tools" is a named audience) now covers handing the
// text to the approved provider for owner-approved purposes, not only running a
// model locally. Written confirmation from hi@himalayas.app remains recommended
// and no longer blocks. Training and full-text republication stay denied.
export const himalayasCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/himalayas/1",
  version: 5,
  source_id: "himalayas",
  status: "approved",
  enabled: true,
  terms_urls: [
    "https://himalayas.app/terms",
    "https://himalayas.app/api",
    "https://himalayas.app/docs/remote-jobs-api",
    "https://himalayas.app/docs/openapi.json",
  ],
  terms_hash: "d729e76417a9e06657387bafe2bcde8fb36ee0019ae170456abf9d64df1fad62",
  reviewed_at: "2026-10-01T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "Owner-approved permission matrix 2026-09-24 (live review of API docs + ToS); " +
    "activated 2026-09-24 after S1-002 diff review; " +
    "owner decision 2026-09-30 (brief §7.2): local ML inference allowed; " +
    "owner decision 2026-10-01: provider transfer allowed for approved purposes; " +
    "terms fingerprint re-baselined 2026-09-30 (normalized text + committed snapshot); " +
    "re-review by 2026-12-23",
  valid_until: "2026-12-23T00:00:00.000Z",
  permissions: {
    fetch: "allowed",
    cache: "allowed",
    store_full_text: "allowed",
    store_excerpt: "allowed",
    derive_fields: "allowed",
    process_with_ml: "allowed",
    send_to_ai_provider: "allowed",
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
// terms_hash = sha256 of the NORMALIZED terms text (src/server/terms-fingerprint.ts);
// the revision reviewed on 2026-09-30 is committed at
// docs/sources/terms/jobicy-feed.txt, listed in docs/sources/terms/snapshots.json.
// send_to_ai_provider was granted by the owner on 2026-10-01. Recorded honestly:
// on 2026-09-30 the owner withheld even the weaker process_with_ml grant here, so
// this is a separate, later and stronger decision — the only one for jobicy that
// rests on the Fair Use text that explicitly welcomes "AI assistants" and
// "search experiences". `process_with_ml` stays denied (no local inference over
// jobicy text is granted today) and training stays denied.
export const jobicyCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/jobicy/1",
  version: 4,
  source_id: "jobicy",
  status: "approved",
  enabled: true,
  terms_urls: [
    "https://jobicy.com/jobs-rss-feed",
    "https://github.com/Jobicy/remote-jobs-api",
  ],
  terms_hash: "feff80168fed52ef2ff4a25299f7ef160aee143ec9df667fb9fdfb5e5e0eace4",
  reviewed_at: "2026-10-01T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "Owner-approved permission matrix 2026-09-25 (live review of API docs); " +
    "activated 2026-09-25 after the S1-003 review; paid direct links and affiliate out of scope; " +
    "owner decision 2026-10-01: provider transfer allowed for approved purposes " +
    "(Fair Use names AI assistants and search experiences); " +
    "terms fingerprint re-baselined 2026-09-30 (normalized text + committed snapshot); " +
    "re-review by 2026-12-23",
  valid_until: "2026-12-23T00:00:00.000Z",
  permissions: {
    fetch: "allowed",
    cache: "allowed",
    store_full_text: "allowed",
    store_excerpt: "allowed",
    derive_fields: "allowed",
    process_with_ml: "denied",
    send_to_ai_provider: "allowed",
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

/**
 * The one question every AI path must ask before a source's text leaves the
 * machine: may this source's text go to the approved provider right now?
 *
 * It lives here, with the policies, because the answer is a rights answer, not
 * an AI one — and it exists because the alternative was measured: until
 * 2026-10-01 the provider paths sent posting text without consulting the matrix
 * at all (docs/OPEN_GAPS.md A2/A3), which made the matrix a document instead of
 * a control. Unknown or expired is `false`, never "probably fine".
 */
export function maySendTextToProvider(sourceId: string, now: string): boolean {
  const policy = getSourcePolicy(sourceId);
  return policy !== undefined && permissionFor(policy, "send_to_ai_provider", now) === "allowed";
}

/** Splits source ids into those whose text may be sent and those whose may not. */
export function partitionSourcesByProviderRights(
  sourceIds: readonly string[], now: string,
): Readonly<{ allowed: readonly string[]; denied: readonly string[] }> {
  const allowed: string[] = [];
  const denied: string[] = [];
  for (const sourceId of sourceIds) (maySendTextToProvider(sourceId, now) ? allowed : denied).push(sourceId);
  return { allowed, denied };
}
