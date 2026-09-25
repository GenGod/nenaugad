import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptBackoffMs, isPaused, nextDueAt, shouldAttempt,
  BACKOFF_BASE_MS, BACKOFF_CAP_MS, PAUSE_AFTER_CONSECUTIVE_FAILURES,
} from "../../src/server/import/scheduler.ts";

const NOW = Date.parse("2026-09-25T12:00:00.000Z");
const SIX_HOURS = 6 * 60 * 60 * 1000;

test("backoff grows exponentially, caps at 6h, zero without failures", () => {
  assert.equal(attemptBackoffMs(0), 0);
  const noJitter = () => 0.5; // factor = 0.9 + 0.2*0.5 = 1.0 — deterministic
  assert.equal(attemptBackoffMs(1, noJitter), BACKOFF_BASE_MS);
  assert.equal(attemptBackoffMs(2, noJitter), 2 * BACKOFF_BASE_MS);
  assert.equal(attemptBackoffMs(3, noJitter), 4 * BACKOFF_BASE_MS);
  assert.equal(attemptBackoffMs(10, noJitter), BACKOFF_CAP_MS);
  assert.equal(attemptBackoffMs(20, noJitter), BACKOFF_CAP_MS);
  // Jitter stays within ±20% and never exceeds the cap.
  for (let i = 0; i < 20; i += 1) {
    const jittered = attemptBackoffMs(2);
    assert.ok(jittered >= 0.9 * 2 * BACKOFF_BASE_MS && jittered <= Math.min(1.2 * 2 * BACKOFF_BASE_MS, BACKOFF_CAP_MS));
  }
});

test("next due time is the max of poll window and failure backoff", () => {
  const fresh = nextDueAt({
    state: { lastRunAt: null, lastAttemptAt: null, consecutiveFailures: 0 },
    pollIntervalMs: SIX_HOURS, nowMs: NOW,
  });
  assert.equal(fresh, NOW); // never fetched: due immediately

  const insideWindow = nextDueAt({
    state: { lastRunAt: new Date(NOW - 60_000).toISOString(), lastAttemptAt: null, consecutiveFailures: 0 },
    pollIntervalMs: SIX_HOURS, nowMs: NOW,
  });
  assert.equal(insideWindow, NOW - 60_000 + SIX_HOURS);

  const failureBackoff = nextDueAt({
    state: {
      lastRunAt: new Date(NOW - 7 * SIX_HOURS).toISOString(), // window long passed
      lastAttemptAt: new Date(NOW - 60_000).toISOString(),
      consecutiveFailures: 2,
    },
    pollIntervalMs: SIX_HOURS, nowMs: NOW,
  });
  assert.ok(failureBackoff > NOW); // backoff dominates after failures
});

test("shouldAttempt respects window, backoff and the pause threshold", () => {
  const dueNow = shouldAttempt({
    state: { lastRunAt: null, lastAttemptAt: null, consecutiveFailures: 0 },
    pollIntervalMs: SIX_HOURS, nowMs: NOW,
  });
  assert.equal(dueNow, true);
  const notDue = shouldAttempt({
    state: { lastRunAt: new Date(NOW).toISOString(), lastAttemptAt: null, consecutiveFailures: 0 },
    pollIntervalMs: SIX_HOURS, nowMs: NOW + SIX_HOURS - 1000,
  });
  assert.equal(notDue, false);

  assert.equal(isPaused({ lastRunAt: null, lastAttemptAt: null, consecutiveFailures: 0 }), false);
  assert.equal(isPaused({ lastRunAt: null, lastAttemptAt: null,
    consecutiveFailures: PAUSE_AFTER_CONSECUTIVE_FAILURES }), true);
  const paused = shouldAttempt({
    state: { lastRunAt: new Date(0).toISOString(), lastAttemptAt: new Date(0).toISOString(),
      consecutiveFailures: PAUSE_AFTER_CONSECUTIVE_FAILURES },
    pollIntervalMs: SIX_HOURS, nowMs: NOW + 10 * SIX_HOURS,
  });
  assert.equal(paused, false); // paused beats any due time
});

test("memory persistence records attempts and resumes (restart-safe shape)", async () => {
  const { createMemoryPersistence } = await import("../../src/server/import/himalayas-adapter.ts");
  const memory = createMemoryPersistence();
  await memory.recordAttempt(false, "2026-09-25T12:00:00.000Z");
  await memory.recordAttempt(false, "2026-09-25T13:00:00.000Z");
  let state = await memory.loadImportState();
  assert.equal(state?.consecutiveFailures, 2);
  assert.equal(state?.lastAttemptAt, "2026-09-25T13:00:00.000Z");
  assert.equal(state?.lastRunAt, null); // a failure never consumes the window
  await memory.recordAttempt(true, "2026-09-25T14:00:00.000Z");
  state = await memory.loadImportState();
  assert.equal(state?.consecutiveFailures, 0);
  await memory.recordAttempt(false, "2026-09-25T15:00:00.000Z");
  await memory.resumeAttempts();
  state = await memory.loadImportState();
  assert.equal(state?.consecutiveFailures, 0);
});
