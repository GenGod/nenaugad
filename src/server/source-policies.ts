// Executable source rights registry (technical spec section 6).
// Every permission is allowed|denied|unknown; unknown blocks exactly the
// disputed operation. A working API endpoint is not approval.
import type {
  SourcePolicy,
  SourcePolicyPermission,
  TriState,
} from "../domain/source-contracts.ts";
import { policyPublishes } from "../domain/snapshot-projection.ts";

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
// the revision reviewed on 2026-10-15 (page dated October 1, 2026) is committed at
// docs/sources/terms/jobicy-feed.txt, listed in docs/sources/terms/snapshots.json.
// Its Fair Use section is word for word the one reviewed on 2026-09-30; the API
// part changed (a 7-day feed with cursor paging, and a batch status endpoint
// instead of HEAD checks, which the closure pass now uses: B56-001).
// send_to_ai_provider was granted by the owner on 2026-10-01, and process_with_ml
// on 2026-10-02 (owner decision 04) after the Fair Use section was read in full:
// the same text that names "AI assistants" also names "AI products" and
// "research tools" and requires no separate agreement, so local embedding
// inference is granted too — this closes B13 (the dense leg could not index
// jobicy at all). training stays denied; attribution and the canonical Jobicy
// URL are preserved.
export const jobicyCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/jobicy/1",
  version: 6,
  source_id: "jobicy",
  status: "approved",
  enabled: true,
  terms_urls: [
    "https://jobicy.com/jobs-rss-feed",
    "https://github.com/Jobicy/remote-jobs-api",
  ],
  terms_hash: "b498119f769bba6b830175c8c89cf4ceda120190a69d8d8160ce769221801756",
  reviewed_at: "2026-10-15T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "Owner-approved permission matrix 2026-09-25 (live review of API docs); " +
    "activated 2026-09-25 after the S1-003 review; paid direct links and affiliate out of scope; " +
    "owner decision 2026-10-01: provider transfer allowed for approved purposes " +
    "(Fair Use names AI assistants and search experiences); " +
    "owner decision 2026-10-02 (No 4): local ML inference (process_with_ml) granted — " +
    "the Fair Use section read in full names \"AI products\" and \"research tools\"; " +
    "terms fingerprint re-baselined 2026-09-30 (normalized text + committed snapshot); " +
    "owner decision 2026-10-15 (B56-001): terms re-baselined after the API page change " +
    "(Fair Use unchanged), closure checks use the batch status endpoint; " +
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
  min_poll_interval_seconds: 21600,
  attribution: {
    required: true, display_name: "Jobicy",
    backlink_required: true, link_rel: ["nofollow"], logo_allowed: "denied",
  },
  apply_route: "source_required",
  allowed_surfaces: ["public_web"],
};

// Third source (registry remote_first_jobs; JobsCollider now redirects here).
// Permission matrix approved by the owner on 2026-11-02 after a live review of
// remotefirstjobs.com/jobs-api and the general site terms (tasks/S1-006). The API
// page is "free and public" with two rules — credit Remote First Jobs with a link,
// and "do not republish": do not submit its jobs to third-party sites (LinkedIn
// Jobs, Google Jobs, Jooble). Nothing on AI or ML: by owner decision 2026-11-02
// process_with_ml is local only and send_to_ai_provider stays unknown. Activated by
// the owner on 2026-11-02 after the S1-006 review and merge, accepting the remote
// rule's recorded residual risk; rollback is enabled: false.
// terms_hash = sha256 of the NORMALIZED API page (src/server/terms-fingerprint.ts),
// committed at docs/sources/terms/remote-first-jobs-api.txt.
export const remoteFirstJobsCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/remote_first_jobs/1",
  version: 3,
  source_id: "remote_first_jobs",
  status: "approved",
  enabled: true,
  terms_urls: [
    "https://remotefirstjobs.com/jobs-api",
    "https://remotefirstjobs.com/terms",
  ],
  terms_hash: "dc0e9c8922e109691077e9eb3622cc9fd8bc143f1cfd1f30a051b5aec7b17159",
  reviewed_at: "2026-11-02T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "Owner-approved permission matrix 2026-11-02 (live review of the API page and site terms, S1-006); " +
    "owner decisions 2026-11-02: explicit-remote rule, local ML only; " +
    "activated by the owner 2026-11-02 after the S1-006 review and merge " +
    "(remote-rule residual risk accepted); re-review by 2026-12-23",
  valid_until: "2026-12-23T00:00:00.000Z",
  permissions: {
    fetch: "allowed",
    cache: "allowed",
    store_full_text: "allowed",
    store_excerpt: "allowed",
    derive_fields: "allowed",
    process_with_ml: "allowed",
    send_to_ai_provider: "unknown",
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
    required: true, display_name: "Remote First Jobs",
    backlink_required: true, link_rel: ["nofollow"], logo_allowed: "unknown",
  },
  apply_route: "source_required",
  allowed_surfaces: ["public_web"],
};

// Fourth source (registry remotejobs_org), S1-007. Rights review 2026-11-07 of
// remotejobs.org/developers/api and www.remotejobs.org/terms (dated October 24, 2026):
// a free public API that tells integrators to cache results and asks those who display
// listings for a visible link back and the job's application link intact. The terms
// leave third-party job descriptions with their owners and authorize no use that
// infringes their rights; RemoteJobs.org itself aggregates listings, with no
// per-posting provenance. Owner decisions 1–5 of 2026-11-07 shaped the values below:
// full text, derived fields and local ML allowed (nothing leaves the machine), only
// workArrangement=remote requested with our office-vocabulary veto on top, their
// structured geography used with its status and never widened to worldwide, every 6 h,
// nofollow kept. Owner decision 2026-11-07 (attribution): every card of this source also
// shows the API page's suggested credit, "Powered by RemoteJobs.org" linked to
// https://remotejobs.org, in its own English words. Permission matrix approved by the
// owner on 2026-11-07 as proposed (owner decision 6, after the reviewer pass and its
// repair cycle). Activated by the owner on 2026-11-07 as a separate decision after the
// matrix approval, with the question to RemoteJobs.org still unsent; rollback is
// enabled: false.
// terms_hash = policyTermsHash over the two committed pages (src/server/terms-fingerprint.ts):
// docs/sources/terms/remotejobs-org-api.txt and remotejobs-org-terms.txt.
export const remoteJobsOrgCandidatePolicy: SourcePolicy = {
  kind: "source_policy",
  schema_version: "1.0.0",
  id: "policy/remotejobs_org/1",
  version: 3,
  source_id: "remotejobs_org",
  status: "approved",
  enabled: true,
  terms_urls: [
    "https://remotejobs.org/developers/api",
    "https://www.remotejobs.org/terms",
  ],
  terms_hash: "9a46fd33af0530b9af9758cc1d939205b8501fb15f0451b2ee3c23b9d9962a88",
  reviewed_at: "2026-11-07T00:00:00.000Z",
  approved_by: "owner",
  approval_reference:
    "Owner-approved permission matrix 2026-11-07 (live review of the API page and terms, S1-007; " +
    "reviewer pass with one repair cycle); owner decisions 1-5 2026-11-07: full text and local ML, " +
    "workArrangement=remote under the office-vocabulary veto, structured geography never widened, " +
    "6 h and 20 pages, nofollow; owner decision 2026-11-07: the \"Powered by RemoteJobs.org\" credit line " +
    "on every card; activated by the owner 2026-11-07 as a separate decision; re-review by 2026-12-23",
  valid_until: "2026-12-23T00:00:00.000Z",
  permissions: {
    fetch: "allowed",
    cache: "allowed",
    store_full_text: "allowed",
    store_excerpt: "allowed",
    derive_fields: "allowed",
    process_with_ml: "allowed",
    send_to_ai_provider: "unknown",
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
    required: true, display_name: "RemoteJobs.org",
    backlink_required: true, link_rel: ["nofollow"], logo_allowed: "unknown",
    credit_line: { text: "Powered by RemoteJobs.org", url: "https://remotejobs.org" },
  },
  apply_route: "source_required",
  allowed_surfaces: ["public_web"],
};

const policies: ReadonlyMap<string, SourcePolicy> = new Map([
  [atlasFixturesPolicy.source_id, atlasFixturesPolicy],
  [himalayasCandidatePolicy.source_id, himalayasCandidatePolicy],
  [jobicyCandidatePolicy.source_id, jobicyCandidatePolicy],
  [remoteFirstJobsCandidatePolicy.source_id, remoteFirstJobsCandidatePolicy],
  [remoteJobsOrgCandidatePolicy.source_id, remoteJobsOrgCandidatePolicy],
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

/**
 * Whether a stored posting's source publishes now — the catalog's own test, asked by
 * the private lists too (B62-001). A saved or hidden posting whose source stopped
 * publishing keeps its title, company and listing link, never its excerpt or salary
 * (owner decision 2026-11-03). The source is the snapshot id's prefix.
 */
export function sourcePublishesSnapshot(snapshotId: string, now: string): boolean {
  const separator = snapshotId.indexOf(":");
  const policy = separator > 0 ? getSourcePolicy(snapshotId.slice(0, separator)) : undefined;
  return policy !== undefined && policyPublishes(policy, now);
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

/**
 * The items (postings, by `source:record` id) whose source may send text to the
 * provider at `now`, in their order, and the sources that may not. Asked again before
 * each provider call of a run: a policy that lapses during the run stops its postings
 * at the next call instead of at the end of the run (B50).
 */
export function sendableNow<T extends Readonly<{ id: string }>>(
  items: readonly T[], now: string,
): Readonly<{ sendable: T[]; denied: readonly string[] }> {
  const sourceOf = (item: T) => item.id.split(":")[0] ?? "";
  const { denied } = partitionSourcesByProviderRights([...new Set(items.map(sourceOf))], now);
  return { sendable: items.filter(item => !denied.includes(sourceOf(item))), denied };
}
