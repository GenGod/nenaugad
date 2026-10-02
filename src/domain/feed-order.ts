// Which feed a journal event came from (B3/B20/B23).
//
// The client picks the feed it saw from this closed set; it never supplies the
// journal label. Both /matched tabs are ordered by the shipped deterministic
// ranker since the owner's decision No 4 (B23, 2026-10-02), so the label the
// journal stores is the ranker's own version string — the promise of B3 ("метка
// обещала быть заменённой на версионированный ранкер") is now kept, and a label
// like a feed-order string would be a claim the code no longer supports.
import { RANKER_VERSION } from "./match-ranker.ts";

export const FEED_ORDERS = {
  match: RANKER_VERSION,
  review: RANKER_VERSION,
} as const;

export type FeedKey = keyof typeof FEED_ORDERS;

export function isFeedKey(value: unknown): value is FeedKey {
  return typeof value === "string" && Object.hasOwn(FEED_ORDERS, value);
}

export function feedOrderLabel(key: FeedKey): string {
  return FEED_ORDERS[key];
}

/**
 * Which tab the feed actually renders (B4). The profile flag «Показывать вкладку
 * «Нужно уточнить»» must mean something: when it is off, a review request falls
 * back to the match tab instead of rendering a tab the candidate asked to hide.
 */
export function resolveFeedTab(requested: FeedKey, showNeedsReview: boolean): FeedKey {
  return requested === "review" && !showNeedsReview ? "match" : requested;
}
