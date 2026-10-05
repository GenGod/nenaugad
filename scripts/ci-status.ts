// CI result for coding agents: the GitHub Actions runs of the current commit, one
// line each. For an unsuccessful run it names the jobs that did not succeed and
// prints only the tail of each failed step's log, so checking CI after a push costs
// a few dozen lines of context instead of the whole log. Needs an authenticated
// `gh`. Exit code 1 when a run failed, timed out or was cancelled.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TAIL = 40;
const UNSUCCESSFUL = new Set(["failure", "cancelled", "timed_out", "startup_failure"]);

type WorkflowRun = {
  databaseId: number; workflowName: string; event: string;
  status: string; conclusion: string; url: string;
};
type WorkflowJob = { databaseId: number; name: string; conclusion: string; steps: unknown[] };

// `gh run view --log-failed` prints "<job>\t<step>\t<timestamp> <text>" per line.
// Group by step, drop timestamps and colour codes, keep the last `tail` lines.
export function summarizeFailedLog(log: string, tail = TAIL): string {
  const steps = new Map<string, string[]>();
  for (const line of log.split(/\r?\n/u)) {
    const [job, step, ...rest] = line.split("\t");
    if (!rest.length) continue;
    const key = `${job} › ${step}`;
    const lines = steps.get(key) ?? [];
    // biome-ignore lint/suspicious/noControlCharactersInRegex: colour codes start with ESC; matching it is the point
    lines.push(rest.join("\t").replace(/^\S+Z /u, "").replace(/\u001b\[[0-9;]*m/gu, ""));
    steps.set(key, lines);
  }
  return [...steps].map(([key, lines]) =>
    `── ${key} (last ${Math.min(tail, lines.length)} of ${lines.length} lines)\n${lines.slice(-tail).join("\n")}`
  ).join("\n");
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"]
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const sha = run("git", ["rev-parse", "HEAD"]).trim();
  let runs: WorkflowRun[];
  try {
    runs = JSON.parse(run("gh", ["run", "list", "--commit", sha, "--limit", "20",
      "--json", "databaseId,workflowName,event,status,conclusion,url"]));
  } catch (error) {
    const detail = (error as { stderr?: string }).stderr?.trim();
    console.error(`gh run list failed: ${detail || String(error)}`);
    process.exit(1);
  }
  if (runs.length === 0) {
    console.log(`No GitHub Actions run for ${sha.slice(0, 7)}: not pushed yet, or the push changed only Markdown.`);
  }
  for (const item of runs) {
    const state = item.status === "completed" ? item.conclusion : item.status;
    console.log(`${item.workflowName} (${item.event}): ${state} ${item.url}`);
    if (!UNSUCCESSFUL.has(item.conclusion)) continue;
    const { jobs } = JSON.parse(run("gh", ["run", "view", String(item.databaseId), "--json", "jobs"])) as
      { jobs: WorkflowJob[] };
    for (const job of jobs.filter(job => UNSUCCESSFUL.has(job.conclusion))) {
      console.log(`  ${job.name}: ${job.conclusion}`);
      // A job that never ran a step (no runner, a startup error) explains itself
      // only in its check-run annotations.
      if (job.steps.length === 0) {
        const notes = run("gh", ["api", `repos/{owner}/{repo}/check-runs/${job.databaseId}/annotations`,
          "--jq", '.[] | select(.annotation_level == "failure") | .message']).trim();
        if (notes) console.log(notes.split("\n").map(note => `    ${note}`).join("\n"));
      }
    }
    const log = summarizeFailedLog(run("gh", ["run", "view", String(item.databaseId), "--log-failed"]));
    if (log) console.log(log);
  }
  const pending = runs.filter(item => item.status !== "completed").length;
  if (pending) console.log(`${pending} run(s) still in progress: run this again later.`);
  process.exitCode = runs.some(item => UNSUCCESSFUL.has(item.conclusion)) ? 1 : 0;
}
