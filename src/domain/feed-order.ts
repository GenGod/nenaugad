// What ordered the feed a candidate saw (B3/B20).
//
// The journal's ranker_version column carries one of these server-owned labels.
// They are feed-order labels, not ranker versions: the product path orders by
// cached AI scores (then catalog order) and by catalog order for the review tab,
// so a label like a ranker version would be a claim we cannot support. The
// client picks the feed it saw from this closed set; it can never write an
// arbitrary string into the journal.
export const FEED_ORDERS = {
  match: "feed-ai-score-then-catalog@1",
  review: "feed-catalog-order@1",
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
