// Import scheduler core (spec section 17): pure, injectable, no clock and
// no transport of its own. Concurrency is 1 by construction — the worker
// loop attempts sources sequentially; failures back off exponentially with
// jitter and a source pauses after a failure streak instead of retrying
// forever.
export const BACKOFF_BASE_MS = 15 * 60 * 1000;
export const BACKOFF_CAP_MS = 6 * 60 * 60 * 1000;
export const PAUSE_AFTER_CONSECUTIVE_FAILURES = 5;
// Retry-After from the feeds is documented as ~60s; the base backoff is 15
// minutes, so the header is always over-respected, never violated.

export type SchedulerState = Readonly<{
  lastRunAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
}>;

export function attemptBackoffMs(consecutiveFailures: number, jitter = Math.random): number {
  if (consecutiveFailures <= 0) return 0;
  const exponent = Math.min(consecutiveFailures - 1, 8);
  const raw = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_CAP_MS);
  // ±20% jitter, clamped to the cap so jitter never shortens below the base.
  const factor = 0.9 + 0.2 * jitter();
  return Math.min(Math.round(raw * factor), BACKOFF_CAP_MS);
}

export function isPaused(state: SchedulerState): boolean {
  return state.consecutiveFailures >= PAUSE_AFTER_CONSECUTIVE_FAILURES;
}

export function nextDueAt(params: Readonly<{
  state: SchedulerState; pollIntervalMs: number; nowMs: number;
}>): number {
  const { state, pollIntervalMs, nowMs } = params;
  const candidates = [nowMs];
  if (state.lastRunAt !== null) {
    candidates.push(Date.parse(state.lastRunAt) + pollIntervalMs);
  }
  if (state.lastAttemptAt !== null && state.consecutiveFailures > 0) {
    candidates.push(Date.parse(state.lastAttemptAt) + attemptBackoffMs(state.consecutiveFailures));
  }
  return Math.max(...candidates);
}

export function shouldAttempt(params: Readonly<{
  state: SchedulerState; pollIntervalMs: number; nowMs: number;
}>): boolean {
  if (isPaused(params.state)) return false;
  return nextDueAt(params) <= params.nowMs;
}
