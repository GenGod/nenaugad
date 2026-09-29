// Freshness signal v1 (design item A5).
//
// Why an explicit decay instead of "new/old" bins: a posting one day old and one
// six days old are not the same opportunity, and a bin boundary would silently
// make them equal. The decay is exponential with a documented half-life, so the
// number stays explainable ("a listing found today is worth +15, halved every
// week, effectively gone after a month").
//
// Honesty rules:
//   * the age is measured from OUR first sighting (`firstSeenAt`, the import
//     pipeline's observation), never from a source's claimed publication date —
//     a board can relabel a posting as new, we cannot fake when we first saw it;
//   * an absent timestamp contributes NOTHING (no boost), it is never treated as
//     "fresh"; unknown is not a value;
//   * a future timestamp counts as age 0: clock skew between hosts must not
//     reject an otherwise valid posting.
//
// Additive DEMOTION, never a boost — and this is a measured decision, not a
// stylistic one. Two earlier shapes were tried on the golden set (2026-09-29):
//   * an additive positive boost promoted a fresh but irrelevant listing above
//     relevant ones for neighbouring profiles (devops NDCG@10 0.995 -> 0.992,
//     ml 0.853 -> 0.846);
//   * a pure tie-break did the same inside equal-score groups (ml 0.853 ->
//     0.849) because relevance and score are not the same thing.
// Demotion can only push stale listings down, so a wrong call costs at most the
// stale listing's own position and never lifts anything above a better match —
// which is also exactly the ghost-postings hygiene the research asked for.

export const FRESHNESS_MAX_DEMOTION = 15;
export const FRESHNESS_HALF_LIFE_DAYS = 7;

const DAY_MS = 86_400_000;

/** Days since first sighting; null when either timestamp is unparseable. */
export function ageInDays(firstSeenAt: string, now: string): number | null {
  const seen = Date.parse(firstSeenAt);
  const reference = Date.parse(now);
  if (Number.isNaN(seen) || Number.isNaN(reference)) return null;
  const days = (reference - seen) / DAY_MS;
  return days < 0 ? 0 : days;
}

/**
 * Freshness points for the ranker: 0 while the listing is fresh, growing
 * downwards smoothly toward -FRESHNESS_MAX_DEMOTION as it ages (half of the
 * demotion is reached after FRESHNESS_HALF_LIFE_DAYS, and it never overshoots).
 * Undefined or unparseable timestamps return 0 — no evidence, no demotion: we do
 * not punish a listing for a gap in our own bookkeeping.
 */
export function freshnessDemotion(firstSeenAt: string | undefined, now: string): number {
  if (firstSeenAt === undefined) return 0;
  const age = ageInDays(firstSeenAt, now);
  if (age === null) return 0;
  const demotion = -Math.round(FRESHNESS_MAX_DEMOTION * (1 - 0.5 ** (age / FRESHNESS_HALF_LIFE_DAYS)));
  // Normalise negative zero: "-0" and "0" compare unequal under Object.is and
  // would make strict assertions (and any future Map/JSON handling) surprising.
  return demotion === 0 ? 0 : demotion;
}

const DAY_FORMS = ["день", "дня", "дней"] as const;

function pluralDays(days: number): string {
  const mod100 = days % 100;
  if (mod100 >= 11 && mod100 <= 14) return DAY_FORMS[2];
  const mod10 = days % 10;
  if (mod10 === 1) return DAY_FORMS[0];
  if (mod10 >= 2 && mod10 <= 4) return DAY_FORMS[1];
  return DAY_FORMS[2];
}

/**
 * Candidate-facing label. Says "found" (by us), not "published" (by the source):
 * the product shows what it actually observed. Returns null when the timestamp
 * is unusable, and callers then show nothing rather than a guess.
 */
export function firstSeenLabel(firstSeenAt: string | undefined, now: string): string | null {
  if (firstSeenAt === undefined) return null;
  const age = ageInDays(firstSeenAt, now);
  if (age === null) return null;
  const days = Math.floor(age);
  if (days === 0) return "найдена сегодня";
  if (days >= 31) return "найдена более месяца назад";
  return `найдена ${days} ${pluralDays(days)} назад`;
}
