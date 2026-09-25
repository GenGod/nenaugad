// Long-lived local import worker (S1-004). One process, sequential attempts
// (concurrency 1 per spec 17), JSON logs without secrets, graceful shutdown.
// Usage:
//   npm run worker                 — loop with a 60s tick
//   npm run worker -- --once       — single scheduling pass and exit
//   npm run worker -- --status     — per-source state and exit
//   npm run worker -- --resume <source> — clear the failure streak and exit
import { localPool, migrate } from "./db.ts";
import { localDatabaseUrl, readConfig, ConfigurationError } from "../src/server/config.ts";
import { getSourcePolicy, permissionFor } from "../src/server/source-policies.ts";
import { createPostgresPersistence } from "../src/server/storage/snapshots.ts";
import { runHimalayasImport } from "../src/server/import/himalayas-adapter.ts";
import { runJobicyImport } from "../src/server/import/jobicy-adapter.ts";
import { fetchHimalayasPage, fetchJobicyWindow } from "../src/server/import/fetcher.ts";
import {
  isPaused, nextDueAt, shouldAttempt, PAUSE_AFTER_CONSECUTIVE_FAILURES,
} from "../src/server/import/scheduler.ts";

const SOURCES = ["himalayas", "jobicy"] as const;
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const resumeSource = args[args.indexOf("--resume") + 1];
const tickSeconds = Number(args.find(a => a.startsWith("--tick-seconds="))?.slice(15) || 60);

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}

let shuttingDown = false;
process.on("SIGINT", () => { shuttingDown = true; });
process.on("SIGTERM", () => { shuttingDown = true; });

type Setup = {
  source: (typeof SOURCES)[number];
  policy: NonNullable<ReturnType<typeof getSourcePolicy>>;
  persistence: ReturnType<typeof createPostgresPersistence>;
  pausedAnnounced: boolean;
};

async function attempt(setup: Setup): Promise<void> {
  const now = new Date().toISOString();
  log({ source: setup.source, event: "attempt" });
  try {
    const report = setup.source === "himalayas"
      ? await runHimalayasImport({
          transport: cursor => fetchHimalayasPage({ cursor }),
          persistence: setup.persistence, policy: setup.policy, now,
        })
      : await runJobicyImport({
          transport: () => fetchJobicyWindow({ count: 200 }),
          persistence: setup.persistence, policy: setup.policy, now,
        });
    if (report.result === "refused_poll_interval" || report.result === "refused_disabled") {
      // Timing race or a policy flipped mid-run: not a failure, retry next tick.
      log({ source: setup.source, event: "skipped", result: report.result });
      return;
    }
    const success = report.result === "applied" || report.result === "partial";
    await setup.persistence.recordAttempt(success, now);
    const state = await setup.persistence.loadImportState();
    log({
      source: setup.source, event: success ? "ok" : "failed",
      result: report.result,
      recordsMapped: "recordsMapped" in report ? report.recordsMapped : undefined,
      recordsRejected: "recordsRejected" in report ? report.recordsRejected : undefined,
      changes: report.changes.length,
      deletedExpired: report.deletedExpired,
      consecutiveFailures: state?.consecutiveFailures ?? 0,
    });
    if ((state?.consecutiveFailures ?? 0) >= PAUSE_AFTER_CONSECUTIVE_FAILURES) {
      log({ source: setup.source, event: "paused",
        hint: `npm run worker -- --resume ${setup.source}` });
    }
  } catch (error) {
    await setup.persistence.recordAttempt(false, now).catch(() => undefined);
    const state = await setup.persistence.loadImportState().catch(() => null);
    log({
      source: setup.source, event: "failed", result: "exception",
      code: error instanceof ConfigurationError ? error.message : "IMPORT_ERROR",
      consecutiveFailures: state?.consecutiveFailures ?? 1,
    });
  }
}

async function main(): Promise<void> {
  readConfig(process.env);
  const pool = localPool(localDatabaseUrl(process.env.DATABASE_URL));
  await migrate(pool);
  const setups: Setup[] = [];
  for (const source of SOURCES) {
    const policy = getSourcePolicy(source);
    if (!policy) continue;
    setups.push({
      source, policy,
      persistence: createPostgresPersistence(pool, policy),
      pausedAnnounced: false,
    });
  }

  if (flag("status")) {
    for (const setup of setups) {
      const state = await setup.persistence.loadImportState();
      const nowMs = Date.now();
      log({
        event: "status", source: setup.source,
        enabled: setup.policy.enabled,
        fetch: permissionFor(setup.policy, "fetch", new Date().toISOString()),
        paused: state ? isPaused({
          lastRunAt: state.lastRunAt, lastAttemptAt: state.lastAttemptAt ?? null,
          consecutiveFailures: state.consecutiveFailures ?? 0,
        }) : false,
        consecutiveFailures: state?.consecutiveFailures ?? 0,
        lastRunAt: state?.lastRunAt ?? null,
        lastAttemptAt: state?.lastAttemptAt ?? null,
        nextDueAt: state
          ? new Date(nextDueAt({
              state: {
                lastRunAt: state.lastRunAt,
                lastAttemptAt: state.lastAttemptAt ?? null,
                consecutiveFailures: state.consecutiveFailures ?? 0,
              },
              pollIntervalMs: setup.policy.min_poll_interval_seconds * 1000,
              nowMs,
            })).toISOString()
          : new Date(nowMs).toISOString(),
      });
    }
    await pool.end();
    return;
  }

  if (flag("resume") && typeof resumeSource === "string" && SOURCES.includes(resumeSource as never)) {
    const setup = setups.find(item => item.source === resumeSource);
    if (!setup) throw new ConfigurationError("UNKNOWN_SOURCE");
    await setup.persistence.resumeAttempts();
    log({ event: "resumed", source: resumeSource });
    await pool.end();
    return;
  }

  log({ event: "worker_start", sources: setups.map(s => s.source), tickSeconds });
  while (!shuttingDown) {
    const nowMs = Date.now();
    for (const setup of setups) {
      if (shuttingDown) break;
      if (permissionFor(setup.policy, "fetch", new Date().toISOString()) !== "allowed") continue;
      const state = await setup.persistence.loadImportState();
      const schedulerState = {
        lastRunAt: state?.lastRunAt ?? null,
        lastAttemptAt: state?.lastAttemptAt ?? null,
        consecutiveFailures: state?.consecutiveFailures ?? 0,
      };
      if (isPaused(schedulerState)) {
        if (!setup.pausedAnnounced) {
          log({ source: setup.source, event: "paused",
            hint: `npm run worker -- --resume ${setup.source}` });
          setup.pausedAnnounced = true;
        }
        continue;
      }
      setup.pausedAnnounced = false;
      if (shouldAttempt({
        state: schedulerState,
        pollIntervalMs: setup.policy.min_poll_interval_seconds * 1000,
        nowMs,
      })) {
        await attempt(setup);
      }
    }
    if (flag("once")) break;
    for (let slept = 0; slept < tickSeconds * 1000 && !shuttingDown; slept += 1000) {
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, tickSeconds * 1000 - slept)));
    }
  }
  log({ event: "worker_stop" });
  await pool.end();
}

main().catch(error => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(), event: "worker_failed",
    code: error instanceof ConfigurationError ? error.message : "WORKER_ERROR",
  }));
  process.exit(1);
});
