// The ONLY module in src/ allowed to open network transport
// (scripts/guardrails.mjs allowlist). Destinations are pinned to
// owner-approved feeds; this is not an arbitrary-URL proxy:
// no redirects, fixed hosts, opaque tokens validated as tokens.
export const HIMALAYAS_FEED_URL = "https://himalayas.app/jobs/api";
export const JOBICY_FEED_URL = "https://jobicy.com/api/v2/remote-jobs";
export const REMOTE_FIRST_JOBS_FEED_URL = "https://remotefirstjobs.com/api/search-jobs";
export const REMOTE_JOBS_ORG_FEED_URL = "https://remotejobs.org/api/v1/jobs";
const CURSOR_PATTERN = /^[A-Za-z0-9._~=-]{1,512}$/u;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PAGE_LIMIT = 20; // documented maximum

export type FetchPageResult = Readonly<
  | { status: "ok"; jobs: readonly unknown[]; nextCursor: string | null }
  | { status: "rate_limited" }
  | { status: "server_error" }
  | { status: "network_error" }
>;

export type PageRequest = Readonly<{
  cursor?: string | null;
  limit?: number;
  timeoutMs?: number;
}>;

type PinnedJsonBody = Readonly<
  | { status: "ok"; body: unknown }
  | { status: "rate_limited"; retryAfterSeconds: number | null }
  | { status: "server_error" }
  | { status: "network_error" }
>;

/**
 * A 429's Retry-After in whole seconds: delta-seconds or an HTTP-date (RFC 9110), at
 * least 1 and never shortened: the source's terms forbid bypassing its rate limits, so a
 * long wait is kept as asked (the worker's status shows when the next attempt is due).
 * Null when absent or unreadable: the caller picks the wait.
 */
export function retryAfterSecondsOf(header: string | null, nowMs: number): number | null {
  if (header === null) return null;
  const value = header.trim();
  const seconds = /^\d{1,10}$/u.test(value) ? Number(value)
    : /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/u.test(value)
      ? Math.ceil((Date.parse(value) - nowMs) / 1000) : Number.NaN;
  if (!Number.isFinite(seconds)) return null;
  return Math.max(seconds, 1);
}

async function pinnedJsonBody(url: URL, timeoutMs: number): Promise<PinnedJsonBody> {
  // Defence in depth: a pinned base can never produce another host, and
  // redirects are refused outright.
  if (url.protocol !== "https:") return { status: "network_error" };
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: timeout.signal,
      headers: { accept: "application/json" },
    });
  } catch {
    return { status: "network_error" };
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 429) {
    return { status: "rate_limited",
      retryAfterSeconds: retryAfterSecondsOf(response.headers.get("retry-after"), Date.now()) };
  }
  if (!response.ok) return { status: "server_error" };
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return { status: "server_error" };
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) return { status: "server_error" };
  try {
    return { status: "ok", body: JSON.parse(body) };
  } catch {
    return { status: "server_error" };
  }
}

async function pinnedJsonFetch(url: URL, timeoutMs: number): Promise<FetchPageResult> {
  const result = await pinnedJsonBody(url, timeoutMs);
  // These feeds document a wait of about a minute, inside the scheduler's backoff.
  if (result.status === "rate_limited") return { status: "rate_limited" };
  if (result.status !== "ok") return result;
  const parsed = result.body;
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
    return { status: "server_error" };
  }
  // Absent, null or empty is the last page. A cursor we cannot pass back is a
  // failed page, never the end of the feed: read as the end, it made a partial
  // himalayas run look like a complete pass (B58-001).
  const rawCursor = (parsed as { nextCursor?: unknown }).nextCursor;
  if (rawCursor === undefined || rawCursor === null || rawCursor === "") {
    return { status: "ok", jobs: (parsed as { jobs: unknown[] }).jobs, nextCursor: null };
  }
  if (typeof rawCursor !== "string" || !CURSOR_PATTERN.test(rawCursor)) {
    return { status: "server_error" };
  }
  return { status: "ok", jobs: (parsed as { jobs: unknown[] }).jobs, nextCursor: rawCursor };
}

export async function fetchHimalayasPage(request: PageRequest = {}): Promise<FetchPageResult> {
  const cursor = request.cursor ?? null;
  if (cursor !== null && !CURSOR_PATTERN.test(cursor)) {
    return { status: "network_error" };
  }
  const limit = Math.min(Math.max(request.limit ?? DEFAULT_PAGE_LIMIT, 1), DEFAULT_PAGE_LIMIT);
  const url = new URL(HIMALAYAS_FEED_URL);
  url.searchParams.set("limit", String(limit));
  if (cursor !== null) url.searchParams.set("cursor", cursor);
  if (url.host !== "himalayas.app") return { status: "network_error" };
  return pinnedJsonFetch(url, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

// Jobicy window feed: the jobs published in the last 7 days, newest first, one
// page per request; `nextCursor` continues the traversal and is null on the last
// page (B57-001). The window is NOT a full snapshot — the importer always treats
// it as partial. `nextCursor` is optional so a single-page stand-in stays valid.
export type JobicyWindowResult = Readonly<
  | { status: "ok"; jobs: readonly unknown[]; nextCursor?: string | null }
  | { status: "rate_limited" }
  | { status: "server_error" }
  | { status: "network_error" }
>;

export async function fetchJobicyWindow(request: Readonly<{
  count?: number; cursor?: string | null; timeoutMs?: number;
}> = {}): Promise<JobicyWindowResult> {
  const cursor = request.cursor ?? null;
  if (cursor !== null && !CURSOR_PATTERN.test(cursor)) {
    return { status: "network_error" };
  }
  const count = Math.min(Math.max(request.count ?? 200, 1), 200);
  const url = new URL(JOBICY_FEED_URL);
  url.searchParams.set("count", String(count));
  if (cursor !== null) url.searchParams.set("cursor", cursor);
  if (url.host !== "jobicy.com") return { status: "network_error" };
  return pinnedJsonFetch(url, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

// Remote First Jobs: the 500 newest jobs of the default query, 100 a page, pages
// 0 to 4 (the documented maximum), each job 24 hours after publication (S1-006).
// The page number is the only parameter; no query or category filter is sent.
export const REMOTE_FIRST_JOBS_MAX_PAGES = 5;

export async function fetchRemoteFirstJobsPage(request: Readonly<{
  page: number; timeoutMs?: number;
}>): Promise<FetchPageResult> {
  if (!Number.isSafeInteger(request.page) || request.page < 0 ||
    request.page >= REMOTE_FIRST_JOBS_MAX_PAGES) {
    return { status: "network_error" };
  }
  const url = new URL(REMOTE_FIRST_JOBS_FEED_URL);
  url.searchParams.set("page", String(request.page));
  if (url.host !== "remotefirstjobs.com") return { status: "network_error" };
  return pinnedJsonFetch(url, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

// RemoteJobs.org (S1-007): v1 jobs, newest first, offset paging, at most 50 a request
// and below 200 requests an hour per IP. Only the documented parameters are sent:
// workArrangement=remote (owner decision 2 of 2026-11-07), sort=recent (the default,
// sent because the walk relies on it), limit=50, the offset of a page among the first
// 20, and requestVersion, which the API page asks for when relying on its additive
// filters: an answer of another version is a failed page, not a page of other jobs.
export const REMOTE_JOBS_ORG_PAGE_SIZE = 50;
export const REMOTE_JOBS_ORG_MAX_PAGES = 20;
export const REMOTE_JOBS_ORG_REQUEST_VERSION = "job-search-request/1";

export type RemoteJobsOrgPageResult = Readonly<
  | { status: "ok"; jobs: readonly unknown[]; hasMore: boolean }
  | { status: "rate_limited"; retryAfterSeconds: number | null }
  | { status: "server_error" }
  | { status: "network_error" }
>;

export async function fetchRemoteJobsOrgPage(request: Readonly<{
  offset: number; timeoutMs?: number;
}>): Promise<RemoteJobsOrgPageResult> {
  const { offset } = request;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % REMOTE_JOBS_ORG_PAGE_SIZE !== 0 ||
    offset >= REMOTE_JOBS_ORG_PAGE_SIZE * REMOTE_JOBS_ORG_MAX_PAGES) {
    return { status: "network_error" };
  }
  const url = new URL(REMOTE_JOBS_ORG_FEED_URL);
  url.searchParams.set("workArrangement", "remote");
  url.searchParams.set("sort", "recent");
  url.searchParams.set("limit", String(REMOTE_JOBS_ORG_PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("requestVersion", REMOTE_JOBS_ORG_REQUEST_VERSION);
  if (url.host !== "remotejobs.org") return { status: "network_error" };
  const result = await pinnedJsonBody(url, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (result.status !== "ok") return result;
  const body = result.body as {
    data?: unknown; pagination?: { offset?: unknown; has_more?: unknown };
    meta?: { search?: { request_version?: unknown } };
  } | null;
  // The envelope must answer this request: its data, its offset, its version of the
  // filters. Anything else is a failed page, never an empty one.
  if (!body || typeof body !== "object" || !Array.isArray(body.data) ||
    body.data.length > REMOTE_JOBS_ORG_PAGE_SIZE ||
    !body.pagination || typeof body.pagination !== "object" ||
    body.pagination.offset !== offset || typeof body.pagination.has_more !== "boolean" ||
    body.meta?.search?.request_version !== REMOTE_JOBS_ORG_REQUEST_VERSION) {
    return { status: "server_error" };
  }
  return { status: "ok", jobs: body.data, hasMore: body.pagination.has_more };
}

// Batch liveness check of stored Jobicy jobs (B56-001). Since 2026-10-01 the
// source documents this endpoint instead of a HEAD of the listing: up to 100
// numeric IDs per GET, each answered active, closed or unknown, including jobs
// older than the 7-day feed. Only an explicit `closed` is an inactivity signal;
// `unknown`, an ID missing from the answer, a contradictory or malformed entry
// and every failed request stay unknown and never close a record.
export const JOBICY_STATUS_URL = "https://jobicy.com/api/v2/remote-jobs/status";
export const JOBICY_STATUS_BATCH_LIMIT = 100; // documented maximum

export type JobicyStatusOutcome = "active" | "inactive" | "unknown";
export type JobicyStatusResult = Readonly<
  | { status: "ok"; outcomes: ReadonlyMap<number, JobicyStatusOutcome> }
  | { status: "rate_limited" }
  | { status: "server_error" }
  | { status: "network_error" }
>;

export async function fetchJobicyStatuses(
  ids: readonly number[], timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<JobicyStatusResult> {
  if (ids.length < 1 || ids.length > JOBICY_STATUS_BATCH_LIMIT ||
    !ids.every(id => Number.isSafeInteger(id) && id > 0)) {
    return { status: "network_error" };
  }
  const url = new URL(JOBICY_STATUS_URL);
  // The IDs are validated integers, so the commas stay literal, as documented.
  url.search = `?ids=${ids.join(",")}`;
  if (url.host !== "jobicy.com") return { status: "network_error" };
  const result = await pinnedJsonFetch(url, timeoutMs);
  if (result.status !== "ok") return result;

  const requested = new Set(ids);
  const answers = new Map<number, string>();
  for (const entry of result.jobs) {
    if (!entry || typeof entry !== "object") continue;
    const { id, status } = entry as { id?: unknown; status?: unknown };
    const numericId = typeof id === "number" ? id
      : typeof id === "string" && /^\d{1,15}$/u.test(id) ? Number(id) : Number.NaN;
    if (!requested.has(numericId) || typeof status !== "string") continue;
    const answer = status.toLowerCase();
    const previous = answers.get(numericId);
    answers.set(numericId, previous === undefined || previous === answer ? answer : "contradictory");
  }
  const outcomes = new Map<number, JobicyStatusOutcome>();
  for (const id of ids) {
    const answer = answers.get(id);
    outcomes.set(id, answer === "active" ? "active" : answer === "closed" ? "inactive" : "unknown");
  }
  return { status: "ok", outcomes };
}
