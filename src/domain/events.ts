// Interaction journal payloads (design item A8).
//
// Pure validation and normalisation for what gets written to job_events. Kept
// out of the service so the rules are unit-testable without a database, and
// deliberately strict: a journal a client can pollute with arbitrary strings is
// worse than no journal, because later ranking decisions would trust it.
//
// Privacy: nothing here accepts free text. Ids, a type and a position — that is
// the whole vocabulary. Show-time propensities are computed server-side from the
// scores the feed ordered by (B2/B20): the client does not get to send them.

export const EVENT_TYPES = ["impression", "click"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const SNAPSHOT_ID = /^(himalayas|jobicy):[a-z0-9-]{1,150}$/u;
const MAX_EVENTS_PER_REQUEST = 50;

export type EventItem = Readonly<{
  snapshotId: string;
  position: number | null;
}>;

export class EventValidationError extends Error {
  constructor(code: string) {
    super(code);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalised show probability used as the propensity value: the item's score
 * relative to the best score of the same list, clamped to [0, 1]. Returns null
 * when there is nothing to normalise (no scores, non-positive best score) — an
 * unknown propensity stays unknown instead of becoming 1.0.
 */
export function normalisePropensity(score: number | null, bestScore: number | null): number | null {
  if (score === null || bestScore === null) return null;
  if (!Number.isFinite(score) || !Number.isFinite(bestScore)) return null;
  if (bestScore <= 0) return null;
  const value = score / bestScore;
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

/** Validates one journal batch. Throws EventValidationError with a fixed code. */
export function parseEventBatch(value: unknown): readonly EventItem[] {
  if (!isRecord(value)) throw new EventValidationError("INVALID_EVENT_BODY");
  const type = value.type;
  if (typeof type !== "string" || !(EVENT_TYPES as readonly string[]).includes(type)) {
    throw new EventValidationError("INVALID_EVENT_TYPE");
  }
  const items = value.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_EVENTS_PER_REQUEST) {
    throw new EventValidationError("INVALID_EVENT_ITEMS");
  }
  const parsed: EventItem[] = [];
  for (const raw of items) {
    if (!isRecord(raw)) throw new EventValidationError("INVALID_EVENT_ITEM");
    const snapshotId = raw.snapshotId;
    if (typeof snapshotId !== "string" || !SNAPSHOT_ID.test(snapshotId)) {
      throw new EventValidationError("INVALID_SNAPSHOT_ID");
    }
    let position: number | null = null;
    if (raw.position !== null && raw.position !== undefined) {
      if (!Number.isInteger(raw.position) || (raw.position as number) < 0) {
        throw new EventValidationError("INVALID_POSITION");
      }
      position = raw.position as number;
    }
    // The journal's propensity is computed by the server from the cached scores
    // the feed ordered by (B2/B20). A payload that carries one is refused, not
    // quietly overridden: a client must not even appear to supply it.
    if ("propensity" in raw) throw new EventValidationError("PROPENSITY_NOT_ACCEPTED");
    parsed.push({ snapshotId, position });
  }
  // One snapshot per batch: duplicates would double-count the same interaction.
  const seen = new Set(parsed.map(item => item.snapshotId));
  if (seen.size !== parsed.length) throw new EventValidationError("DUPLICATE_EVENT_ITEM");
  return parsed;
}
