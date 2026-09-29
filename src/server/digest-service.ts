// Digest service (design item A7, deterministic part).
//
// The digest is built from the SAME gate pipeline as the feed (matchedForUser):
// eligibility, dedup, personal hides and the seen-set all apply, so a closed,
// hidden or already-seen posting cannot appear here either. On top of that it
// splits the visible postings by the candidate's last feed view (the journal's
// newest impression, A8) into "new since then" and "already shown earlier".
//
// Deliberately no store of its own: no cursor table (the journal already has the
// fact), no candidate set (a catalog of this size is cheap to read live, and a
// precomputed set is exactly what would let a closed posting slip through).
import { classifyFreshness, compareForDigest, type DigestCursor, type DigestFreshness } from "../domain/digest.ts";
import { firstSeenLabel } from "../domain/freshness.ts";
import { lastImpressionAt } from "./events-service.ts";
import { matchedForUser } from "./matching-service.ts";
import { snapshotPool } from "./storage/snapshots.ts";
import type { Pool } from "pg";

/** Same cap as the feed: a digest is a short list, not the whole catalog. */
export const MAX_DIGEST_ITEMS = 50;

export type DigestItem = Readonly<{
  snapshotId: string;
  title: string;
  company: string;
  sourceName: string;
  applyUrl: string;
  firstSeenAt: string | undefined;
  /** Honest "found N days ago" label (A5), null when the age is unknown. */
  ageLabel: string | null;
  status: "eligible" | "needs_review";
  freshness: DigestFreshness;
}>;

export type DigestResult = Readonly<{
  status: "ok" | "no_profile" | "fixture_backend";
  cursor: DigestCursor;
  newCount: number;
  earlierCount: number;
  /** New first (A7's subject), then the rest; unknown ages last. */
  items: readonly DigestItem[];
  /** Postings the seen-set kept out of the feed (A6) — the empty state says why. */
  seenSuppressed: Readonly<{ eligible: number; needsReview: number }>;
}>;

export async function digestForUser(
  userId: string,
  options: Readonly<{ pool?: Pool; now?: string }> = {},
): Promise<DigestResult> {
  const pool = options.pool ?? snapshotPool();
  const now = options.now ?? new Date().toISOString();
  const matched = await matchedForUser(userId, { pool });
  const empty: DigestResult = {
    status: matched.status === "ok" ? "ok" : matched.status,
    cursor: { lastFeedViewAt: null },
    newCount: 0, earlierCount: 0, items: [], seenSuppressed: matched.seenSuppressed,
  };
  if (matched.status !== "ok") return empty;
  const cursor: DigestCursor = {
    lastFeedViewAt: await lastImpressionAt(pool, userId),
  };
  const items: DigestItem[] = [
    ...matched.eligible.map(job => ({ job, status: "eligible" as const })),
    ...matched.needsReview.map(job => ({ job, status: "needs_review" as const })),
  ].map(entry => ({
    snapshotId: entry.job.card.id,
    title: entry.job.card.title,
    company: entry.job.card.company,
    sourceName: entry.job.card.source.displayName,
    applyUrl: entry.job.card.apply.url,
    firstSeenAt: entry.job.card.firstSeenAt,
    ageLabel: firstSeenLabel(entry.job.card.firstSeenAt, now),
    status: entry.status,
    freshness: classifyFreshness(entry.job.card.firstSeenAt, cursor, now),
  })).sort(compareForDigest);
  const fresh = items.filter(item => item.freshness === "new");
  const earlier = items.filter(item => item.freshness !== "new");
  return {
    status: "ok", cursor,
    newCount: fresh.length,
    earlierCount: earlier.length,
    items: [...fresh, ...earlier].slice(0, MAX_DIGEST_ITEMS),
    seenSuppressed: matched.seenSuppressed,
  };
}
