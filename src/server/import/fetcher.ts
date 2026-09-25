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

// Jobicy window feed: one request returns the latest window (no cursor).
// The window is NOT a full snapshot — the importer always treats it as partial.
export type JobicyWindowResult = Readonly<
  | { status: "ok"; jobs: readonly unknown[] }
  | { status: "rate_limited" }
  | { status: "server_error" }
  | { status: "network_error" }
>;

export async function fetchJobicyWindow(request: Readonly<{
  count?: number; timeoutMs?: number;
}> = {}): Promise<JobicyWindowResult> {
  const count = Math.min(Math.max(request.count ?? 200, 1), 200);
  const url = new URL(JOBICY_FEED_URL);
  url.searchParams.set("count", String(count));
  if (url.host !== "jobicy.com") return { status: "network_error" };
  const result = await pinnedJsonFetch(url, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return result.status === "ok" ? { status: "ok", jobs: result.jobs } : result;
}

// HEAD availability probe of a canonical Jobicy listing (spec 5.2/14.3):
// 404/410 is an inactivity signal; every other outcome — including 429, 5xx,
// redirects and network errors — stays unknown and never closes a record.
export type ListingCheckResult = Readonly<{ result: "active" | "inactive" | "unknown" }>;

export async function headJobicyListing(listingUrl: string, timeoutMs = 10000): Promise<ListingCheckResult> {
  let url: URL;
  try {
    url = new URL(listingUrl);
  } catch {
    return { result: "unknown" };
  }
  if (url.protocol !== "https:" || url.host !== "jobicy.com" || url.port !== "" || url.username !== "") {
    return { result: "unknown" };
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "error",
      signal: timeout.signal,
      headers: { accept: "text/html" },
    });
    if (response.status === 404 || response.status === 410) return { result: "inactive" };
    if (response.ok) return { result: "active" };
    return { result: "unknown" };
  } catch {
    return { result: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}
