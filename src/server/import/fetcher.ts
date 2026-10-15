// The ONLY module in src/ allowed to open network transport
// (scripts/guardrails.mjs allowlist). Destinations are pinned to
// owner-approved feeds; this is not an arbitrary-URL proxy:
// no redirects, fixed hosts, opaque tokens validated as tokens.
export const HIMALAYAS_FEED_URL = "https://himalayas.app/jobs/api";
export const JOBICY_FEED_URL = "https://jobicy.com/api/v2/remote-jobs";
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

async function pinnedJsonFetch(url: URL, timeoutMs: number): Promise<FetchPageResult> {
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
  if (response.status === 429) return { status: "rate_limited" };
  if (!response.ok) return { status: "server_error" };
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return { status: "server_error" };
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) return { status: "server_error" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: "server_error" };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
    return { status: "server_error" };
  }
  const rawCursor = (parsed as { nextCursor?: unknown }).nextCursor;
  const nextCursor = typeof rawCursor === "string" && rawCursor.length > 0
    ? (CURSOR_PATTERN.test(rawCursor) ? rawCursor : null)
    : null;
  return { status: "ok", jobs: (parsed as { jobs: unknown[] }).jobs, nextCursor };
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
