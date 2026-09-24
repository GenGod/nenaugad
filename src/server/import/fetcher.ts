// The ONLY module in src/ allowed to open network transport
// (scripts/guardrails.mjs allowlist). The destination is pinned to the
// owner-approved Himalayas feed; this is not an arbitrary-URL proxy:
// no redirects, fixed host, opaque cursor validated as a token.
export const HIMALAYAS_FEED_URL = "https://himalayas.app/jobs/api";
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

export async function fetchHimalayasPage(request: PageRequest = {}): Promise<FetchPageResult> {
  const cursor = request.cursor ?? null;
  if (cursor !== null && !CURSOR_PATTERN.test(cursor)) {
    return { status: "network_error" };
  }
  const limit = Math.min(Math.max(request.limit ?? DEFAULT_PAGE_LIMIT, 1), DEFAULT_PAGE_LIMIT);
  const url = new URL(HIMALAYAS_FEED_URL);
  url.searchParams.set("limit", String(limit));
  if (cursor !== null) url.searchParams.set("cursor", cursor);
  // Defence in depth: the pinned base can never produce another host, and
  // redirects are refused outright.
  if (url.protocol !== "https:" || url.host !== "himalayas.app") {
    return { status: "network_error" };
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
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
