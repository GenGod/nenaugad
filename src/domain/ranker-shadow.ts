// Shadow ranking (design item A9).
//
// A ranker version is switched on only after it has run alongside the current
// one on the same inputs: the candidate's own feed is produced by the champion,
// and the shadow's job is to report what WOULD have changed — position shifts
// and guardrail verdicts — so the decision to switch is based on numbers from the
// live path, not only on the frozen golden set.
//
// This module is the pure core: positions in, diff out. It never touches a
// database, the clock or the feed itself, which is what makes "the shadow cannot
// change what the candidate sees" a property of the code rather than a promise.
//
// Privacy: the diff is counts. No posting ids and no profile data belong in the
// report that gets logged.

export type RankerShadowDiff = Readonly<{
  championId: string;
  candidateId: string;
  /** Items both lists contain — the comparison only makes sense over these. */
  compared: number;
  /** Items whose position differs at all. */
  moved: number;
  /** Items in either top-10 that are not the same in both. */
  top10Changed: number;
  /** Largest absolute position change across compared items. */
  maxShift: number;
  /** First position (1-based) where the two orders disagree, null when identical. */
  firstDifferenceAt: number | null;
}>;

const TOP_K = 10;

export function shadowDiff(
  championId: string,
  championIds: readonly string[],
  candidateId: string,
  candidateIds: readonly string[],
): RankerShadowDiff {
  const championPositions = new Map(championIds.map((id, index) => [id, index]));
  const candidatePositions = new Map(candidateIds.map((id, index) => [id, index]));
  let compared = 0;
  let moved = 0;
  let maxShift = 0;
  let firstDifferenceAt: number | null = null;
  for (const [id, position] of championPositions) {
    const candidate = candidatePositions.get(id);
    if (candidate === undefined) continue;
    compared += 1;
    if (candidate === position) continue;
    moved += 1;
    maxShift = Math.max(maxShift, Math.abs(candidate - position));
    if (firstDifferenceAt === null) firstDifferenceAt = Math.min(position, candidate) + 1;
  }
  const championTop = new Set(championIds.slice(0, TOP_K));
  const candidateTop = new Set(candidateIds.slice(0, TOP_K));
  let top10Changed = 0;
  for (const id of championTop) if (!candidateTop.has(id)) top10Changed += 1;
  for (const id of candidateTop) if (!championTop.has(id)) top10Changed += 1;
  return {
    championId, candidateId, compared, moved, top10Changed, maxShift, firstDifferenceAt,
  };
}
