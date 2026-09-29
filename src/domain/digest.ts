// "What is new since I last looked" rules (design item A7, deterministic part).
//
// The digest answers one question with facts the product already has: when WE
// first saw a posting (A5's firstSeenAt) and when the candidate last saw the feed
// (the newest impression in the journal, A8). No cursor table and no write on a
// page render — a GET that advanced a cursor could be advanced by a prefetch or a
// retry, and a digest that lies about "new" is worse than no digest at all.
//
// Where the push part of the brief lands: an alert must never carry a closed
// posting, so the digest is computed at the moment it is read, from the same
// gates as the feed. There is no window between "scored" and "sent" in which a
// posting can close. A precomputed candidate set (research D9) earns its keep
// only once delivery leaves the app (email — owner decision) and there is
// traffic to amortise it over.
//
// Honest rules, each tested:
//   * a posting with no first-seen date, or one dated in the future (clock
//     skew), is NEVER "new": unknown is not "just now";
//   * no usable cursor means the candidate has not looked yet, so everything is
//     new to them and the page says "first look" instead of faking a window;
//   * ordering is by first-seen descending with an id tie-break, so the same
//     inputs produce the same digest (golden case 8).

export type DigestCursor = Readonly<{
  /** When the candidate last saw the feed; null = never (first look). */
  lastFeedViewAt: string | null;
}>;

export type DigestFreshness = "new" | "earlier" | "unknown_age";

export type DigestEntry = Readonly<{
  snapshotId: string;
  firstSeenAt: string | undefined;
}>;

export function classifyFreshness(
  firstSeenAt: string | undefined,
  cursor: DigestCursor,
  now: string,
): DigestFreshness {
  if (firstSeenAt === undefined) return "unknown_age";
  const seen = Date.parse(firstSeenAt);
  const reference = Date.parse(now);
  if (Number.isNaN(seen) || Number.isNaN(reference)) return "unknown_age";
  if (seen > reference) return "unknown_age";
  const viewed = cursor.lastFeedViewAt === null ? null : Date.parse(cursor.lastFeedViewAt);
  // An unusable cursor is treated as "no cursor": a broken timestamp must not
  // silently swallow every new posting.
  if (viewed === null || Number.isNaN(viewed)) return "new";
  return seen > viewed ? "new" : "earlier";
}

/** Newest first; undated postings last (they cannot be placed in time); id breaks ties. */
export function compareForDigest(a: DigestEntry, b: DigestEntry): number {
  const left = a.firstSeenAt === undefined ? null : Date.parse(a.firstSeenAt);
  const right = b.firstSeenAt === undefined ? null : Date.parse(b.firstSeenAt);
  const leftUsable = left !== null && !Number.isNaN(left) ? left : null;
  const rightUsable = right !== null && !Number.isNaN(right) ? right : null;
  if (leftUsable !== rightUsable) {
    if (leftUsable === null) return 1;
    if (rightUsable === null) return -1;
    return rightUsable - leftUsable;
  }
  if (a.snapshotId === b.snapshotId) return 0;
  return a.snapshotId < b.snapshotId ? -1 : 1;
}

/**
 * The window this digest covers, as an honest UTC label, or null for a first
 * look. Date formatting stays out of the domain on purpose: the page decides how
 * to print a moment, the rule only decides whether there IS one.
 */
export function lastFeedViewLabel(cursor: DigestCursor): string | null {
  if (cursor.lastFeedViewAt === null) return null;
  const parsed = Date.parse(cursor.lastFeedViewAt);
  if (Number.isNaN(parsed)) return null;
  return `${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
