// Seen-set rules for the feed (design item A6, seen-set part).
//
// The candidate already looked at a posting and did nothing about it. That is
// NOT the same as "not interested" (research, part 2 C1): postings are
// perishable and the candidate's own situation changes, so "no action" only
// means "not now". The posting comes back when it CHANGES, or when the window
// expires — whichever happens first. An explicit hide is a different, permanent
// statement and lives in its own table (hidden_jobs, migration 0008).
//
// What this module is not: a ranking weight. It answers a yes/no question about
// what belongs in the feed at all; the weighted demotion of the neighbourhood of
// hidden postings is a separate module (negative-preference.ts).
//
// Honesty rules, each with a test:
//   * no evidence of what was shown (no fingerprint on either side, unusable or
//     future timestamps) → the posting is SHOWN. We never suppress on a guess;
//     a wrongly hidden posting is a silent loss for the candidate;
//   * a click or a save ("acted") lifts the rule entirely — the candidate did
//     something, and re-showing a posting they engaged with is not noise;
//   * the clock is always passed in, never read here, so the same journal state
//     and the same reference time produce the same decision (golden case 8).

export const SEEN_TTL_DAYS = 14;
const DAY_MS = 86_400_000;
export const SEEN_TTL_MS = SEEN_TTL_DAYS * DAY_MS;

/**
 * How far ahead of the caller's clock a show timestamp may be before it stops
 * being believed. The journal stamps rows with the DATABASE clock while callers
 * pass their own, so a small difference is normal operation rather than evidence
 * of a broken clock; without this, a database a second ahead would silently
 * switch the whole rule off. Beyond the tolerance the timestamp is unusable and
 * the posting is shown.
 */
export const SEEN_CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type SeenJournalState = Readonly<{
  /** When the posting was last shown to this candidate (ISO 8601). */
  lastShownAt: string;
  /** Fingerprint of the content at that moment (job_snapshots.content_hash). */
  shownContentHash: string | null;
}>;

export type SeenOutcome =
  | Readonly<{
    suppress: false;
    reason: "unseen" | "acted" | "changed" | "window_expired" | "unknown";
  }>
  | Readonly<{
    suppress: true;
    reason: "seen_recently";
    /** When the posting returns even without a content change (ISO 8601). */
    returnAt: string;
  }>;

/**
 * Decides whether one candidate posting stays out of the feed for this user.
 * `contentHash` is the posting's fingerprint TODAY; `state` is what the journal
 * recorded when it was shown.
 */
export function decideSeen(params: Readonly<{
  state: SeenJournalState | undefined;
  contentHash: string | null;
  acted: boolean;
  now: string;
}>): SeenOutcome {
  if (!params.state) return { suppress: false, reason: "unseen" };
  if (params.acted) return { suppress: false, reason: "acted" };
  const shown = params.state.shownContentHash;
  if (shown === null || params.contentHash === null) {
    // Nothing to compare: we cannot prove the candidate saw THIS content.
    return { suppress: false, reason: "unknown" };
  }
  if (shown !== params.contentHash) return { suppress: false, reason: "changed" };
  const lastShown = Date.parse(params.state.lastShownAt);
  const reference = Date.parse(params.now);
  if (Number.isNaN(lastShown) || Number.isNaN(reference)) return { suppress: false, reason: "unknown" };
  const elapsed = reference - lastShown;
  // A timestamp far in the future is clock skew between hosts, not evidence that
  // the posting was seen; a small one is just two clocks disagreeing by seconds,
  // and the posting really was shown.
  if (elapsed < -SEEN_CLOCK_SKEW_TOLERANCE_MS) return { suppress: false, reason: "unknown" };
  const sinceShown = elapsed < 0 ? 0 : elapsed;
  if (sinceShown >= SEEN_TTL_MS) return { suppress: false, reason: "window_expired" };
  return {
    suppress: true, reason: "seen_recently",
    returnAt: new Date(lastShown + SEEN_TTL_MS).toISOString(),
  };
}
